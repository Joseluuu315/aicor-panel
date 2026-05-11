import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan variables de entorno de Supabase. Copia .env.example a .env y rellena los valores.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BotConfig {
  id: string
  key: string
  value: string
  label: string
  description: string
  type: 'text' | 'textarea' | 'select' | 'url' | 'json'
  options?: string[]
  updated_at: string
}

export interface LeadLog {
  id: string
  nombre: string
  email: string
  telefono: string
  producto_interes: string
  contexto: string
  origen: string
  estado: 'OK' | 'ERROR'
  error_detalle: string | null
  respuesta_api: string | null
  created_at: string
}

export interface TranscriptLog {
  id: string
  file_url: string | null
  storage_path: string
  file_name: string
  lead_nombre: string
  lead_email: string
  message_count: number
  created_at: string
  upload_status: 'OK' | 'ERROR'
  upload_response: string
}

export interface ChatSession {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}
