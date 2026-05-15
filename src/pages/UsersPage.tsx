import { useEffect, useState, FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth, isSuperAdmin } from '../hooks/useAuth'
import { Users, Plus, Trash2, RefreshCw, Shield, User, Eye, EyeOff, Crown, AlertTriangle, Building2, Copy } from 'lucide-react'
import toast from 'react-hot-toast'

interface PanelUserRow {
  id: string
  email: string
  role: 'admin' | 'user'
  client_id: string | null
  created_at: string
  company_name?: string
}

interface BotClient {
  id: string
  company_name: string
  slug: string
}

export function UsersPage() {
  const { user } = useAuth()
  if (!isSuperAdmin(user)) {
    return (
      <div className="empty" style={{ marginTop: 80 }}>
        <AlertTriangle size={32} style={{ color: 'var(--yellow)' }} />
        <p>Acceso denegado. Se requiere rol <strong>superadmin</strong>.</p>
      </div>
    )
  }
  return <UsersPageInner />
}

function UsersPageInner() {
  const [panelUsers, setPanelUsers] = useState<PanelUserRow[]>([])
  const [clients, setClients]       = useState<BotClient[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [formEmail,    setFormEmail]    = useState('')
  const [formPass,     setFormPass]     = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [formRole,     setFormRole]     = useState<'admin' | 'user'>('user')
  const [formCompany,  setFormCompany]  = useState('')
  const [creating,     setCreating]     = useState(false)

  async function load() {
    setLoading(true)
    try {
      const [usersResp, clientsResp] = await Promise.all([
        supabase.rpc('admin_get_all_users'),
        supabase.rpc('admin_get_all_clients'),
      ])
      if (usersResp.error) throw usersResp.error
      const clientMap = Object.fromEntries((clientsResp.data || []).map((c: any) => [c.id, c.company_name]))
      const enriched = (usersResp.data || []).map((u: any) => ({
        ...u,
        company_name: u.client_id ? (clientMap[u.client_id] ?? '—') : '—',
      }))
      setPanelUsers(enriched)
      setClients(clientsResp.data || [])
    } catch (e: any) {
      toast.error('Error cargando usuarios: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function createUser(e: FormEvent) {
    e.preventDefault()
    if (!formEmail || !formPass || !formCompany) return
    setCreating(true)

    try {
      // 1. Crear usuario en Supabase Auth con signUp
      //    (funciona sin service role si "Confirm email" está desactivado en el proyecto)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formEmail,
        password: formPass,
      })

      if (authError) throw authError

      const newUserId = authData?.user?.id
      if (!newUserId) {
        throw new Error(
          'No se pudo obtener el ID del nuevo usuario. Verifica que "Confirm email" está DESACTIVADO en Supabase → Authentication → Providers → Email.'
        )
      }

      // 2. Llamar al RPC para saltar el RLS y crear la empresa y el perfil
      const { error: rpcError } = await supabase.rpc('admin_setup_user', {
        p_company_name: formCompany.trim(),
        p_user_id: newUserId,
        p_email: formEmail,
        p_role: formRole,
      })

      if (rpcError) throw rpcError

      // 3. Cerrar la sesión del usuario recién creado (el superadmin usa sessionStorage, no se afecta)
      await supabase.auth.signOut()

      toast.success(`✓ Usuario ${formEmail} creado como ${formRole} → ${formCompany}`)
      setShowForm(false)
      setFormEmail('')
      setFormPass('')
      setFormRole('user')
      setFormCompany('')
      load()
    } catch (e: any) {
      toast.error('Error: ' + (e.message || String(e)))
    } finally {
      setCreating(false)
    }
  }

  async function deleteUser(u: PanelUserRow) {
    if (!confirm(`¿Eliminar el usuario ${u.email}?`)) return
    const { error } = await supabase.rpc('admin_delete_user', { p_user_id: u.id })
    if (error) toast.error('Error eliminando usuario')
    else { toast.success(`${u.email} eliminado`); load() }
  }

  async function updateRole(u: PanelUserRow, newRole: 'admin' | 'user') {
    const { error } = await supabase.rpc('admin_update_user_role', { p_user_id: u.id, p_role: newRole })
    if (error) toast.error('Error actualizando rol')
    else { toast.success('Rol actualizado'); load() }
  }

  async function updateClient(u: PanelUserRow, newClientId: string) {
    const { error } = await supabase.rpc('admin_update_user_client', { p_user_id: u.id, p_client_id: newClientId || null })
    if (error) toast.error('Error actualizando empresa')
    else { toast.success('Empresa actualizada'); load() }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Gestión de Usuarios</div>
          <div className="page-subtitle">asigna usuarios a empresas · cada usuario solo ve los datos de su empresa</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Actualizar
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
            <Plus size={13} /> {showForm ? 'Cancelar' : 'Nuevo usuario'}
          </button>
        </div>
      </div>

      {/* Superadmin info */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title"><Crown size={14} style={{ color: 'var(--yellow)' }} />Super Admin (sistema)</div>
          <span className="badge" style={{ background: 'rgba(251,191,36,0.1)', color: 'var(--yellow)', border: '1px solid rgba(251,191,36,0.2)' }}>.env</span>
        </div>
        <div style={{ padding: '10px 20px 14px', fontSize: 12, color: 'var(--text3)' }}>
          Autenticado con <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>VITE_SUPER_ADMIN_USER / VITE_SUPER_ADMIN_PASS</code>. No tiene fila en la base de datos. Acceso total a todas las empresas.
        </div>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="card" style={{ marginBottom: 16, border: '1px solid var(--accent)', borderRadius: 10 }}>
          <div className="card-header">
            <div className="card-title"><Users size={14} />Crear nuevo usuario</div>
          </div>
          <form onSubmit={createUser} style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Empresa */}
            <div className="field">
              <label className="field-label">
                <Building2 size={12} style={{ display: 'inline', marginRight: 4 }} />
                Nombre de empresa
              </label>
              <input
                type="text"
                value={formCompany}
                onChange={e => setFormCompany(e.target.value)}
                placeholder="Ej: Empresa de Prueba1"
                required
              />
              <p className="field-hint" style={{ marginTop: 4, fontSize: 11 }}>
                Si la empresa ya existe en <code style={{ fontFamily: 'var(--mono)' }}>bot_clients</code>, se usará su ID. Si no, se creará automáticamente.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label className="field-label">Email</label>
                <input type="email" value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="usuario@empresa.com" required />
              </div>
              <div className="field">
                <label className="field-label">Contraseña inicial</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={formPass}
                    onChange={e => setFormPass(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required minLength={6}
                    style={{ paddingRight: 36 }}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', padding: 0 }}>
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div className="field">
                <label className="field-label">Rol</label>
                <select value={formRole} onChange={e => setFormRole(e.target.value as 'admin' | 'user')}>
                  <option value="admin">🔧 Admin</option>
                  <option value="user">👤 Usuario</option>
                </select>
              </div>
            </div>

            <div style={{
              padding: '10px 14px',
              background: 'rgba(79,128,247,0.06)',
              border: '1px solid rgba(79,128,247,0.15)',
              borderRadius: 8,
              fontSize: 11,
              color: 'var(--text3)',
            }}>
              ⚠️ Requiere <strong>"Confirm email" desactivado</strong> en Supabase → Authentication → Providers → Email
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={creating || !formEmail || !formPass || !formCompany}>
                <Plus size={13} /> {creating ? 'Creando...' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabla */}
      <div className="card">
        <div className="card-header">
          <div className="card-title"><Users size={14} />Usuarios del panel</div>
          <span className="badge badge-blue">{panelUsers.length}</span>
        </div>
        {loading ? (
          <div className="empty"><div className="spinner" /><p>Cargando...</p></div>
        ) : panelUsers.length === 0 ? (
          <div className="empty">
            <Users size={32} />
            <p>Sin usuarios todavía</p>
            <p style={{ fontSize: 12, color: 'var(--text3)' }}>Crea el primer usuario con el botón de arriba.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Rol</th>
                  <th>Empresa / client_id</th>
                  <th>Creado</th>
                  <th style={{ width: 60 }}>—</th>
                </tr>
              </thead>
              <tbody>
                {panelUsers.map(u => (
                  <tr key={u.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{u.email}</td>
                    <td>
                      <select
                        value={u.role}
                        onChange={e => updateRole(u, e.target.value as 'admin' | 'user')}
                        style={{ background: 'var(--bg3)', border: '1px solid var(--border1)', borderRadius: 6, padding: '3px 8px', fontSize: 12, color: u.role === 'admin' ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer' }}
                      >
                        <option value="admin">🔧 Admin</option>
                        <option value="user">👤 Usuario</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={u.client_id ?? ''}
                        onChange={e => updateClient(u, e.target.value)}
                        style={{ background: 'var(--bg3)', border: '1px solid var(--border1)', borderRadius: 6, padding: '3px 8px', fontSize: 12, cursor: 'pointer', maxWidth: 220 }}
                      >
                        <option value="">— Sin empresa —</option>
                        {clients.map(c => (
                          <option key={c.id} value={c.id}>{c.company_name}</option>
                        ))}
                      </select>
                      {u.client_id && (
                        <div className="mono" style={{ fontSize: 10, color: 'var(--text4)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {u.client_id.slice(0, 8)}…
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(u.client_id!)
                              toast.success('Client ID copiado al portapapeles', { icon: '📋', style: { fontSize: 12 } })
                            }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--cyan)' }}
                            title="Copiar ID completo"
                          >
                            <Copy size={11} />
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {new Date(u.created_at).toLocaleDateString('es-ES')}
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u)} title="Eliminar">
                        <Trash2 size={12} />
                      </button>
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
