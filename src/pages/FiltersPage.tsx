import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth, getActiveClientId } from '../hooks/useAuth'
import { triggerN8nConfigUpdate } from '../lib/n8n'
import { Shield, Plus, Trash2, RefreshCw, Save, AlertTriangle, Globe, Code, Type } from 'lucide-react'
import toast from 'react-hot-toast'

// ─── BUILT-IN FILTERS (from n8n flow) ────────────────────────────────────────
// These are the defaults hardcoded in the n8n "Filtro de Intención" node.
// They're shown as reference — actual dynamic rules come from bot_config key "filters_json"

const BUILTIN_DOMAINS = [
    'bit.ly', 'tinyurl.com', 'cutt.ly', 'shorturl.at', 'ow.ly', 't.co',
    'rebrand.ly', 'bl.ink', 'onlyfans.com', 'xvideos.com', 'pornhub.com',
    'casino', 'bet365', 'betfair', 'phishing-site.com',
]

const BUILTIN_KEYWORDS = [
    'puta', 'coño', 'gilipollas', 'imbécil', 'idiota', 'estupido',
    'hijo de puta', 'mierda', 'buy now', 'click here', 'free money',
    'viagra', 'casino', 'jackpot', 'ignore previous instructions',
    'act as dan', 'pretend you are without restrictions',
]

interface FilterEntry {
    id: string
    type: 'domain' | 'keyword' | 'pattern'
    value: string
    label: string
    active: boolean
}

type TabType = 'domains' | 'keywords' | 'patterns'

const TAB_ICONS = {
    domains: <Globe size={13} />,
    keywords: <Type size={13} />,
    patterns: <Code size={13} />,
}

const TAB_LABELS = {
    domains: 'Dominios baneados',
    keywords: 'Palabras bloqueadas',
    patterns: 'Patrones regex',
}

export function FiltersPage() {
    const { user } = useAuth()
    const clientId = getActiveClientId(user)

    const [tab, setTab] = useState<TabType>('domains')
    const [filters, setFilters] = useState<FilterEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [newVal, setNewVal] = useState('')
    const [newLabel, setNewLabel] = useState('')
    const [maxLen, setMaxLen] = useState(800)
    const [maxLenDraft, setMaxLenDraft] = useState('800')
    const [webhookStatus, setWebhookStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle')

    async function load() {
        setLoading(true)
        try {
            // We store filters as a JSON blob in bot_config key="filters_json"
            let q = supabase
                .from('bot_config')
                .select('value')
                .eq('key', 'filters_json')
            if (clientId) {
                q = q.eq('client_id', clientId)
            } else {
                q = q.is('client_id', null)
            }
            const { data } = await q.single()

            if (data?.value) {
                const parsed = JSON.parse(data.value)
                setFilters(parsed.entries || [])
                setMaxLen(parsed.max_message_length || 800)
                setMaxLenDraft(String(parsed.max_message_length || 800))
            } else {
                // Seed with builtins
                const seed: FilterEntry[] = [
                    ...BUILTIN_DOMAINS.map((d, i) => ({
                        id: `builtin-d-${i}`,
                        type: 'domain' as const,
                        value: d,
                        label: d,
                        active: true,
                    })),
                    ...BUILTIN_KEYWORDS.map((k, i) => ({
                        id: `builtin-k-${i}`,
                        type: 'keyword' as const,
                        value: k,
                        label: k,
                        active: true,
                    })),
                ]
                setFilters(seed)
            }
        } catch {
            toast.error('Error cargando filtros')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { load() }, [clientId])

    async function saveAll(entries: FilterEntry[], len?: number) {
        setSaving(true)
        setWebhookStatus('sending')
        try {
            const payload = {
                entries,
                max_message_length: len ?? maxLen,
                updated_at: new Date().toISOString(),
            }

            // Upsert into bot_config
            const { error } = await supabase
                .from('bot_config')
                .upsert({
                    key: 'filters_json',
                    client_id: clientId || null,
                    value: JSON.stringify(payload),
                    label: 'Filtros de intención',
                    description: 'Reglas de bloqueo del Filtro de Intención en n8n',
                    type: 'json',
                    category: 'general',
                    sort_order: 99,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'client_id,key' })

            if (error) throw error

            const n8nOk = await triggerN8nConfigUpdate({
                action: 'update_config',
                key: 'filters_json',
                value: JSON.stringify(payload),
            })

            setWebhookStatus(n8nOk ? 'ok' : 'error')
            toast.success(`Filtros guardados${n8nOk ? ' · n8n actualizado' : ' (n8n offline)'}`)
            setFilters(entries)
            if (len !== undefined) setMaxLen(len)
        } catch (e: any) {
            setWebhookStatus('error')
            toast.error(e.message || 'Error guardando filtros')
        } finally {
            setSaving(false)
        }
    }

    function addEntry() {
        const v = newVal.trim()
        if (!v) return
        if (filters.some(f => f.value === v && f.type === tab.slice(0, -1) as any)) {
            return toast.error('Ya existe este valor')
        }
        const entry: FilterEntry = {
            id: `custom-${Date.now()}`,
            type: tab === 'domains' ? 'domain' : tab === 'keywords' ? 'keyword' : 'pattern',
            value: v,
            label: newLabel.trim() || v,
            active: true,
        }
        const updated = [...filters, entry]
        setNewVal('')
        setNewLabel('')
        saveAll(updated)
    }

    function toggleEntry(id: string) {
        const updated = filters.map(f => f.id === id ? { ...f, active: !f.active } : f)
        saveAll(updated)
    }

    function deleteEntry(id: string) {
        if (!confirm('¿Eliminar este filtro?')) return
        saveAll(filters.filter(f => f.id !== id))
    }

    const typeMap: Record<TabType, FilterEntry['type']> = {
        domains: 'domain', keywords: 'keyword', patterns: 'pattern',
    }
    const visible = filters.filter(f => f.type === typeMap[tab])
    const activeCount = visible.filter(f => f.active).length

    return (
        <>
            <div className="page-header">
                <div>
                    <div className="page-title">Filtros de intención</div>
                    <div className="page-subtitle">gestiona qué mensajes bloquea el bot antes de consumir tokens de IA</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {webhookStatus !== 'idle' && (
                        <div className={`webhook-indicator ${webhookStatus}`} style={{ fontSize: 11 }}>
                            {{ sending: '⟳ Notificando n8n...', ok: '✓ n8n actualizado', error: '✗ n8n offline' }[webhookStatus]}
                        </div>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
                        <RefreshCw size={13} className={loading ? 'spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Max message length */}
            <div className="card">
                <div className="card-header">
                    <div className="card-title"><AlertTriangle size={14} />Longitud máxima de mensaje</div>
                </div>
                <div className="card-body">
                    <p className="field-hint" style={{ marginBottom: 12 }}>
                        Mensajes más largos que este límite se bloquean automáticamente (protección contra dumps de texto y ataques de inyección).
                    </p>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <input
                            type="number"
                            value={maxLenDraft}
                            onChange={e => setMaxLenDraft(e.target.value)}
                            style={{ width: 120 }}
                            min={100}
                            max={5000}
                        />
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>caracteres</span>
                        <button
                            className="btn btn-primary btn-sm"
                            disabled={saving || String(maxLen) === maxLenDraft}
                            onClick={() => saveAll(filters, parseInt(maxLenDraft) || 800)}
                        >
                            <Save size={13} />
                            Guardar
                        </button>
                    </div>
                </div>
            </div>

            {/* Filter tabs */}
            <div className="card">
                <div className="tabs">
                    {(['domains', 'keywords', 'patterns'] as TabType[]).map(t => {
                        const count = filters.filter(f => f.type === typeMap[t]).length
                        return (
                            <button
                                key={t}
                                className={`tab ${tab === t ? 'active' : ''}`}
                                onClick={() => setTab(t)}
                            >
                                {TAB_ICONS[t]}
                                {TAB_LABELS[t]}
                                <span style={{
                                    marginLeft: 4,
                                    fontSize: 10,
                                    background: tab === t ? 'rgba(79,128,247,.2)' : 'var(--bg4)',
                                    color: tab === t ? 'var(--accent)' : 'var(--text3)',
                                    padding: '1px 6px',
                                    borderRadius: 100,
                                    fontFamily: 'var(--mono)',
                                }}>
                                    {count}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Add new */}
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border1)', background: 'var(--bg3)' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="text"
                            value={newVal}
                            onChange={e => setNewVal(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && addEntry()}
                            placeholder={
                                tab === 'domains' ? 'ejemplo.com' :
                                    tab === 'keywords' ? 'palabra clave' :
                                        '/patron-regex/i'
                            }
                            style={{ flex: 1 }}
                        />
                        <input
                            type="text"
                            value={newLabel}
                            onChange={e => setNewLabel(e.target.value)}
                            placeholder="Etiqueta (opcional)"
                            style={{ width: 200 }}
                        />
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={addEntry}
                            disabled={!newVal.trim() || saving}
                        >
                            <Plus size={13} /> Añadir
                        </button>
                    </div>
                    {tab === 'patterns' && (
                        <p className="field-hint" style={{ marginTop: 8, fontSize: 11 }}>
                            Escribe el patrón como string JS: <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>buy now|click here</code> — se usará como <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>/patrón/i</code>
                        </p>
                    )}
                </div>

                {/* Filter list */}
                {loading ? (
                    <div className="empty"><div className="spinner" /></div>
                ) : visible.length === 0 ? (
                    <div className="empty">
                        <Shield size={28} />
                        <p>Sin {TAB_LABELS[tab].toLowerCase()} configurados</p>
                    </div>
                ) : (
                    <div className="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Valor</th>
                                    <th>Etiqueta</th>
                                    <th>Estado</th>
                                    <th style={{ width: 80 }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map(f => (
                                    <tr key={f.id}>
                                        <td className="mono" style={{ color: f.active ? 'var(--text1)' : 'var(--text4)' }}>
                                            {f.value}
                                        </td>
                                        <td style={{ color: 'var(--text3)', fontSize: 12 }}>{f.label}</td>
                                        <td>
                                            <label className="toggle" title={f.active ? 'Activo — clic para desactivar' : 'Inactivo — clic para activar'}>
                                                <input
                                                    type="checkbox"
                                                    checked={f.active}
                                                    onChange={() => toggleEntry(f.id)}
                                                />
                                                <span className="toggle-track" />
                                            </label>
                                        </td>
                                        <td>
                                            <button
                                                className="btn btn-danger btn-sm"
                                                onClick={() => deleteEntry(f.id)}
                                                title="Eliminar"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div style={{
                    padding: '10px 20px',
                    borderTop: '1px solid var(--border1)',
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    color: 'var(--text4)',
                }}>
                    {activeCount} activos · {visible.length - activeCount} desactivados · {visible.length} total
                </div>
            </div>
        </>
    )
}