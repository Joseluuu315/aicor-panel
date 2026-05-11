import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Activity, Users, FileText, CheckCircle, XCircle, Clock } from 'lucide-react'

interface Stats {
  leads_ok: number
  leads_error: number
  transcripts: number
  sessions_today: number
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats>({ leads_ok: 0, leads_error: 0, transcripts: 0, sessions_today: 0 })
  const [recentLeads, setRecentLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [leadsOk, leadsErr, transcripts, recentResp] = await Promise.all([
          supabase.from('lead_logs').select('id', { count: 'exact', head: true }).eq('estado', 'OK'),
          supabase.from('lead_logs').select('id', { count: 'exact', head: true }).eq('estado', 'ERROR'),
          supabase.from('transcript_logs').select('id', { count: 'exact', head: true }),
          supabase.from('lead_logs').select('*').order('created_at', { ascending: false }).limit(8),
        ])

        const todayStart = new Date()
        todayStart.setHours(0, 0, 0, 0)
        const sessionsToday = await supabase
          .from('chat_sessions')
          .select('session_id', { count: 'exact', head: true })
          .gte('created_at', todayStart.toISOString())

        setStats({
          leads_ok: leadsOk.count || 0,
          leads_error: leadsErr.count || 0,
          transcripts: transcripts.count || 0,
          sessions_today: sessionsToday.count || 0,
        })

        setRecentLeads(recentResp.data || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">resumen de actividad del chatbot</div>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">Leads OK</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>{loading ? '—' : stats.leads_ok}</div>
          <div className="stat-sub">Enviados correctamente a ERP</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Leads con error</div>
          <div className="stat-value" style={{ color: 'var(--red)' }}>{loading ? '—' : stats.leads_error}</div>
          <div className="stat-sub">Fallaron al enviar al ERP</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Transcripts</div>
          <div className="stat-value">{loading ? '—' : stats.transcripts}</div>
          <div className="stat-sub">Guardados en Supabase Storage</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Mensajes hoy</div>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>{loading ? '—' : stats.sessions_today}</div>
          <div className="stat-sub">Mensajes en chat_sessions</div>
        </div>
      </div>

      {/* Recent leads */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Activity size={14} />
            Leads recientes
          </div>
        </div>
        {loading ? (
          <div className="empty"><div className="spinner" /><p>Cargando...</p></div>
        ) : recentLeads.length === 0 ? (
          <div className="empty"><Users size={32} /><p>Sin leads todavía</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Email</th>
                  <th>Producto</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {recentLeads.map(lead => (
                  <tr key={lead.id}>
                    <td>{lead.nombre || '—'}</td>
                    <td className="mono">{lead.email || '—'}</td>
                    <td>{lead.producto_interes || '—'}</td>
                    <td>
                      <span className={`badge ${lead.estado === 'OK' ? 'badge-green' : 'badge-red'}`}>
                        {lead.estado === 'OK' ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {lead.estado}
                      </span>
                    </td>
                    <td className="mono">
                      {lead.created_at
                        ? new Date(lead.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
                        : '—'}
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
