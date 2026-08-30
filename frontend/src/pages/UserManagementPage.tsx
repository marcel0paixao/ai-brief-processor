import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  createUser,
  listUsers,
  updateUser,
  type SessionUser,
  type TenantUser,
  type UserRole,
} from '../api'
import { formatDate } from '../format'

interface UserManagementPageProps {
  currentUser: SessionUser
}

function replaceUser(users: TenantUser[], updatedUser: TenantUser): TenantUser[] {
  return users.map((user) => user.id === updatedUser.id ? updatedUser : user)
}

export function UserManagementPage({ currentUser }: UserManagementPageProps) {
  const [users, setUsers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [success, setSuccess] = useState<string>()
  const [updatingUserId, setUpdatingUserId] = useState<string>()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('MEMBER')
  const [submitting, setSubmitting] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)

    try {
      setUsers(await listUsers())
      setError(undefined)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível carregar a equipe.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => void loadUsers(), 0)
    return () => window.clearTimeout(initialLoadId)
  }, [loadUsers])

  const passwordIsValid =
    password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
  const canCreate =
    name.trim().length >= 2 && email.trim().length > 3 && passwordIsValid && !submitting

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canCreate) return

    setSubmitting(true)
    setError(undefined)
    setSuccess(undefined)

    try {
      const createdUser = await createUser({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
      })
      setUsers((currentUsers) => [...currentUsers, createdUser])
      setName('')
      setEmail('')
      setPassword('')
      setRole('MEMBER')
      setSuccess(`${createdUser.name} já pode acessar o workspace.`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível adicionar o usuário.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUpdate(user: TenantUser, changes: { role?: UserRole; isActive?: boolean }) {
    setUpdatingUserId(user.id)
    setError(undefined)
    setSuccess(undefined)

    try {
      const updatedUser = await updateUser(user.id, changes)
      setUsers((currentUsers) => replaceUser(currentUsers, updatedUser))
      setSuccess(`${updatedUser.name} foi atualizado.`)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível atualizar o usuário.',
      )
    } finally {
      setUpdatingUserId(undefined)
    }
  }

  return (
    <div className="page-stack team-page">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Administração do workspace</span>
          <h1>Acesso certo para cada pessoa do time.</h1>
          <p>
            Gerencie quem pode acessar {currentUser.tenant.name}. Membros criam e
            consultam análises; administradores também gerenciam equipe e registros.
          </p>
        </div>
        <span className="tenant-badge">
          <span aria-hidden="true">◎</span> {currentUser.tenant.name}
        </span>
      </section>

      {(error || success) && (
        <div className={`inline-alert ${error ? 'alert-error' : 'alert-success'}`} role="status">
          <span aria-hidden="true">{error ? '!' : '✓'}</span>
          <div>
            <strong>{error ? 'Não foi possível concluir' : 'Alteração concluída'}</strong>
            <p>{error ?? success}</p>
          </div>
        </div>
      )}

      <section className="team-layout">
        <div className="content-card team-list-card">
          <div className="card-heading">
            <div>
              <h2>Pessoas do workspace</h2>
              <p>{users.length} usuário{users.length === 1 ? '' : 's'} cadastrado{users.length === 1 ? '' : 's'}</p>
            </div>
            <button className="button button-ghost button-small" type="button" onClick={() => void loadUsers()}>
              ↻ Atualizar
            </button>
          </div>

          {loading ? (
            <div className="loading-block">
              <span className="loader" aria-hidden="true" /> Carregando equipe…
            </div>
          ) : users.length === 0 ? (
            <div className="empty-state"><p>Nenhum usuário encontrado.</p></div>
          ) : (
            <div className="user-list">
              {users.map((user) => {
                const isSelf = user.id === currentUser.id
                const isUpdating = updatingUserId === user.id

                return (
                  <article className={user.isActive ? 'user-row' : 'user-row user-inactive'} key={user.id}>
                    <span className="user-avatar" aria-hidden="true">
                      {user.name.slice(0, 1).toUpperCase()}
                    </span>
                    <div className="user-identity">
                      <strong>{user.name} {isSelf && <small>Você</small>}</strong>
                      <span>{user.email}</span>
                      <small>
                        {user.lastLoginAt ? `Último acesso ${formatDate(user.lastLoginAt)}` : 'Ainda não acessou'}
                      </small>
                    </div>
                    <label className="compact-field">
                      <span>Função</span>
                      <select
                        value={user.role}
                        disabled={isSelf || isUpdating || !user.isActive}
                        onChange={(event) => void handleUpdate(user, { role: event.target.value as UserRole })}
                        aria-label={`Função de ${user.name}`}
                      >
                        <option value="MEMBER">Membro</option>
                        <option value="ADMIN">Administrador</option>
                      </select>
                    </label>
                    <div className="user-state">
                      <span className={user.isActive ? 'active-state' : 'inactive-state'}>
                        <span aria-hidden="true" /> {user.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                      <button
                        className="text-button"
                        type="button"
                        disabled={isSelf || isUpdating}
                        onClick={() => void handleUpdate(user, { isActive: !user.isActive })}
                      >
                        {isUpdating ? 'Salvando…' : user.isActive ? 'Desativar' : 'Reativar'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>

        <form className="content-card invite-card" onSubmit={handleCreate} noValidate>
          <div className="card-heading">
            <div><span className="eyebrow">Novo acesso</span><h2>Adicionar pessoa</h2></div>
          </div>
          <p className="invite-intro">
            Crie uma credencial inicial e compartilhe-a por um canal seguro.
          </p>
          <label className="field-group">
            <span className="field-label">Nome</span>
            <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} placeholder="Nome completo" required />
          </label>
          <label className="field-group">
            <span className="field-label">E-mail</span>
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} placeholder="pessoa@empresa.com" required />
          </label>
          <label className="field-group">
            <span className="field-label">Senha temporária</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} maxLength={72} autoComplete="new-password" placeholder="••••••••" required />
            <span className="field-help password-help">8+ caracteres, com maiúscula, minúscula e número</span>
          </label>
          <label className="field-group">
            <span className="field-label">Função</span>
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
              <option value="MEMBER">Membro — análises</option>
              <option value="ADMIN">Administrador — gestão completa</option>
            </select>
          </label>
          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={!canCreate}>
              {submitting ? <><span className="loader loader-small" /> Criando…</> : 'Adicionar ao workspace'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
