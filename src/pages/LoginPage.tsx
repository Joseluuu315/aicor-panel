import { useState, FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Lock, AlertCircle, Bot } from 'lucide-react'

const SA_USER = import.meta.env.VITE_SUPER_ADMIN_USER || 'admin'

export function LoginPage() {
  const { login } = useAuth()
  const [credential, setCredential] = useState('')
  const [pass, setPass]             = useState('')
  const [error, setError]           = useState('')
  const [loading, setLoading]       = useState(false)

  // Detectar si el usuario está intentando entrar como superadmin
  // (el campo acepta tanto el nombre de usuario del .env como un email)
  const isSuperAdminAttempt = credential === SA_USER

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { ok, error: loginError } = await login(credential, pass)
    if (!ok) setError(loginError || 'Credenciales incorrectas.')
    setLoading(false)
  }

  return (
    <div className="login-wrap">
      <div className="login-grid" />
      <div className="login-card">
        <div className="login-logo">
          <Bot size={20} style={{ color: 'var(--accent)' }} />
          aicor<span>/</span>
        </div>
        <div className="login-tagline">panel de control del chatbot</div>

        <form className="login-fields" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label">
              {isSuperAdminAttempt ? 'Usuario' : 'Email'}
            </label>
            <input
              id="login-credential"
              type={isSuperAdminAttempt ? 'text' : 'email'}
              value={credential}
              onChange={e => setCredential(e.target.value)}
              placeholder={`${SA_USER} o email@empresa.com`}
              autoFocus
              autoComplete="username"
            />
          </div>

          <div className="field">
            <label className="field-label">Contraseña</label>
            <input
              id="login-password"
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="login-error">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !credential || !pass}
          >
            <Lock size={14} />
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
        </form>

        <div style={{
          marginTop: 20,
          padding: '10px 14px',
          background: 'rgba(79,128,247,0.06)',
          border: '1px solid rgba(79,128,247,0.15)',
          borderRadius: 8,
          fontSize: 11,
          color: 'var(--text3)',
          lineHeight: 1.5,
        }}>
          <strong style={{ color: 'var(--text2)' }}>Roles de acceso:</strong><br />
          👑 <strong>superadmin</strong> — acceso total (credenciales del sistema)<br />
          🔧 <strong>admin</strong> — gestión de su cliente asignado<br />
          👤 <strong>user</strong> — solo lectura de su cliente
        </div>
      </div>
    </div>
  )
}
