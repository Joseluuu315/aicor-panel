const WEBHOOK_URL = import.meta.env.VITE_N8N_CONFIG_WEBHOOK || 'https://n8n.averonix.org/webhook-test/bot-config-update'

export interface ConfigUpdatePayload {
  action: 'update_config' | 'reload_prompt' | 'update_endpoint' | 'update_transcript_format'
  key: string
  value: string
  timestamp: string
}

export async function triggerN8nConfigUpdate(payload: Omit<ConfigUpdatePayload, 'timestamp'>): Promise<boolean> {
  try {
    const body: ConfigUpdatePayload = {
      ...payload,
      timestamp: new Date().toISOString()
    }

    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000)
    })

    return res.ok
  } catch (err) {
    console.warn('n8n webhook no respondió (config guardada en Supabase de todas formas):', err)
    return false
  }
}
