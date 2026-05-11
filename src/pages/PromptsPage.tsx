import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { triggerN8nConfigUpdate } from '../lib/n8n'
import { MessageSquare, Save, RefreshCw, Zap, FileCode, Eye } from 'lucide-react'
import toast from 'react-hot-toast'

interface PromptRow {
  id: string
  key: string
  value: string
  label: string
  description: string
  updated_at: string
}

export function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [webhookStatus, setWebhookStatus] = useState<Record<string, 'idle'|'sending'|'ok'|'error'>>({})
  const [activeTab, setActiveTab] = useState(0)
  const [draftValues, setDraftValues] = useState<Record<string, string>>({})
  const [previewMode, setPreviewMode] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('bot_config')
      .select('*')
      .eq('category', 'prompt')
      .order('sort_order', { ascending: true })
    if (error) toast.error('Error cargando prompts')
    const rows = data || []
    setPrompts(rows)
    const drafts: Record<string, string> = {}
    rows.forEach((r: PromptRow) => { drafts[r.key] = r.value })
    setDraftValues(drafts)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function savePrompt(key: string, value: string) {
    setSaving(key)
    setWebhookStatus(p => ({ ...p, [key]: 'sending' }))
    try {
      const { error } = await supabase
        .from('bot_config')
        .update({ value, updated_at: new Date().toISOString() })
        .eq('key', key)

      if (error) throw error

      const n8nOk = await triggerN8nConfigUpdate({
        action: 'reload_prompt',
        key,
        value,
      })

      setWebhookStatus(p => ({ ...p, [key]: n8nOk ? 'ok' : 'error' }))
      toast.success(`Prompt guardado${n8nOk ? ' · n8n actualizado en vivo' : ' (n8n offline)'}`)
      load()
    } catch (e: any) {
      setWebhookStatus(p => ({ ...p, [key]: 'error' }))
      toast.error(e.message || 'Error guardando prompt')
    } finally {
      setSaving(null)
    }
  }

  const currentPrompt = prompts[activeTab]

  const statusLabel: Record<string, string> = {
    idle:    '',
    sending: '⟳ Enviando a n8n...',
    ok:      '✓ n8n actualizado',
    error:   '✗ n8n offline',
  }

  if (loading) {
    return <div className="card"><div className="empty"><div className="spinner" /></div></div>
  }

  if (prompts.length === 0) {
    return (
      <div className="card">
        <div className="card-header">
          <div className="card-title"><MessageSquare size={14} />Prompts</div>
        </div>
        <div className="empty" style={{ padding: 40 }}>
          <MessageSquare size={32} />
          <p>No hay prompts en la tabla <code>bot_config</code>.</p>
          <p style={{ fontSize: 11 }}>Ejecuta el SQL de inicialización incluido en <code>supabase_schema.sql</code>.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Prompts del agente</div>
          <div className="page-subtitle">edición en vivo · los cambios se propagan al n8n inmediatamente</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>
          <RefreshCw size={13} />
        </button>
      </div>

      <div className="card">
        {/* Tabs */}
        <div className="tabs">
          {prompts.map((p, i) => (
            <button
              key={p.key}
              className={`tab ${activeTab === i ? 'active' : ''}`}
              onClick={() => setActiveTab(i)}
            >
              <MessageSquare size={13} />
              {p.label}
            </button>
          ))}
        </div>

        {currentPrompt && (
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="field-label">{currentPrompt.label}</div>
                {currentPrompt.description && (
                  <p className="field-hint" style={{ marginTop: 4 }}>{currentPrompt.description}</p>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {webhookStatus[currentPrompt.key] && webhookStatus[currentPrompt.key] !== 'idle' && (
                  <div className={`webhook-indicator ${webhookStatus[currentPrompt.key]}`} style={{ fontSize: 11 }}>
                    {statusLabel[webhookStatus[currentPrompt.key]]}
                  </div>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setPreviewMode(!previewMode)}
                >
                  <Eye size={13} />
                  {previewMode ? 'Editar' : 'Vista previa'}
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={saving === currentPrompt.key || draftValues[currentPrompt.key] === currentPrompt.value}
                  onClick={() => savePrompt(currentPrompt.key, draftValues[currentPrompt.key] || '')}
                >
                  <Save size={13} />
                  {saving === currentPrompt.key ? 'Guardando...' : 'Guardar y aplicar'}
                </button>
              </div>
            </div>

            {previewMode ? (
              <div className="code-block" style={{ minHeight: 300 }}>
                {draftValues[currentPrompt.key] || '(vacío)'}
              </div>
            ) : (
              <textarea
                style={{ minHeight: 380, fontFamily: 'var(--mono)', fontSize: 12 }}
                value={draftValues[currentPrompt.key] || ''}
                onChange={e => setDraftValues(prev => ({ ...prev, [currentPrompt.key]: e.target.value }))}
                placeholder={`Escribe aquí el ${currentPrompt.label.toLowerCase()}...`}
                spellCheck={false}
              />
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                {(draftValues[currentPrompt.key] || '').length} caracteres ·{' '}
                Última actualización: {new Date(currentPrompt.updated_at).toLocaleString('es-ES')}
              </span>
              {draftValues[currentPrompt.key] !== currentPrompt.value && (
                <span style={{ fontSize: 11, color: 'var(--amber)' }}>
                  ⚠ Cambios sin guardar
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
