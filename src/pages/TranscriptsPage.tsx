import { useEffect, useState } from 'react'
import { supabase, TranscriptLog, ChatSession } from '../lib/supabase'
import { useAuth, getActiveClientId } from '../hooks/useAuth'
import { FileText, ExternalLink, MessageSquare, User, Bot, RefreshCw, ChevronRight } from 'lucide-react'
import toast from 'react-hot-toast'

export function TranscriptsPage() {
  const { user } = useAuth()
  const clientId = getActiveClientId(user)

  const [transcripts, setTranscripts] = useState<TranscriptLog[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<TranscriptLog | null>(null)
  const [messages, setMessages] = useState<ChatSession[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)

  async function load() {
    setLoading(true)
    let q = supabase
      .from('transcript_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (clientId) q = q.eq('client_id', clientId)
    const { data, error } = await q
    if (error) toast.error('Error cargando transcripts')
    setTranscripts(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [clientId])

  async function openTranscript(t: TranscriptLog) {
    setSelected(t)
    setLoadingMsgs(true)
    // Buscar los mensajes de la sesión que generó este transcript
    // Usamos el file_name para aproximar la sesión por timestamp
    const created = new Date(t.created_at)
    const from = new Date(created.getTime() - 60 * 60 * 1000).toISOString()
    const to   = new Date(created.getTime() + 5 * 60 * 1000).toISOString()

    let msgsQ = supabase
      .from('chat_sessions')
      .select('*')
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: true })
      .limit(100)
    if (clientId) msgsQ = msgsQ.eq('client_id', clientId)
    const { data } = await msgsQ

    setMessages(data || [])
    setLoadingMsgs(false)
  }

  if (selected) {
    return (
      <>
        <div className="page-header">
          <div>
            <div className="page-title">Transcript: {selected.lead_nombre}</div>
            <div className="page-subtitle">{selected.file_name} · {selected.message_count} mensajes</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {selected.file_url && (
              <a href={selected.file_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                <ExternalLink size={13} /> Abrir HTML
              </a>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(null)}>
              ← Volver
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title"><MessageSquare size={14} />Conversación completa</div>
            <span className={`badge ${selected.upload_status === 'OK' ? 'badge-green' : 'badge-red'}`}>
              Supabase: {selected.upload_status}
            </span>
          </div>
          <div style={{ padding: '16px' }}>
            {loadingMsgs ? (
              <div className="empty"><div className="spinner" /><p>Cargando mensajes...</p></div>
            ) : messages.length === 0 ? (
              <div className="empty">
                <MessageSquare size={28} />
                <p>No se encontraron mensajes en la ventana de tiempo de este transcript.</p>
                <p style={{ fontSize: 11 }}>Los mensajes de chat_sessions pueden haber expirado.</p>
              </div>
            ) : (
              <div className="transcript-viewer">
                {messages.map(msg => (
                  <div key={msg.id} className="transcript-msg">
                    <div className={`msg-avatar ${msg.role}`}>
                      {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                    </div>
                    <div className="msg-body">
                      <div className="msg-role">
                        {msg.role === 'user' ? '👤 Usuario' : '🤖 Asistente'} ·{' '}
                        {new Date(msg.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="msg-content">{msg.content}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Transcripts</div>
          <div className="page-subtitle">historial de conversaciones guardadas</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} className={loading ? 'spin' : ''} />
          Actualizar
        </button>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty"><div className="spinner" /><p>Cargando...</p></div>
        ) : transcripts.length === 0 ? (
          <div className="empty"><FileText size={32} /><p>Sin transcripts todavía</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Lead</th>
                  <th>Email</th>
                  <th>Mensajes</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {transcripts.map(t => (
                  <tr key={t.id} style={{ cursor: 'pointer' }} onClick={() => openTranscript(t)}>
                    <td><strong>{t.lead_nombre || '—'}</strong></td>
                    <td className="mono">{t.lead_email || '—'}</td>
                    <td className="mono">{t.message_count}</td>
                    <td>
                      <span className={`badge ${t.upload_status === 'OK' ? 'badge-green' : 'badge-red'}`}>
                        {t.upload_status}
                      </span>
                    </td>
                    <td className="mono">
                      {new Date(t.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                        {t.file_url && (
                          <a href={t.file_url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                            <ExternalLink size={12} />
                          </a>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => openTranscript(t)}>
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}
