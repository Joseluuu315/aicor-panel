# Aicor — Panel de Control del Chatbot

Panel web en React para gestionar el chatbot n8n: prompts, endpoints, transcripts y configuración general.

---

## Estructura del proyecto

```
aicor-panel/
├── src/
│   ├── components/Layout.tsx       # Shell con sidebar
│   ├── hooks/useAuth.tsx           # Login básico con sessionStorage
│   ├── lib/
│   │   ├── supabase.ts             # Cliente Supabase + tipos
│   │   └── n8n.ts                  # Llamadas al webhook de n8n
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx       # Métricas + leads recientes
│   │   ├── TranscriptsPage.tsx     # Lista + visor inline
│   │   ├── EndpointsPage.tsx       # CRUD de endpoints de leads
│   │   ├── PromptsPage.tsx         # Editor de system prompt
│   │   └── ConfigPage.tsx          # Formato transcript + ajustes
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase_schema.sql             # ← Ejecutar primero en Supabase
├── n8n_flow_adapted.json           # ← Importar en n8n
├── .env.example                    # ← Copiar a .env
└── package.json
```

---

## Paso 1 — Supabase

1. Abre tu proyecto Supabase → **SQL Editor**
2. Pega y ejecuta el contenido de `supabase_schema.sql`

Esto crea:
- `chat_sessions` — mensajes del chat
- `lead_logs` — registro de leads enviados
- `transcript_logs` — metadatos de transcripts guardados
- `bot_endpoints` — endpoints configurables desde el panel
- `bot_config` — prompts y ajustes generales (con valores por defecto)

---

## Paso 2 — n8n

1. En n8n, ve a **Import workflow** → pega el contenido de `n8n_flow_adapted.json`
2. Conecta tus credenciales de Supabase y OpenRouter en los nodos correspondientes
3. Activa el flujo

### Cambios clave respecto al flujo original:

| Antes (hardcodeado) | Ahora (desde Supabase) |
|---|---|
| System prompt fijo en el nodo Agent | Lee `bot_config.system_prompt` en cada ejecución |
| URL del ERP hardcodeada | Lee `bot_endpoints` activos — cualquier endpoint configurado desde el panel |
| Formato transcript siempre HTML | Lee `bot_config.transcript_format` (html / json / pdf) |
| Mensaje de error fijo | Lee `bot_config.lead_fallback_message` |
| ID de campaña hardcodeado (`50`) | Lee `bot_config.lead_campania_id` |

### Nuevo webhook de config (`/webhook/bot-config-update`):
Cuando guardas algo desde el panel, React llama a este webhook para notificar a n8n. n8n responde 200 — la próxima ejecución del chatbot ya usará la config actualizada de Supabase.

---

## Paso 3 — Panel React

### Instalar y arrancar

```bash
cd aicor-panel

# 1. Copiar variables de entorno
cp .env.example .env

# 2. Editar .env con tus valores reales:
#    VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
#    VITE_SUPABASE_ANON_KEY=tu_anon_key
#    VITE_N8N_CONFIG_WEBHOOK=http://localhost:5678/webhook/bot-config-update
#    VITE_PANEL_USER=admin
#    VITE_PANEL_PASS=aicor2024

# 3. Instalar dependencias
npm install

# 4. Arrancar en desarrollo
npm run dev
```

Abre http://localhost:3000

### Credenciales por defecto
- Usuario: `admin`
- Contraseña: `aicor2024`
(Cámbialas en `.env`)

---

## Secciones del panel

### 📊 Dashboard
- Contadores: leads OK, leads con error, transcripts, mensajes de hoy
- Tabla de los últimos 8 leads con estado

### 📄 Transcripts
- Lista completa con nombre del lead, email, nº mensajes, estado de subida
- Click en una fila → visor inline con todos los mensajes de la conversación
- Botón para abrir el archivo HTML/JSON en nueva pestaña

### 🔗 Endpoints
- CRUD completo de endpoints de destino de leads
- Campos: URL, método HTTP, header + valor de autenticación, activo/inactivo
- Botón "Test" hace una petición real al endpoint para verificar conectividad
- Al guardar, notifica a n8n vía webhook para que lo use inmediatamente

### 💬 Prompts
- Editor de texto completo del system prompt
- Tabs para cada prompt (system, bienvenida, error)
- Aviso visual de "cambios sin guardar"
- Al guardar, n8n recibe el webhook y usa el nuevo prompt en el siguiente mensaje

### ⚙️ Configuración
- Selector visual de formato de transcript (HTML / JSON / PDF)
- Ajustes adicionales: ID campaña ERP, TTL sesión, idioma
- Todo sincronizado con n8n en tiempo real

---

## Notas de producción

- Las políticas RLS en `supabase_schema.sql` son permisivas (`FOR ALL USING (true)`). **Restringe en producción** con auth real de Supabase.
- El login del panel usa `sessionStorage` — se cierra al cerrar el navegador.
- El webhook de n8n debe ser accesible desde donde corre el panel. En local, ambos en `localhost` funcionan sin configuración extra.
- Para PDF real (no HTML con extensión .pdf), añade un nodo entre `Generate Transcript` y `Upload to Supabase Storage` que use una librería como `puppeteer` o una API de conversión.
