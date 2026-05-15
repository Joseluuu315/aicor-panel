-- Aicor Panel / Chatbot multi-cliente
-- Ejecutar en Supabase SQL Editor.
-- Requiere pgvector para almacenar embeddings de la base de conocimiento.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Clientes que han comprado/usan un bot.
CREATE TABLE IF NOT EXISTS bot_clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT NOT NULL UNIQUE,
    company_name TEXT NOT NULL,
    bot_name TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
    allowed_domains TEXT[] NOT NULL DEFAULT '{}',
    max_scrape_urls INT NOT NULL DEFAULT 2 CHECK (max_scrape_urls BETWEEN 1 AND 2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Dominios autorizados por cliente. Solo se aceptan .com y .es.
CREATE TABLE IF NOT EXISTS bot_client_domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES bot_clients(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT bot_client_domains_tld_check CHECK (domain ~* '^[a-z0-9.-]+\.(com|es)$'),
    CONSTRAINT bot_client_domains_unique UNIQUE (client_id, domain)
);

CREATE OR REPLACE FUNCTION enforce_two_domains_per_client()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (
        SELECT COUNT(*)
        FROM bot_client_domains
        WHERE client_id = NEW.client_id
          AND id <> COALESCE(NEW.id, uuid_nil())
    ) >= 2 THEN
        RAISE EXCEPTION 'Cada cliente solo puede tener 2 dominios/URLs de scraping';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_two_domains_per_client ON bot_client_domains;
CREATE TRIGGER trg_two_domains_per_client
BEFORE INSERT OR UPDATE ON bot_client_domains
FOR EACH ROW
EXECUTE FUNCTION enforce_two_domains_per_client();

-- Ejecuciones de scraping lanzadas desde la web.
CREATE TABLE IF NOT EXISTS scraping_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES bot_clients(id) ON DELETE CASCADE,
    execution_id TEXT,
    requested_urls TEXT[] NOT NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'error')),
    result_count INT NOT NULL DEFAULT 0,
    error_detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ
);

-- Endpoints externos para leads. Se pueden definir por cliente.
CREATE TABLE IF NOT EXISTS bot_endpoints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES bot_clients(id) ON DELETE CASCADE,
    key TEXT,
    label TEXT,
    url TEXT,
    method TEXT DEFAULT 'POST',
    api_key_header TEXT,
    api_key_value TEXT,
    active BOOLEAN DEFAULT true,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bot_endpoints_client_id ON bot_endpoints(client_id);

-- Leads capturados por el bot, aislados por cliente.
CREATE TABLE IF NOT EXISTS lead_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES bot_clients(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    nombre TEXT,
    email TEXT,
    telefono TEXT,
    producto_interes TEXT,
    contexto TEXT,
    origen TEXT,
    estado TEXT,
    error_detalle TEXT,
    respuesta_api TEXT
);

CREATE INDEX IF NOT EXISTS idx_lead_logs_client_id_created_at ON lead_logs(client_id, created_at DESC);

-- Transcripts de conversaciones, aislados por cliente.
CREATE TABLE IF NOT EXISTS transcript_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES bot_clients(id) ON DELETE CASCADE,
    file_url TEXT,
    storage_path TEXT,
    file_name TEXT,
    lead_nombre TEXT,
    lead_email TEXT,
    message_count INT4,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    upload_status TEXT,
    upload_response TEXT
);

CREATE INDEX IF NOT EXISTS idx_transcript_logs_client_id_created_at ON transcript_logs(client_id, created_at DESC);

-- Historial del chat. session_id no basta: siempre se consulta con client_id.
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES bot_clients(id) ON DELETE CASCADE,
    session_id TEXT,
    role TEXT CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_client_session ON chat_sessions(client_id, session_id, created_at);

-- Base de conocimiento vectorial. Cada chunk pertenece a un cliente.
CREATE TABLE IF NOT EXISTS documents (
    id BIGSERIAL PRIMARY KEY,
    client_id UUID REFERENCES bot_clients(id) ON DELETE CASCADE,
    source_url TEXT,
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    embedding VECTOR
);

CREATE INDEX IF NOT EXISTS idx_documents_client_id ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_metadata_gin ON documents USING GIN (metadata);

CREATE OR REPLACE FUNCTION documents_sync_client_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.client_id IS NULL AND NEW.metadata ? 'client_id' THEN
        NEW.client_id := NULLIF(NEW.metadata->>'client_id', '')::UUID;
    END IF;

    IF NEW.source_url IS NULL AND NEW.metadata ? 'source_url' THEN
        NEW.source_url := NULLIF(NEW.metadata->>'source_url', '');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_sync_client_id ON documents;
CREATE TRIGGER trg_documents_sync_client_id
BEFORE INSERT OR UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION documents_sync_client_id();

-- Configuracion por cliente. client_id NULL permite valores globales del panel.
CREATE TABLE IF NOT EXISTS bot_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES bot_clients(id) ON DELETE CASCADE,
    key TEXT,
    value TEXT,
    label TEXT,
    description TEXT,
    category TEXT,
    type TEXT,
    options JSONB,
    sort_order INT4,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT bot_config_client_key_unique UNIQUE (client_id, key)
);

CREATE INDEX IF NOT EXISTS idx_bot_config_client_id ON bot_config(client_id);

-- Valida desde SQL el limite duro de dos URLs y TLD .com/.es.
CREATE OR REPLACE FUNCTION validate_scrape_urls(urls TEXT[])
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    u TEXT;
    host TEXT;
BEGIN
    IF urls IS NULL OR array_length(urls, 1) IS NULL THEN
        RETURN FALSE;
    END IF;

    IF array_length(urls, 1) > 2 THEN
        RETURN FALSE;
    END IF;

    FOREACH u IN ARRAY urls LOOP
        host := lower(regexp_replace(u, '^https?://(www\.)?([^/:?#]+).*$', '\2'));
        IF host !~ '^[a-z0-9.-]+\.(com|es)$' THEN
            RETURN FALSE;
        END IF;
    END LOOP;

    RETURN TRUE;
END;
$$;

ALTER TABLE scraping_jobs
    DROP CONSTRAINT IF EXISTS scraping_jobs_urls_check;

ALTER TABLE scraping_jobs
    ADD CONSTRAINT scraping_jobs_urls_check CHECK (validate_scrape_urls(requested_urls));

-- Funcion usada por LangChain/Supabase Vector Store.
-- El filtro JSONB debe incluir {"client_id":"uuid-del-cliente"} para no mezclar conocimiento.
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding VECTOR,
    match_count INT DEFAULT 5,
    filter JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    id BIGINT,
    content TEXT,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
DECLARE
    filter_client_id UUID;
BEGIN
    filter_client_id := NULLIF(filter->>'client_id', '')::UUID;

    IF filter_client_id IS NULL THEN
        RAISE EXCEPTION 'match_documents requiere filter.client_id para aislar datos por cliente';
    END IF;

    RETURN QUERY
    SELECT
        d.id,
        d.content,
        d.metadata,
        1 - (d.embedding <=> query_embedding) AS similarity
    FROM documents d
    WHERE d.client_id = filter_client_id
      AND d.embedding IS NOT NULL
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Variante directa por si se usa RPC manual desde n8n.
CREATE OR REPLACE FUNCTION match_documents_by_client(
    query_embedding VECTOR,
    p_client_id UUID,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id BIGINT,
    content TEXT,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        d.id,
        d.content,
        d.metadata,
        1 - (d.embedding <=> query_embedding) AS similarity
    FROM documents d
    WHERE d.client_id = p_client_id
      AND d.embedding IS NOT NULL
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Usuarios del panel con roles. El superadmin NO tiene fila aquí;
-- se autentica sólo con las credenciales del .env (VITE_PANEL_USER/PASS).
-- Roles: 'admin' (ve todos los datos de su client_id, sin gestión de users)
--        'user'  (solo dashboard y transcripts de su client_id)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS panel_users (
    id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    client_id   UUID REFERENCES bot_clients(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_panel_users_client_id ON panel_users(client_id);
CREATE INDEX IF NOT EXISTS idx_panel_users_role      ON panel_users(role);

-- Trigger para mantener updated_at al día
CREATE OR REPLACE FUNCTION panel_users_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_panel_users_updated_at ON panel_users;
CREATE TRIGGER trg_panel_users_updated_at
BEFORE UPDATE ON panel_users
FOR EACH ROW EXECUTE FUNCTION panel_users_set_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
-- Cada usuario autenticado (admin / user) solo puede leer su propia fila.
-- El superadmin nunca usa Supabase Auth, así que no necesita RLS aquí.
ALTER TABLE panel_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS panel_users_self_read  ON panel_users;
DROP POLICY IF EXISTS panel_users_self_write ON panel_users;

-- Un usuario logueado puede leer su propia fila
CREATE POLICY panel_users_self_read
ON panel_users FOR SELECT
USING (auth.uid() = id);

-- El service_role (usado por el panel admin para crear usuarios) puede hacer todo
-- (se activa al usar la SUPABASE_SERVICE_ROLE_KEY en el backend; el anon key no puede)

-- ─── Función helper: obtener perfil del usuario actual ────────────────────────
CREATE OR REPLACE FUNCTION get_my_panel_profile()
RETURNS TABLE (role TEXT, client_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT pu.role, pu.client_id
    FROM panel_users pu
    WHERE pu.id = auth.uid()
    LIMIT 1;
$$;

-- ─── RPC para que el superadmin cree usuarios y clientes ──────────────────────
-- Esta función usa SECURITY DEFINER para saltarse el RLS, permitiendo al
-- superadmin (que usa la key anon) crear registros en bot_clients y panel_users.
CREATE OR REPLACE FUNCTION admin_setup_user(
    p_company_name TEXT,
    p_user_id UUID,
    p_email TEXT,
    p_role TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client_id UUID;
    v_slug TEXT;
BEGIN
    -- 1. Normalizar slug
    v_slug := lower(regexp_replace(p_company_name, '\s+', '-', 'g'));
    v_slug := regexp_replace(v_slug, '[^a-z0-9-]', '', 'g');

    -- 2. Buscar si la empresa ya existe
    SELECT id INTO v_client_id FROM bot_clients WHERE company_name ILIKE p_company_name LIMIT 1;
    
    -- 3. Si no existe, crearla
    IF v_client_id IS NULL THEN
        -- Evitar colisiones de slug añadiendo un sufijo aleatorio si ya existe
        IF EXISTS (SELECT 1 FROM bot_clients WHERE slug = v_slug) THEN
            v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
        END IF;

        INSERT INTO bot_clients (company_name, slug, status)
        VALUES (p_company_name, v_slug, 'active')
        RETURNING id INTO v_client_id;
    END IF;

    -- 4. Insertar el perfil del usuario
    INSERT INTO panel_users (id, email, role, client_id)
    VALUES (p_user_id, p_email, p_role, v_client_id);

    RETURN v_client_id;
END;
$$;

-- ─── RPCs para gestión de usuarios por Superadmin (bypassing RLS) ────────────

-- Obtener todos los usuarios
CREATE OR REPLACE FUNCTION admin_get_all_users()
RETURNS SETOF panel_users
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT * FROM panel_users ORDER BY created_at DESC;
$$;

-- Eliminar usuario
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM panel_users WHERE id = p_user_id;
END;
$$;

-- Actualizar rol
CREATE OR REPLACE FUNCTION admin_update_user_role(p_user_id UUID, p_role TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    UPDATE panel_users SET role = p_role WHERE id = p_user_id;
$$;

-- Actualizar cliente
CREATE OR REPLACE FUNCTION admin_update_user_client(p_user_id UUID, p_client_id UUID)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
    UPDATE panel_users SET client_id = p_client_id WHERE id = p_user_id;
$$;

-- Obtener todos los clientes (bot_clients)
CREATE OR REPLACE FUNCTION admin_get_all_clients()
RETURNS SETOF bot_clients
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT * FROM bot_clients ORDER BY company_name;
$$;

-- ─── Trigger para auto-poblar client_id en documents desde metadata ───────────
-- n8n Langchain Supabase Vector Store inserta los campos extra dentro de la
-- columna "metadata" (JSONB). Este trigger extrae el client_id y source_url
-- del JSONB y los guarda en las columnas nativas de la tabla.
CREATE OR REPLACE FUNCTION documents_extract_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- Extraer client_id si existe en metadata
    IF NEW.metadata ? 'client_id' THEN
        NEW.client_id := NULLIF(NEW.metadata->>'client_id', '')::UUID;
    END IF;

    -- Extraer source_url si existe
    IF NEW.metadata ? 'source_url' THEN
        NEW.source_url := NULLIF(NEW.metadata->>'source_url', '');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_extract_metadata ON documents;
CREATE TRIGGER trg_documents_extract_metadata
BEFORE INSERT OR UPDATE ON documents
FOR EACH ROW
EXECUTE FUNCTION documents_extract_metadata();
