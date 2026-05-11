import { useState, FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Lock, AlertCircle } from 'lucide-react'

export function LoginPage() {
  const { login } = useAuth()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setTimeout(() => {
      const ok = login(user, pass)
      if (!ok) setError('Credenciales incorrectas.')
      setLoading(false)
    }, 400)
  }

  return (
    <div className="login-wrap">
      <div className="login-grid" />
      <div className="login-card">
        <div className="login-logo">aicor/</div>
        <div className="login-tagline">panel de control del chatbot</div>
        <form className="login-fields" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label">Usuario</label>
            <input
              type="text"
              value={user}
              onChange={e => setUser(e.target.value)}
              placeholder="admin"
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="field">
            <label className="field-label">Contraseña</label>
            <input
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
          <button type="submit" className="btn btn-primary" disabled={loading || !user || !pass}>
            <Lock size={14} />
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
