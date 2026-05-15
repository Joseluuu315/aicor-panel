import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { supabase } from '../lib/supabase'

// ─── Credenciales del Super Admin (desde .env) ────────────────────────────────
const SA_USER = import.meta.env.VITE_SUPER_ADMIN_USER || 'admin'
const SA_PASS = import.meta.env.VITE_SUPER_ADMIN_PASS || 'aicor2024'
const SESSION_KEY = 'aicor_panel_session'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type UserRole = 'superadmin' | 'admin' | 'user'

export interface PanelUser {
  role: UserRole
  email: string
  /** null = superadmin (ve todos los clientes sin filtro) */
  clientId: string | null
  displayName: string
}

interface AuthContextType {
  user: PanelUser | null
  isAuthenticated: boolean
  login: (emailOrUser: string, pass: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

// ─── Persistencia de sesión superadmin en sessionStorage ──────────────────────
function saveSuperAdminSession(email: string) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role: 'superadmin', email }))
}
function clearSession() {
  sessionStorage.removeItem(SESSION_KEY)
}
function loadSuperAdminSession(): PanelUser | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed.role !== 'superadmin') return null
    return { role: 'superadmin', email: parsed.email, clientId: null, displayName: 'Super Admin' }
  } catch {
    return null
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────
const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PanelUser | null>(() => loadSuperAdminSession())

  // Al montar, restaurar sesión de Supabase Auth si existía
  useEffect(() => {
    // Si ya hay superadmin en sessionStorage, no tocar nada
    if (user?.role === 'superadmin') return

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session?.user) {
        await hydrateSupabaseUser(data.session.user.email ?? '')
      }
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        await hydrateSupabaseUser(session.user.email ?? '')
      } else {
        // Solo limpiar si no somos superadmin
        setUser(prev => (prev?.role === 'superadmin' ? prev : null))
      }
    })

    return () => sub.subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Carga el perfil del usuario de Supabase Auth desde panel_users */
  async function hydrateSupabaseUser(email: string) {
    const { data } = await supabase.rpc('get_my_panel_profile')
    if (data && data.length > 0) {
      const profile = data[0]
      setUser({
        role: profile.role as UserRole,
        email,
        clientId: profile.client_id ?? null,
        displayName: email.split('@')[0],
      })
    }
  }

  const login = useCallback(async (
    emailOrUser: string,
    pass: string
  ): Promise<{ ok: boolean; error?: string }> => {

    // ── 1. Superadmin por .env ────────────────────────────────────────────────
    if (emailOrUser === SA_USER && pass === SA_PASS) {
      const superAdmin: PanelUser = {
        role: 'superadmin',
        email: SA_USER,
        clientId: null,
        displayName: 'Super Admin',
      }
      saveSuperAdminSession(SA_USER)
      setUser(superAdmin)
      return { ok: true }
    }

    // ── 2. Admin / User por Supabase Auth ─────────────────────────────────────
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: emailOrUser,
      password: pass,
    })

    if (authError) {
      return { ok: false, error: 'Credenciales incorrectas.' }
    }

    // hydrateSupabaseUser se ejecutará vía onAuthStateChange
    // Pero también lo hacemos aquí para respuesta inmediata
    const { data: profileData, error: profileError } = await supabase.rpc('get_my_panel_profile')

    if (profileError || !profileData?.length) {
      await supabase.auth.signOut()
      return { ok: false, error: 'Tu cuenta no tiene un perfil de panel asignado. Contacta al administrador.' }
    }

    const profile = profileData[0]
    const { data: { user: authUser } } = await supabase.auth.getUser()

    setUser({
      role: profile.role as UserRole,
      email: authUser?.email ?? emailOrUser,
      clientId: profile.client_id ?? null,
      displayName: (authUser?.email ?? emailOrUser).split('@')[0],
    })

    return { ok: true }
  }, [])

  const logout = useCallback(async () => {
    clearSession()
    if (user?.role !== 'superadmin') {
      await supabase.auth.signOut()
    }
    setUser(null)
  }, [user])

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

// ─── Guards de rol ────────────────────────────────────────────────────────────

/** true si el usuario puede ver y gestionar todos los clientes */
export function isSuperAdmin(user: PanelUser | null): boolean {
  return user?.role === 'superadmin'
}

/** true si puede acceder a configuración, endpoints, scraper, etc. */
export function isAtLeastAdmin(user: PanelUser | null): boolean {
  return user?.role === 'superadmin' || user?.role === 'admin'
}

/** Devuelve el client_id a aplicar en las queries de Supabase.
 *  Si es superadmin (clientId === null) devuelve null → sin filtro. */
export function getActiveClientId(user: PanelUser | null): string | null {
  return user?.clientId ?? null
}
