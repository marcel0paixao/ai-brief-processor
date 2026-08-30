import { useState, type FormEvent } from 'react'
import {
  login,
  register,
  type AuthResponse,
} from '../api'

interface AuthPageProps {
  onAuthenticated: (response: AuthResponse) => void
  sessionMessage?: string
}

type AuthMode = 'login' | 'register'

export function AuthPage({ onAuthenticated, sessionMessage }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [tenantName, setTenantName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const isRegistration = mode === 'register'
  const passwordIsValid = isRegistration
    ? password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
    : password.length > 0
  const canSubmit =
    email.trim().length > 3 &&
    passwordIsValid &&
    (!isRegistration || (name.trim().length >= 2 && tenantName.trim().length >= 2)) &&
    !submitting

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode)
    setError(undefined)
    setPassword('')
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(undefined)

    try {
      const response = isRegistration
        ? await register({
            name: name.trim(),
            tenantName: tenantName.trim(),
            email: email.trim(),
            password,
          })
        : await login({ email: email.trim(), password })

      onAuthenticated(response)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível autenticar sua conta.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-presentation">
        <a className="brand auth-brand" href="#/" aria-label="AI Brief Processor">
          <span className="brand-mark" aria-hidden="true">AI</span>
          <span>
            <strong>Brief Processor</strong>
            <small>Maestria Platform &amp; AI</small>
          </span>
        </a>

        <div className="auth-copy">
          <span className="eyebrow">Workspace inteligente</span>
          <h1>Briefings claros. Times alinhados. Decisões melhores.</h1>
          <p>
            Um ambiente seguro por organização para transformar contexto em
            análises estruturadas e acionáveis.
          </p>
        </div>

        <div className="auth-benefits" aria-label="Recursos da plataforma">
          <div><span>01</span><p><strong>Isolamento por organização</strong>Seus dados ficam restritos ao seu workspace.</p></div>
          <div><span>02</span><p><strong>Acesso por função</strong>Administradores controlam equipe e permissões.</p></div>
          <div><span>03</span><p><strong>Fluxo rastreável</strong>Acompanhe cada análise do envio ao resultado.</p></div>
        </div>
      </section>

      <section className="auth-panel">
        <div className="auth-card content-card">
          <div className="auth-tabs" role="tablist" aria-label="Tipo de acesso">
            <button
              className={mode === 'login' ? 'active' : ''}
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              onClick={() => changeMode('login')}
            >
              Entrar
            </button>
            <button
              className={mode === 'register' ? 'active' : ''}
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              onClick={() => changeMode('register')}
            >
              Criar workspace
            </button>
          </div>

          <div className="auth-card-heading">
            <span className="eyebrow">{isRegistration ? 'Primeiro acesso' : 'Bem-vindo de volta'}</span>
            <h2>{isRegistration ? 'Comece com seu time' : 'Acesse seu workspace'}</h2>
            <p>
              {isRegistration
                ? 'Você será o administrador inicial da nova organização.'
                : 'Use as credenciais cadastradas pelo administrador.'}
            </p>
          </div>

          {(error || sessionMessage) && (
            <div className="inline-alert alert-error auth-alert" role="alert">
              <span aria-hidden="true">!</span>
              <div>
                <strong>{error ? 'Não foi possível continuar' : 'Sessão encerrada'}</strong>
                <p>{error ?? sessionMessage}</p>
              </div>
            </div>
          )}

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {isRegistration && (
              <div className="auth-field-row">
                <label className="field-group">
                  <span className="field-label">Seu nome</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    placeholder="Nome completo"
                    autoFocus
                    required
                  />
                </label>
                <label className="field-group">
                  <span className="field-label">Organização</span>
                  <input
                    value={tenantName}
                    onChange={(event) => setTenantName(event.target.value)}
                    minLength={2}
                    maxLength={100}
                    autoComplete="organization"
                    placeholder="Nome da empresa"
                    required
                  />
                </label>
              </div>
            )}

            <label className="field-group">
              <span className="field-label">E-mail</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                autoComplete="email"
                placeholder="voce@empresa.com"
                autoFocus={!isRegistration}
                required
              />
            </label>

            <label className="field-group">
              <span className="field-label">Senha</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={isRegistration ? 8 : undefined}
                maxLength={72}
                autoComplete={isRegistration ? 'new-password' : 'current-password'}
                placeholder="••••••••"
                required
              />
              {isRegistration && (
                <span className="field-help password-help">
                  8+ caracteres, com maiúscula, minúscula e número
                </span>
              )}
            </label>

            <button className="button button-primary auth-submit" type="submit" disabled={!canSubmit}>
              {submitting ? (
                <><span className="loader loader-small" aria-hidden="true" /> Aguarde…</>
              ) : isRegistration ? (
                <>Criar workspace <span aria-hidden="true">→</span></>
              ) : (
                <>Entrar <span aria-hidden="true">→</span></>
              )}
            </button>
          </form>

          <p className="auth-security-note">
            <span aria-hidden="true">●</span> Senhas protegidas com hash e sessão JWT de curta duração.
          </p>
        </div>
      </section>
    </main>
  )
}
