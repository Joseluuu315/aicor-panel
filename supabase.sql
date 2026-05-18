-- ═══════════════════════════════════════════════════════════════════
--  Aicor Chatbot – Supabase Schema (limpio)
--  Ejecutar en: Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════════

-- ── Extensiones ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ══════════════════════════════════════════════════════════════════
--  TABLAS
-- ══════════════════════════════════════════════════════════════════

-- ── 1. Clientes / empresas que usan el bot ─────────────────────────
CREATE TABLE IF NOT EXISTS bot_clients (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug         TEXT        NOT NULL UNIQUE,
    company_name TEXT        NOT NULL,
    bot_name     TEXT,
    status       TEXT        NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'paused', 'disabled')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. Base de conocimiento vectorial ──────────────────────────────
--    n8n Supabase Vector Store inserta en esta tabla.
--    client_id es opcional: si no se pasa, el documento es "global".
CREATE TABLE IF NOT EXISTS documents (
    id         BIGSERIAL   PRIMARY KEY,
    content    TEXT,
    metadata   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    embedding  VECTOR(768),                  -- dimensión HuggingFace all-MiniLM-L6-v2
    client_id  UUID        REFERENCES bot_clients(id) ON DELETE SET NULL,
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_client_id     ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_embedding_hnsw
    ON documents USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_documents_metadata_gin  ON documents USING GIN (metadata);

-- ── 3. Historial de chat ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_sessions (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id  UUID        REFERENCES bot_clients(id) ON DELETE CASCADE,
    session_id TEXT        NOT NULL,
    role       TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_client_session
    ON chat_sessions(client_id, session_id, created_at);

-- ── 4. Leads capturados ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_logs (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id        UUID        REFERENCES bot_clients(id) ON DELETE CASCADE,
    nombre           TEXT,
    email            TEXT,
    telefono         TEXT,
    producto_interes TEXT,
    contexto         TEXT,
    origen           TEXT        DEFAULT 'chatbot',
    estado           TEXT        DEFAULT 'OK',
    error_detalle    TEXT,
    respuesta_api    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_logs_client ON lead_logs(client_id, created_at DESC);

-- ── 5. Transcripts de conversaciones ──────────────────────────────
CREATE TABLE IF NOT EXISTS transcript_logs (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id       UUID        REFERENCES bot_clients(id) ON DELETE CASCADE,
    file_url        TEXT,
    storage_path    TEXT,
    file_name       TEXT,
    lead_nombre     TEXT,
    lead_email      TEXT,
    message_count   INT         DEFAULT 0,
    upload_status   TEXT        DEFAULT 'OK',
    upload_response TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transcript_logs_client
    ON transcript_logs(client_id, created_at DESC);

-- ── 6. Jobs de scraping ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scraping_jobs (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id      UUID        NOT NULL REFERENCES bot_clients(id) ON DELETE CASCADE,
    execution_id   TEXT,
    requested_urls TEXT[]      NOT NULL DEFAULT '{}',
    status         TEXT        NOT NULL DEFAULT 'running'
                               CHECK (status IN ('running', 'done', 'error')),
    result_count   INT         NOT NULL DEFAULT 0,
    error_detail   TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scraping_jobs_client ON scraping_jobs(client_id, created_at DESC);

-- ── 7. Usuarios del panel ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS panel_users (
    id         UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      TEXT        NOT NULL,
    role       TEXT        NOT NULL DEFAULT 'user' CHECK (role IN ('superadmin', 'admin', 'user')),
    client_id  UUID        REFERENCES bot_clients(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_panel_users_client ON panel_users(client_id);

-- ══════════════════════════════════════════════════════════════════
--  TRIGGERS
-- ══════════════════════════════════════════════════════════════════

-- Auto-poblar client_id y source_url en documents desde metadata JSONB
-- (n8n Supabase Vector Store almacena los metadatos en la columna metadata)
CREATE OR REPLACE FUNCTION documents_sync_from_metadata()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.client_id IS NULL AND (NEW.metadata ? 'client_id') THEN
        NEW.client_id := NULLIF(NEW.metadata->>'client_id', '')::UUID;
    END IF;

    IF NEW.source_url IS NULL AND (NEW.metadata ? 'source_url') THEN
        NEW.source_url := NULLIF(NEW.metadata->>'source_url', '');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_sync_metadata ON documents;
CREATE TRIGGER trg_documents_sync_metadata
BEFORE INSERT OR UPDATE ON documents
FOR EACH ROW EXECUTE FUNCTION documents_sync_from_metadata();

-- Auto-actualizar updated_at en panel_users
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_panel_users_updated_at ON panel_users;
CREATE TRIGGER trg_panel_users_updated_at
BEFORE UPDATE ON panel_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_bot_clients_updated_at ON bot_clients;
CREATE TRIGGER trg_bot_clients_updated_at
BEFORE UPDATE ON bot_clients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════════
--  FUNCIONES DE BÚSQUEDA VECTORIAL
-- ══════════════════════════════════════════════════════════════════

-- ── match_documents ───────────────────────────────────────────────
--    Usada por el nodo "Supabase Vector Store" de n8n (retrieve-as-tool).
--    client_id en filter es OPCIONAL:
--      - Si se pasa { "client_id": "uuid" }  →  filtra por ese cliente.
--      - Si no se pasa o es vacío            →  devuelve de todos los clientes.
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding VECTOR,
    match_count     INT     DEFAULT 5,
    filter          JSONB   DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    id         BIGINT,
    content    TEXT,
    metadata   JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_client_id UUID;
BEGIN
    -- Intentar extraer client_id del filtro (puede ser UUID como texto)
    BEGIN
        v_client_id := NULLIF(filter->>'client_id', '')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_client_id := NULL;
    END;

    IF v_client_id IS NOT NULL THEN
        -- Búsqueda aislada por cliente
        RETURN QUERY
        SELECT
            d.id,
            d.content,
            d.metadata,
            1 - (d.embedding <=> query_embedding) AS similarity
        FROM documents d
        WHERE d.client_id = v_client_id
          AND d.embedding IS NOT NULL
        ORDER BY d.embedding <=> query_embedding
        LIMIT match_count;
    ELSE
        -- Sin filtro: busca en toda la base de conocimiento
        RETURN QUERY
        SELECT
            d.id,
            d.content,
            d.metadata,
            1 - (d.embedding <=> query_embedding) AS similarity
        FROM documents d
        WHERE d.embedding IS NOT NULL
        ORDER BY d.embedding <=> query_embedding
        LIMIT match_count;
    END IF;
END;
$$;

-- ══════════════════════════════════════════════════════════════════
--  ROW LEVEL SECURITY (RLS)
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE panel_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS panel_users_self_read  ON panel_users;
CREATE POLICY panel_users_self_read
    ON panel_users FOR SELECT
    USING (auth.uid() = id);

-- ══════════════════════════════════════════════════════════════════
--  RPCs PARA EL PANEL (SECURITY DEFINER = bypassa RLS)
-- ══════════════════════════════════════════════════════════════════

-- Perfil del usuario actual
CREATE OR REPLACE FUNCTION get_my_panel_profile()
RETURNS TABLE (role TEXT, client_id UUID)
LANGUAGE sql SECURITY DEFINER STABLE AS $$
    SELECT pu.role, pu.client_id
    FROM panel_users pu
    WHERE pu.id = auth.uid()
    LIMIT 1;
$$;

-- Crear/vincular cliente y usuario en una sola llamada
CREATE OR REPLACE FUNCTION admin_setup_user(
    p_company_name TEXT,
    p_user_id      UUID,
    p_email        TEXT,
    p_role         TEXT
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_client_id UUID;
    v_slug      TEXT;
BEGIN
    v_slug := lower(regexp_replace(p_company_name, '\s+', '-', 'g'));
    v_slug := regexp_replace(v_slug, '[^a-z0-9-]', '', 'g');

    SELECT id INTO v_client_id
    FROM bot_clients WHERE company_name ILIKE p_company_name LIMIT 1;

    IF v_client_id IS NULL THEN
        IF EXISTS (SELECT 1 FROM bot_clients WHERE slug = v_slug) THEN
            v_slug := v_slug || '-' || substr(md5(random()::text), 1, 4);
        END IF;
        INSERT INTO bot_clients (company_name, slug, status)
        VALUES (p_company_name, v_slug, 'active')
        RETURNING id INTO v_client_id;
    END IF;

    INSERT INTO panel_users (id, email, role, client_id)
    VALUES (p_user_id, p_email, p_role, v_client_id)
    ON CONFLICT (id) DO UPDATE SET role = p_role, client_id = v_client_id;

    RETURN v_client_id;
END;
$$;

-- Listar todos los usuarios
CREATE OR REPLACE FUNCTION admin_get_all_users()
RETURNS SETOF panel_users LANGUAGE sql SECURITY DEFINER AS $$
    SELECT * FROM panel_users ORDER BY created_at DESC;
$$;

-- Eliminar usuario
CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    DELETE FROM panel_users WHERE id = p_user_id;
END;
$$;

-- Actualizar rol
CREATE OR REPLACE FUNCTION admin_update_user_role(p_user_id UUID, p_role TEXT)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
    UPDATE panel_users SET role = p_role WHERE id = p_user_id;
$$;

-- Actualizar cliente asignado
CREATE OR REPLACE FUNCTION admin_update_user_client(p_user_id UUID, p_client_id UUID)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
    UPDATE panel_users SET client_id = p_client_id WHERE id = p_user_id;
$$;

-- Listar todos los clientes
CREATE OR REPLACE FUNCTION admin_get_all_clients()
RETURNS SETOF bot_clients LANGUAGE sql SECURITY DEFINER AS $$
    SELECT * FROM bot_clients ORDER BY company_name;
$$;
