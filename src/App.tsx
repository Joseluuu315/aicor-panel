import { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth, isSuperAdmin, isAtLeastAdmin } from './hooks/useAuth'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { TranscriptsPage } from './pages/TranscriptsPage'
import { EndpointsPage } from './pages/EndpointsPage'
import { PromptsPage } from './pages/PromptsPage'
import { ConfigPage } from './pages/ConfigPage'
import { FiltersPage } from './pages/FiltersPage'
import { ExamplePage } from './pages/ExamplePage'
import { ScraperPage } from './pages/ScraperPage'
import { UsersPage } from './pages/UsersPage'

export type Page =
  | 'dashboard'
  | 'transcripts'
  | 'endpoints'
  | 'prompts'
  | 'config'
  | 'filters'
  | 'example'
  | 'scraper'
  | 'users'

function AppInner() {
  const { isAuthenticated, user } = useAuth()
  const [page, setPage] = useState<Page>('dashboard')

  if (!isAuthenticated) return <LoginPage />

  const allPages: Record<Page, React.ReactNode> = {
    dashboard:   <DashboardPage />,
    transcripts: <TranscriptsPage />,
    endpoints:   <EndpointsPage />,
    prompts:     <PromptsPage />,
    config:      <ConfigPage />,
    filters:     <FiltersPage />,
    example:     <ExamplePage />,
    scraper:     <ScraperPage />,
    users:       <UsersPage />,
  }

  // Restringir navegación según rol
  const handleNav = (p: Page) => {
    // Solo superadmin puede ir a Users
    if (p === 'users' && !isSuperAdmin(user)) return
    // Solo admin/superadmin pueden ir a config-level pages
    if (['endpoints', 'prompts', 'config', 'filters', 'scraper'].includes(p) && !isAtLeastAdmin(user)) return
    setPage(p)
  }

  return (
    <Layout page={page} onNav={handleNav}>
      {allPages[page]}
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--bg2)',
            border: '1px solid var(--border2)',
            color: 'var(--text)',
            fontFamily: 'var(--sans)',
            fontSize: '13px',
          },
          success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--bg2)' } },
          error:   { iconTheme: { primary: 'var(--red)',   secondary: 'var(--bg2)' } },
        }}
      />
      <AppInner />
    </AuthProvider>
  )
}
