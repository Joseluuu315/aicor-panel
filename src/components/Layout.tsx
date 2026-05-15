import { ReactNode } from 'react'
import {
  LayoutDashboard, MessageSquare, Webhook, FileText,
  Settings, LogOut, Bot, ChevronRight, Users, Shield,
  Crown, User, ScanSearch
} from 'lucide-react'
import { useAuth, isSuperAdmin, isAtLeastAdmin } from '../hooks/useAuth'
import type { Page } from '../App'

interface NavItem {
  id: Page
  label: string
  icon: ReactNode
  /** Mínimo rol requerido */
  minRole: 'user' | 'admin' | 'superadmin'
}

interface LayoutProps {
  children: ReactNode
  page: Page
  onNav: (p: Page) => void
}

const ROLE_BADGE: Record<string, { label: string; icon: ReactNode; color: string }> = {
  superadmin: { label: 'Super Admin', icon: <Crown size={11} />,  color: '#f59e0b' },
  admin:      { label: 'Admin',       icon: <Shield size={11} />, color: 'var(--accent)' },
  user:       { label: 'Usuario',     icon: <User size={11} />,   color: 'var(--text3)' },
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',   label: 'Dashboard',    icon: <LayoutDashboard size={15} />, minRole: 'user'       },
  { id: 'transcripts', label: 'Transcripts',  icon: <FileText size={15} />,        minRole: 'user'       },
  { id: 'endpoints',   label: 'Endpoints',    icon: <Webhook size={15} />,         minRole: 'admin'      },
  { id: 'prompts',     label: 'Prompts',      icon: <MessageSquare size={15} />,   minRole: 'admin'      },
  { id: 'config',      label: 'Configuración',icon: <Settings size={15} />,        minRole: 'admin'      },
  { id: 'filters',     label: 'Filtros',      icon: <Shield size={15} />,          minRole: 'admin'      },
  { id: 'example',     label: 'Ejemplo',      icon: <Bot size={15} />,             minRole: 'user'       },
  { id: 'scraper',     label: 'Scraper',      icon: <ScanSearch size={15} />,      minRole: 'user'       },
  { id: 'users',       label: 'Usuarios',     icon: <Users size={15} />,           minRole: 'superadmin' },
]

export function Layout({ children, page, onNav }: LayoutProps) {
  const { user, logout } = useAuth()
  const roleBadge = ROLE_BADGE[user?.role ?? 'user']

  /** Devuelve true si el usuario activo puede ver este item de nav */
  function canSee(item: NavItem): boolean {
    if (!user) return false
    if (item.minRole === 'user') return true
    if (item.minRole === 'admin') return isAtLeastAdmin(user)
    if (item.minRole === 'superadmin') return isSuperAdmin(user)
    return false
  }

  const visibleNav = NAV_ITEMS.filter(canSee)

  return (
    <div className="app-shell">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-logo">
          <Bot size={16} />
          aicor<span>/ control</span>
        </div>
        <div className="topbar-spacer" />

        {/* Client ID activo */}
        {user?.clientId && (
          <div className="topbar-status" style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.7 }}>
            client: <span style={{ color: 'var(--accent)', marginLeft: 4 }}>
              {user.clientId.slice(0, 8)}…
            </span>
          </div>
        )}
        {user?.role === 'superadmin' && (
          <div className="topbar-status" style={{ fontFamily: 'var(--mono)', fontSize: 11, opacity: 0.6 }}>
            todos los clientes
          </div>
        )}

        {/* Role badge en topbar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '3px 10px',
          background: `${roleBadge.color}18`,
          border: `1px solid ${roleBadge.color}35`,
          borderRadius: 6,
          fontSize: 11,
          color: roleBadge.color,
          fontFamily: 'var(--mono)',
        }}>
          {roleBadge.icon}
          {roleBadge.label}
        </div>

        <div className="topbar-status">
          <span className="status-dot" />
          n8n live
        </div>
      </header>

      {/* Sidebar */}
      <nav className="sidebar">
        {/* User info */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: roleBadge.color }}>
            {roleBadge.icon}
            {roleBadge.label}
            {user?.clientId && (
              <span style={{ color: 'var(--text4)', marginLeft: 4, fontFamily: 'var(--mono)', fontSize: 10 }}>
                · {user.clientId.slice(0, 8)}
              </span>
            )}
          </div>
        </div>

        <div className="sidebar-section">Navegación</div>

        {visibleNav.map(item => (
          <button
            key={item.id}
            className={`nav-item ${page === item.id ? 'active' : ''}`}
            onClick={() => onNav(item.id)}
          >
            {item.icon}
            {item.label}
            {page === item.id && <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
          </button>
        ))}

        <div className="sidebar-footer">
          <button className="nav-item btn-danger" onClick={logout}>
            <LogOut size={15} />
            Cerrar sesión
          </button>
        </div>
      </nav>

      {/* Main */}
      <main className="main">
        {children}
      </main>
    </div>
  )
}
