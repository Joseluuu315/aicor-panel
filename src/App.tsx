import { useState } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { TranscriptsPage } from './pages/TranscriptsPage'
import { EndpointsPage } from './pages/EndpointsPage'
import { PromptsPage } from './pages/PromptsPage'
import { ConfigPage } from './pages/ConfigPage'
import { FiltersPage } from './pages/FiltersPage'

type Page = 'dashboard' | 'transcripts' | 'endpoints' | 'prompts' | 'config' | 'filters'

function AppInner() {
  const { isAuthenticated } = useAuth()
  const [page, setPage] = useState<Page>('dashboard')

  if (!isAuthenticated) return <LoginPage />

  const pages: Record<Page, React.ReactNode> = {
    dashboard:   <DashboardPage />,
    transcripts: <TranscriptsPage />,
    endpoints:   <EndpointsPage />,
    prompts:     <PromptsPage />,
    config:      <ConfigPage />,
    filters:     <FiltersPage />,
  }

  return (
    <Layout page={page} onNav={setPage}>
      {pages[page]}
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
