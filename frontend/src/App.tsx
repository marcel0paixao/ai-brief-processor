import { useCallback, useEffect, useState } from 'react'
import './App.css'
import {
  ApiError,
  clearAccessToken,
  getAccessToken,
  getCurrentUser,
  saveAccessToken,
  UNAUTHORIZED_EVENT,
  type AuthResponse,
  type SessionUser,
} from './api'
import { AuthPage } from './pages/AuthPage'
import { BriefDetailPage } from './pages/BriefDetailPage'
import { BriefListPage } from './pages/BriefListPage'
import { NewBriefPage } from './pages/NewBriefPage'
import { UserManagementPage } from './pages/UserManagementPage'

type Route =
  | { name: 'list' }
  | { name: 'new' }
  | { name: 'detail'; briefId: string }
  | { name: 'users' }

function readRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '')

  if (hash === 'new') return { name: 'new' }
  if (hash === 'users') return { name: 'users' }

  if (hash.startsWith('brief/')) {
    const briefId = hash.slice('brief/'.length)
    if (briefId) return { name: 'detail', briefId }
  }

  return { name: 'list' }
}

function navigate(path: string): void {
  window.location.hash = path
}

function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [user, setUser] = useState<SessionUser>()
  const [checkingSession, setCheckingSession] = useState(Boolean(getAccessToken()))
  const [sessionError, setSessionError] = useState<string>()
  const [authMessage, setAuthMessage] = useState<string>()

  const verifySession = useCallback(async () => {
    if (!getAccessToken()) {
      setCheckingSession(false)
      return
    }

    setCheckingSession(true)
    setSessionError(undefined)

    try {
      setUser(await getCurrentUser())
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearAccessToken()
        setUser(undefined)
        setAuthMessage('Sua sessão expirou. Entre novamente para continuar.')
      } else {
        setSessionError(
          error instanceof Error ? error.message : 'Não foi possível validar sua sessão.',
        )
      }
    } finally {
      setCheckingSession(false)
    }
  }, [])

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute())
    const handleUnauthorized = () => {
      clearAccessToken()
      setUser(undefined)
      setAuthMessage('Sua sessão expirou. Entre novamente para continuar.')
      navigate('/')
    }

    window.addEventListener('hashchange', handleHashChange)
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
    const sessionCheckId = window.setTimeout(() => void verifySession(), 0)

    return () => {
      window.clearTimeout(sessionCheckId)
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
    }
  }, [verifySession])

  function handleAuthenticated(response: AuthResponse) {
    saveAccessToken(response.accessToken)
    setUser(response.user)
    setAuthMessage(undefined)
    setSessionError(undefined)
    navigate('/')
  }

  function handleLogout() {
    clearAccessToken()
    setUser(undefined)
    setAuthMessage('Você saiu com segurança do workspace.')
    navigate('/')
  }

  if (checkingSession) {
    return (
      <div className="loading-page app-boot">
        <span className="loader" aria-hidden="true" /> Validando sessão…
      </div>
    )
  }

  if (sessionError && getAccessToken()) {
    return (
      <main className="session-error-page">
        <section className="content-card not-found-state">
          <div className="empty-icon" aria-hidden="true">!</div>
          <h1>Não foi possível validar sua sessão</h1>
          <p>{sessionError}</p>
          <div className="session-error-actions">
            <button className="button button-primary" type="button" onClick={() => void verifySession()}>
              Tentar novamente
            </button>
            <button className="button button-ghost" type="button" onClick={handleLogout}>
              Voltar ao login
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (!user) {
    return <AuthPage onAuthenticated={handleAuthenticated} sessionMessage={authMessage} />
  }

  const activeRoute = route.name === 'users' && user.role !== 'ADMIN'
    ? ({ name: 'list' } as const)
    : route

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="app-header">
        <a className="brand" href="#/" aria-label="AI Brief Processor - início">
          <span className="brand-mark" aria-hidden="true">AI</span>
          <span>
            <strong>Brief Processor</strong>
            <small>{user.tenant.name}</small>
          </span>
        </a>

        <nav className="header-actions" aria-label="Navegação principal">
          <a className={activeRoute.name === 'list' ? 'nav-link active' : 'nav-link'} href="#/">
            Análises
          </a>
          {user.role === 'ADMIN' && (
            <a className={activeRoute.name === 'users' ? 'nav-link active' : 'nav-link'} href="#/users">
              Equipe
            </a>
          )}
          <a className="button button-primary button-small" href="#/new">
            <span aria-hidden="true">＋</span> Nova análise
          </a>
          <div className="account-block">
            <span className="account-avatar" aria-hidden="true">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="account-copy">
              <strong>{user.name}</strong>
              <small>{user.role === 'ADMIN' ? 'Administrador' : 'Membro'}</small>
            </span>
            <button className="logout-button" type="button" onClick={handleLogout} title="Sair">
              Sair
            </button>
          </div>
        </nav>
      </header>

      <main className="app-shell">
        {activeRoute.name === 'list' && (
          <BriefListPage
            onCreate={() => navigate('/new')}
            onOpen={(briefId) => navigate(`/brief/${briefId}`)}
          />
        )}
        {activeRoute.name === 'new' && (
          <NewBriefPage
            onCancel={() => navigate('/')}
            onCreated={(briefId) => navigate(`/brief/${briefId}`)}
          />
        )}
        {activeRoute.name === 'detail' && (
          <BriefDetailPage
            briefId={activeRoute.briefId}
            isAdmin={user.role === 'ADMIN'}
            onBack={() => navigate('/')}
            onDeleted={() => navigate('/')}
          />
        )}
        {activeRoute.name === 'users' && (
          <UserManagementPage currentUser={user} />
        )}
      </main>

      <footer className="app-footer">
        <span>{user.tenant.name} · ambiente isolado</span>
        <span>React · NestJS · MongoDB · BullMQ</span>
      </footer>
    </div>
  )
}

export default App
