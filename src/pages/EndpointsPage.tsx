import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { triggerN8nConfigUpdate } from '../lib/n8n'
import { Webhook, Save, Plus, Trash2, TestTube, CheckCircle, XCircle, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

interface Endpoint {
  id?: string
  key: string
  label: string
  url: string
  api_key_header: string
  api_key_value: string
  method: 'POST' | 'GET' | 'PUT'
  active: boolean
  description: string
}

const EMPTY_EP: Endpoint = {
  key: '',
  label: '',
  url: '',
  api_key_header: 'x-api-key',
  api_key_value: '',
  method: 'POST',
  active: true,
  description: '',
}

export function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'error' | null>>({})
  const [addingNew, setAddingNew] = useState(false)
  const [newEp, setNewEp] = useState<Endpoint>({ ...EMPTY_EP })
  const [webhookStatus, setWebhookStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('bot_endpoints')
      .select('*')
      .order('created_at', { ascending: true })
    if (!error) setEndpoints(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function saveEndpoint(ep: Endpoint) {
    setSaving(ep.key || 'new')
    setWebhookStatus('sending')
    try {
      let error
      if (ep.id) {
        const res = await supabase.from('bot_endpoints').update(ep).eq('id', ep.id)
        error = res.error
      } else {
        const res = await supabase.from('bot_endpoints').insert(ep)
        error = res.error
      }

      if (error) throw error

      // Notify n8n to reload endpoints in real time
      const n8nOk = await triggerN8nConfigUpdate({
        action: 'update_endpoint',
        key: ep.key,
        value: JSON.stringify(ep),
      })

      setWebhookStatus(n8nOk ? 'ok' : 'error')
      toast.success(`Endpoint "${ep.label}" guardado${n8nOk ? ' y n8n notificado' : ' (n8n offline)'}`)
      setAddingNew(false)
      setNewEp({ ...EMPTY_EP })
      load()
    } catch (e: any) {
      setWebhookStatus('error')
      toast.error(e.message || 'Error guardando endpoint')
    } finally {
      setSaving(null)
    }
  }

  async function deleteEndpoint(id: string, label: string) {
    if (!confirm(`¿Eliminar el endpoint "${label}"?`)) return
    const { error } = await supabase.from('bot_endpoints').delete().eq('id', id)
    if (error) return toast.error(error.message)
    toast.success('Endpoint eliminado')
    load()
  }

  async function testEndpoint(ep: Endpoint) {
    setTesting(ep.key)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (ep.api_key_header && ep.api_key_value) {
        headers[ep.api_key_header] = ep.api_key_value
      }
      const res = await fetch(ep.url, {
        method: ep.method,
        headers,
        body: ep.method !== 'GET' ? JSON.stringify({ test: true, source: 'aicor-panel' }) : undefined,
        signal: AbortSignal.timeout(5000),
      })
      setTestResults(prev => ({ ...prev, [ep.key]: res.ok ? 'ok' : 'error' }))
      toast[res.ok ? 'success' : 'error'](`Test endpoint: ${res.status} ${res.statusText}`)
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, [ep.key]: 'error' }))
      toast.error(`No se pudo conectar: ${e.message}`)
    } finally {
      setTesting(null)
    }
  }

  const WebhookBadge = () => {
    if (webhookStatus === 'idle') return null
    const map = {
      sending: { cls: 'sending', text: '⟳ Notificando n8n...' },
      ok:      { cls: 'ok',      text: '✓ n8n actualizado' },
      error:   { cls: 'error',   text: '✗ n8n no respondió (config guardada)' },
    }
    const { cls, text } = map[webhookStatus]
    return <div className={`webhook-indicator ${cls}`}>{text}</div>
  }

  const EpForm = ({ ep, onChange, onSave, onCancel }: {
    ep: Endpoint
    onChange: (field: keyof Endpoint, val: any) => void
    onSave: () => void
    onCancel: () => void
  }) => (
    <div style={{ display: 'grid', gap: 14, padding: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label className="field-label">Clave única (key)</label>
          <input type="text" value={ep.key} onChange={e => onChange('key', e.target.value)} placeholder="lead_erp" />
        </div>
        <div className="field">
          <label className="field-label">Nombre visible</label>
          <input type="text" value={ep.label} onChange={e => onChange('label', e.target.value)} placeholder="ERP Estratos" />
        </div>
      </div>
      <div className="field">
        <label className="field-label">URL del endpoint</label>
        <input type="url" value={ep.url} onChange={e => onChange('url', e.target.value)} placeholder="https://api.tuservicio.com/leads" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 14 }}>
        <div className="field">
          <label className="field-label">Header de autenticación</label>
          <input type="text" value={ep.api_key_header} onChange={e => onChange('api_key_header', e.target.value)} placeholder="x-api-key" />
        </div>
        <div className="field">
          <label className="field-label">Valor del header</label>
          <input type="password" value={ep.api_key_value} onChange={e => onChange('api_key_value', e.target.value)} placeholder="••••••••" />
        </div>
        <div className="field">
          <label className="field-label">Método</label>
          <select value={ep.method} onChange={e => onChange('method', e.target.value)}>
            <option>POST</option>
            <option>PUT</option>
            <option>GET</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field-label">Descripción</label>
        <input type="text" value={ep.description} onChange={e => onChange('description', e.target.value)} placeholder="¿Para qué sirve este endpoint?" />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancelar</button>
        <button
          className="btn btn-primary btn-sm"
          onClick={onSave}
          disabled={!ep.key || !ep.url || saving === (ep.key || 'new')}
        >
          <Save size={13} />
          {saving === (ep.key || 'new') ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Endpoints</div>
          <div className="page-subtitle">destinos a los que el bot envía los leads</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <WebhookBadge />
          <button className="btn btn-ghost btn-sm" onClick={load}>
            <RefreshCw size={13} />
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setAddingNew(true)} disabled={addingNew}>
            <Plus size={13} /> Añadir endpoint
          </button>
        </div>
      </div>

      {/* New endpoint form */}
      {addingNew && (
        <div className="card">
          <div className="card-header">
            <div className="card-title"><Plus size={14} /> Nuevo endpoint</div>
          </div>
          <EpForm
            ep={newEp}
            onChange={(f, v) => setNewEp(prev => ({ ...prev, [f]: v }))}
            onSave={() => saveEndpoint(newEp)}
            onCancel={() => { setAddingNew(false); setNewEp({ ...EMPTY_EP }) }}
          />
        </div>
      )}

      {/* Existing endpoints */}
      {loading ? (
        <div className="card"><div className="empty"><div className="spinner" /></div></div>
      ) : endpoints.length === 0 && !addingNew ? (
        <div className="card">
          <div className="empty">
            <Webhook size={32} />
            <p>Sin endpoints configurados.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setAddingNew(true)}>
              <Plus size={13} /> Añadir el primero
            </button>
          </div>
        </div>
      ) : (
        endpoints.map(ep => (
          <EndpointCard
            key={ep.id}
            ep={ep}
            saving={saving}
            testing={testing}
            testResult={testResults[ep.key]}
            onSave={saveEndpoint}
            onDelete={() => deleteEndpoint(ep.id!, ep.label)}
            onTest={() => testEndpoint(ep)}
          />
        ))
      )}
    </>
  )
}

function EndpointCard({ ep, saving, testing, testResult, onSave, onDelete, onTest }: {
  ep: Endpoint
  saving: string | null
  testing: string | null
  testResult: 'ok' | 'error' | null
  onSave: (ep: Endpoint) => void
  onDelete: () => void
  onTest: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Endpoint>(ep)

  if (editing) {
    return (
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Webhook size={14} />{ep.label}</div>
        </div>
        <EndpointCardForm
          ep={draft}
          onChange={(f, v) => setDraft(prev => ({ ...prev, [f]: v }))}
          onSave={() => { onSave(draft); setEditing(false) }}
          onCancel={() => { setDraft(ep); setEditing(false) }}
          saving={saving === ep.key}
        />
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          <Webhook size={14} />
          {ep.label}
          <span className={`badge ${ep.active ? 'badge-green' : 'badge-amber'}`}>
            {ep.active ? 'activo' : 'inactivo'}
          </span>
          {testResult === 'ok' && <span className="badge badge-green"><CheckCircle size={10} />OK</span>}
          {testResult === 'error' && <span className="badge badge-red"><XCircle size={10} />Error</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onTest} disabled={testing === ep.key}>
            <TestTube size={13} />
            {testing === ep.key ? 'Testing...' : 'Test'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            Editar
          </button>
          <button className="btn btn-danger btn-sm" onClick={onDelete}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      <div className="card-body" style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-blue">{ep.method}</span>
          <span className="mono" style={{ fontSize: 12, color: 'var(--text2)', wordBreak: 'break-all' }}>{ep.url}</span>
        </div>
        {ep.description && <p style={{ fontSize: 12, color: 'var(--text3)' }}>{ep.description}</p>}
        <p style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>
          Auth header: {ep.api_key_header || 'ninguno'}
        </p>
      </div>
    </div>
  )
}

function EndpointCardForm({ ep, onChange, onSave, onCancel, saving }: any) {
  return (
    <div style={{ display: 'grid', gap: 14, padding: '20px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div className="field">
          <label className="field-label">Nombre visible</label>
          <input type="text" value={ep.label} onChange={e => onChange('label', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Activo</label>
          <select value={ep.active ? 'true' : 'false'} onChange={e => onChange('active', e.target.value === 'true')}>
            <option value="true">Sí</option>
            <option value="false">No</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field-label">URL</label>
        <input type="url" value={ep.url} onChange={e => onChange('url', e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 14 }}>
        <div className="field">
          <label className="field-label">Header auth</label>
          <input type="text" value={ep.api_key_header} onChange={e => onChange('api_key_header', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Valor</label>
          <input type="password" value={ep.api_key_value} onChange={e => onChange('api_key_value', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Método</label>
          <select value={ep.method} onChange={e => onChange('method', e.target.value)}>
            <option>POST</option><option>PUT</option><option>GET</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label className="field-label">Descripción</label>
        <input type="text" value={ep.description} onChange={e => onChange('description', e.target.value)} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>
          <Save size={13} />{saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}
