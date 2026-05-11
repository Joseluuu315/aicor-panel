import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

const PANEL_USER = import.meta.env.VITE_PANEL_USER || 'admin'
const PANEL_PASS = import.meta.env.VITE_PANEL_PASS || 'aicor2024'
const SESSION_KEY = 'aicor_panel_auth'

interface AuthContextType {
  isAuthenticated: boolean
  login: (user: string, pass: string) => boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem(SESSION_KEY) === 'true'
  })

  const login = (user: string, pass: string) => {
    if (user === PANEL_USER && pass === PANEL_PASS) {
      sessionStorage.setItem(SESSION_KEY, 'true')
      setIsAuthenticated(true)
      return true
    }
    return false
  }

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY)
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
