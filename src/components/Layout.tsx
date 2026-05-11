import { useState, ReactNode } from 'react'
import {
  LayoutDashboard, MessageSquare, Webhook, FileText,
  Settings, LogOut, Bot, ChevronRight, Users
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

type Page = 'dashboard' | 'transcripts' | 'endpoints' | 'prompts' | 'config' | 'filters'

interface LayoutProps {
  children: ReactNode
  page: Page
  onNav: (p: Page) => void
}

export function Layout({ children, page, onNav }: LayoutProps) {
  const { logout } = useAuth()

  const navItems: { id: Page; label: string; icon: ReactNode }[] = [
    { id: 'dashboard',   label: 'Dashboard',   icon: <LayoutDashboard size={15} /> },
    { id: 'transcripts', label: 'Transcripts',  icon: <FileText size={15} /> },
    { id: 'endpoints',   label: 'Endpoints',    icon: <Webhook size={15} /> },
    { id: 'prompts',     label: 'Prompts',      icon: <MessageSquare size={15} /> },
    { id: 'config',      label: 'Configuración',icon: <Settings size={15} /> },
    { id: 'filters',     label: 'Filtros',      icon: <Users size={15} /> },
  ]

  return (
    <div className="app-shell">
      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-logo">
          <Bot size={16} />
          aicor<span>/ control</span>
        </div>
        <div className="topbar-spacer" />
        <div className="topbar-status">
          <span className="status-dot" />
          n8n live
        </div>
      </header>

      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-section">Navegación</div>
        {navItems.map(item => (
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
