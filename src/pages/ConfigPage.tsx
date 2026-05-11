import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { triggerN8nConfigUpdate } from '../lib/n8n'
import { Settings, Save, RefreshCw, FileJson, FileText, FileCode } from 'lucide-react'
import toast from 'react-hot-toast'

interface ConfigRow {
  id: string
  key: string
  value: string
  label: string
  description: string
  type: string
  options: string[] | null
  updated_at: string
}

export function ConfigPage() {
  const [configs, setConfigs] = useState<ConfigRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [webhookStatus, setWebhookStatus] = useState<'idle'|'sending'|'ok'|'error'>('idle')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('bot_config')
      .select('*')
      .eq('category', 'general')
      .order('sort_order', { ascending: true })
    if (error) toast.error('Error cargando configuración')
    const rows = data || []
    setConfigs(rows)
    const d: Record<string, string> = {}
    rows.forEach((r: ConfigRow) => { d[r.key] = r.value })
    setDrafts(d)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function saveConfig(key: string) {
    setSaving(key)
    setWebhookStatus('sending')
    try {
      const { error } = await supabase
        .from('bot_config')
        .update({ value: drafts[key], updated_at: new Date().toISOString() })
        .eq('key', key)
      if (error) throw error

      const n8nOk = await triggerN8nConfigUpdate({
        action: 'update_config',
        key,
        value: drafts[key],
      })

      setWebhookStatus(n8nOk ? 'ok' : 'error')
      toast.success(`Configuración guardada${n8nOk ? ' · n8n notificado' : ' (n8n offline)'}`)
      load()
    } catch (e: any) {
      setWebhookStatus('error')
      toast.error(e.message || 'Error guardando')
    } finally {
      setSaving(null)
    }
  }

  const transcriptFormat = drafts['transcript_format'] || 'html'

  const formatIcons: Record<string, React.ReactNode> = {
    html: <FileCode size={14} />,
    json: <FileJson size={14} />,
    pdf:  <FileText size={14} />,
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Configuración general</div>
          <div className="page-subtitle">formato de transcripts y ajustes del flujo</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {webhookStatus !== 'idle' && (
            <div className={`webhook-indicator ${webhookStatus}`} style={{ fontSize: 11 }}>
              {{ sending: '⟳ Notificando n8n...', ok: '✓ n8n actualizado', error: '✗ n8n offline' }[webhookStatus]}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={13} /></button>
        </div>
      </div>

      {/* Transcript format — visual card selector */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><FileCode size={14} />Formato de transcript</div>
        </div>
        <div className="card-body">
          <p className="field-hint" style={{ marginBottom: 16 }}>
            Elige en qué formato se guarda el transcript de cada conversación en Supabase Storage.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            {['html', 'json', 'pdf'].map(fmt => (
              <button
                key={fmt}
                onClick={() => setDrafts(d => ({ ...d, transcript_format: fmt }))}
                style={{
                  padding: '20px 16px',
                  borderRadius: 8,
                  border: `2px solid ${transcriptFormat === fmt ? 'var(--accent)' : 'var(--border2)'}`,
                  background: transcriptFormat === fmt ? 'rgba(59,130,246,0.08)' : 'var(--bg3)',
                  color: transcriptFormat === fmt ? 'var(--accent)' : 'var(--text2)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  transition: 'all 150ms ease',
                  fontFamily: 'var(--mono)',
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {formatIcons[fmt]}
                .{fmt.toUpperCase()}
                <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--sans)', textAlign: 'center' }}>
                  {{ html: 'Visual, se abre en navegador', json: 'Datos crudos, integración fácil', pdf: 'Portátil, aspecto profesional' }[fmt]}
                </span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary btn-sm"
              disabled={saving === 'transcript_format' || drafts['transcript_format'] === configs.find(c => c.key === 'transcript_format')?.value}
              onClick={() => saveConfig('transcript_format')}
            >
              <Save size={13} />
              {saving === 'transcript_format' ? 'Guardando...' : 'Aplicar formato'}
            </button>
          </div>
        </div>
      </div>

      {/* Rest of config rows */}
      {loading ? (
        <div className="card"><div className="empty"><div className="spinner" /></div></div>
      ) : (
        configs
          .filter(c => c.key !== 'transcript_format')
          .map(c => (
            <div className="card" key={c.key}>
              <div className="card-header">
                <div className="card-title">
                  <Settings size={14} />
                  {c.label}
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={saving === c.key || drafts[c.key] === c.value}
                  onClick={() => saveConfig(c.key)}
                >
                  <Save size={13} />
                  {saving === c.key ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {c.description && <p className="field-hint">{c.description}</p>}
                {c.type === 'select' && c.options ? (
                  <select
                    value={drafts[c.key] || ''}
                    onChange={e => setDrafts(d => ({ ...d, [c.key]: e.target.value }))}
                  >
                    {c.options.map((opt: string) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : c.type === 'textarea' ? (
                  <textarea
                    value={drafts[c.key] || ''}
                    onChange={e => setDrafts(d => ({ ...d, [c.key]: e.target.value }))}
                  />
                ) : (
                  <input
                    type={c.type === 'url' ? 'url' : 'text'}
                    value={drafts[c.key] || ''}
                    onChange={e => setDrafts(d => ({ ...d, [c.key]: e.target.value }))}
                  />
                )}
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
                  key: {c.key} · actualizado: {new Date(c.updated_at).toLocaleString('es-ES')}
                </div>
              </div>
            </div>
          ))
      )}
    </>
  )
}
