-- ═══════════════════════════════════════════════════════════════════════════
-- AICOR CHATBOT — Schema completo de Supabase
-- Ejecuta este archivo en SQL Editor de tu proyecto Supabase
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Tabla de sesiones de chat (ya existe, se incluye por si acaso) ───────
CREATE TABLE IF NOT EXISTS chat_sessions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id  text NOT NULL,
  role        text NOT NULL CHECK (role IN ('user', 'assistant')),
  content     text NOT NULL,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_session_id ON chat_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_created_at ON chat_sessions(created_at DESC);

-- ── 2. Logs de leads ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_logs (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre           text,
  email            text,
  telefono         text,
  producto_interes text DEFAULT 'General',
  contexto         text,
  origen           text DEFAULT 'chatbot',
  estado           text DEFAULT 'OK' CHECK (estado IN ('OK', 'ERROR')),
  error_detalle    text,
  respuesta_api    text,
  created_at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lead_logs_estado      ON lead_logs(estado);
CREATE INDEX IF NOT EXISTS idx_lead_logs_created_at  ON lead_logs(created_at DESC);

-- ── 3. Logs de transcripts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transcript_logs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  file_url        text,
  storage_path    text,
  file_name       text,
  lead_nombre     text,
  lead_email      text,
  message_count   integer DEFAULT 0,
  created_at      timestamptz DEFAULT now(),
  upload_status   text DEFAULT 'OK' CHECK (upload_status IN ('OK', 'ERROR')),
  upload_response text
);
CREATE INDEX IF NOT EXISTS idx_transcript_logs_created_at ON transcript_logs(created_at DESC);

-- ── 4. Endpoints configurables desde el panel ────────────────────────────────
CREATE TABLE IF NOT EXISTS bot_endpoints (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key             text UNIQUE NOT NULL,          -- identificador único, ej: 'lead_erp'
  label           text NOT NULL,                 -- nombre visible en el panel
  url             text NOT NULL,
  method          text DEFAULT 'POST' CHECK (method IN ('POST', 'PUT', 'GET')),
  api_key_header  text DEFAULT 'x-api-key',
  api_key_value   text DEFAULT '',
  active          boolean DEFAULT true,
  description     text DEFAULT '',
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- Endpoint de Estratos por defecto (el que ya tenías hardcodeado en n8n)
INSERT INTO bot_endpoints (key, label, url, method, api_key_header, api_key_value, active, description)
VALUES (
  'lead_erp',
  'ERP Estratos Plus',
  'https://dev.estratosplus.com/estratos/api/v1/erp/AutomatizacionOportunidadesWs/set_oportunidad',
  'POST',
  'x-estratos-api-key',
  'c1544aa59ebd3372531edbeb88c55bda',
  true,
  'Endpoint principal del ERP para registrar oportunidades de venta'
)
ON CONFLICT (key) DO NOTHING;

-- ── 5. Configuración general del bot (prompts + ajustes) ─────────────────────
CREATE TABLE IF NOT EXISTS bot_config (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key         text UNIQUE NOT NULL,
  value       text NOT NULL DEFAULT '',
  label       text NOT NULL,
  description text DEFAULT '',
  category    text DEFAULT 'general' CHECK (category IN ('general', 'prompt')),
  type        text DEFAULT 'text' CHECK (type IN ('text', 'textarea', 'select', 'url', 'json')),
  options     jsonb,           -- para type='select', array de opciones posibles
  sort_order  integer DEFAULT 0,
  updated_at  timestamptz DEFAULT now()
);

-- ── Configuración general ────────────────────────────────────────────────────
INSERT INTO bot_config (key, label, description, category, type, value, sort_order)
VALUES
(
  'transcript_format',
  'Formato de transcript',
  'Formato en que se guarda el transcript de cada conversación en Supabase Storage.',
  'general', 'select', 'html', 1
),
(
  'bot_language',
  'Idioma del bot',
  'Idioma principal en el que responde el asistente.',
  'general', 'select', 'es', 2
),
(
  'lead_campania_id',
  'ID de campaña ERP',
  'ID de campaña comercial en Estratos para los leads del chatbot.',
  'general', 'text', '50', 3
),
(
  'session_ttl_hours',
  'TTL de sesión (horas)',
  'Tiempo máximo que se conservan los mensajes de chat_sessions antes de poder limpiarlos.',
  'general', 'text', '24', 4
)
ON CONFLICT (key) DO NOTHING;

-- Opciones para los selects
UPDATE bot_config SET options = '["html","json","pdf"]'::jsonb  WHERE key = 'transcript_format';
UPDATE bot_config SET options = '["es","en","fr","de","pt"]'::jsonb WHERE key = 'bot_language';

-- ── Prompts editables ─────────────────────────────────────────────────────────
INSERT INTO bot_config (key, label, description, category, type, sort_order, value)
VALUES
(
  'system_prompt',
  'System Prompt',
  'Instrucciones completas que definen la personalidad, pasos y reglas del agente.',
  'prompt', 'textarea', 1,
  'Eres el asistente virtual de Aicor Consultores Informáticos.
Habla como una persona real: natural, directo, sin florituras.
Si algo suena a robot o a script, no lo digas.

════════════════════════════════════════════
ANTES DE CADA RESPUESTA — OBLIGATORIO
════════════════════════════════════════════
Antes de escribir, hazte estas preguntas:
· ¿Qué acaba de decir exactamente el usuario?
· ¿Ya tengo su nombre? ¿Ya sé lo que quiere?
· ¿Estoy a punto de preguntarle algo que ya me dijo? Si es así, no lo preguntes.
· ¿Me está pidiendo información de un producto o servicio? Si es así, dásela ANTES de avanzar.
· ¿Mi respuesta empieza igual que la anterior? Si es así, reescríbela distinto.

PROHIBIDO empezar dos respuestas seguidas con la misma frase o estructura.
PROHIBIDO usar "En Aicor podemos ayudarte" más de una vez en toda la conversación.
Varía siempre el inicio: una frase directa, una pregunta, una afirmación, lo que encaje.

════════════════════════════════════════════
MENSAJE DE BIENVENIDA — Solo el primero
════════════════════════════════════════════
"¡Hola! Soy el asistente de Aicor Consultores Informáticos.
¿Cómo te llamas?"

════════════════════════════════════════════
PASO 1 · NOMBRE
════════════════════════════════════════════
Cuando dé su nombre, úsalo y pregunta en qué le puedes ayudar.
"Hola, [nombre]. ¿En qué te puedo ayudar?"

Si en el mismo mensaje da el nombre Y lo que quiere,
ve directamente al Paso 2.

════════════════════════════════════════════
PASO 2 · ENTENDER LA NECESIDAD
════════════════════════════════════════════
Cuando el usuario diga lo que busca:
· Una frase conectando con su situación — distinta cada vez
· Di brevemente qué hace Aicor al respecto
· Haz UNA pregunta concreta para entender mejor

════════════════════════════════════════════
PASO 3 · CUALIFICACIÓN
════════════════════════════════════════════
Cuando ya sepas qué quiere, haz UNA pregunta para conocerle mejor.
La más relevante según lo que haya dicho. Solo una.

════════════════════════════════════════════
PASO 4 · OFERTA DE CONTACTO
════════════════════════════════════════════
Cuando tengas suficiente contexto, ofrece contacto de forma natural.

"Oye, [nombre], ¿quieres que te mande más info por email
o WhatsApp? O si prefieres que te llame alguien del equipo,
también lo podemos hacer. ¿Qué te va mejor?"

════════════════════════════════════════════
PASO 5 · RECOGIDA DE DATOS
════════════════════════════════════════════
SIEMPRE hay que recoger teléfono Y email. Los dos. Sin excepción.

Un dato por mensaje. Sin agobiar.
No avances al Paso 6 hasta tener los DOS datos confirmados.

════════════════════════════════════════════
PASO 6 · LEAD_CAPTURED
════════════════════════════════════════════
Cuando tengas teléfono Y email confirmados, escribe en UNA sola línea:

LEAD_CAPTURED:{"nombre":"[nombre real]","email":"[email real]","telefono":"[teléfono real]","producto_interes":"[producto o servicio mencionado]","via_contacto":"[email/whatsapp/llamada]","contexto":"[resumen breve: sector, necesidad, situación]","origen":"chatbot","timestamp":"[ISO 8601]"}

════════════════════════════════════════════
REGLAS — INAMOVIBLES
════════════════════════════════════════════
· Máximo 3-4 líneas por respuesta
· Una sola pregunta por mensaje, al final
· No preguntes nada que el usuario ya haya respondido
· Si pide info de un producto, dásela antes de avanzar
· No pidas datos personales antes del Paso 4
· NUNCA generes LEAD_CAPTURED sin tener teléfono Y email reales
· NUNCA muestres código, JSON ni estructuras técnicas al usuario
· NUNCA hables de temas ajenos a Aicor y sus soluciones'
),
(
  'welcome_message',
  'Mensaje de bienvenida',
  'Primer mensaje que ve el usuario al abrir el chat.',
  'prompt', 'textarea', 2,
  '¡Hola! Soy el asistente de Aicor Consultores Informáticos.
¿Cómo te llamas?'
),
(
  'lead_fallback_message',
  'Mensaje de error lead',
  'Mensaje que se muestra al usuario si falla el envío del lead al ERP.',
  'prompt', 'textarea', 3,
  'He recibido tus datos, pero ahora mismo no he podido registrarlos bien. ¿Puedes intentarlo en unos minutos?'
)
ON CONFLICT (key) DO NOTHING;

-- ── 6. Políticas RLS básicas ─────────────────────────────────────────────────
-- Si usas anon key desde React, estas tablas deben ser legibles. Ajusta según tu setup.
ALTER TABLE bot_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

-- Política permisiva para desarrollo local (RESTRINGE en producción)
CREATE POLICY "allow_all_bot_config"     ON bot_config     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_bot_endpoints"  ON bot_endpoints  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_lead_logs"      ON lead_logs      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_transcript_logs" ON transcript_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_chat_sessions"  ON chat_sessions  FOR ALL USING (true) WITH CHECK (true);

-- ── 7. Función para updated_at automático ────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bot_config_updated_at
  BEFORE UPDATE ON bot_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_bot_endpoints_updated_at
  BEFORE UPDATE ON bot_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── FIN ───────────────────────────────────────────────────────────────────────
