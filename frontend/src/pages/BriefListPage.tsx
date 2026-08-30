import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  listBriefs,
  type BriefListFilters,
  type BriefListResponse,
  type BriefSortBy,
  type BriefStatus,
  type SortOrder,
} from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { formatDate } from '../format'

interface BriefListPageProps {
  onCreate: () => void
  onOpen: (briefId: string) => void
}

type FilterForm = {
  search: string
  status: '' | BriefStatus
  dateFrom: string
  dateTo: string
  sortBy: BriefSortBy
  sortOrder: SortOrder
}

const statusOrder: BriefStatus[] = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']
const statusNames: Record<BriefStatus, string> = {
  PENDING: 'Pendentes',
  PROCESSING: 'Processando',
  COMPLETED: 'Concluídas',
  FAILED: 'Com falha',
}
const emptyCounts: Record<BriefStatus, number> = {
  PENDING: 0,
  PROCESSING: 0,
  COMPLETED: 0,
  FAILED: 0,
}
const initialFilters: FilterForm = {
  search: '',
  status: '',
  dateFrom: '',
  dateTo: '',
  sortBy: 'createdAt',
  sortOrder: 'desc',
}

function toRequestFilters(filters: FilterForm, page: number): BriefListFilters {
  return {
    search: filters.search.trim() || undefined,
    status: filters.status || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    page,
    limit: 10,
  }
}

export function BriefListPage({ onCreate, onOpen }: BriefListPageProps) {
  const [response, setResponse] = useState<BriefListResponse>()
  const [draftFilters, setDraftFilters] = useState<FilterForm>(initialFilters)
  const [appliedFilters, setAppliedFilters] = useState<FilterForm>(initialFilters)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string>()
  const [filterError, setFilterError] = useState<string>()

  const loadBriefs = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)

    try {
      setResponse(await listBriefs(toRequestFilters(appliedFilters, page)))
      setError(undefined)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível carregar as análises.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [appliedFilters, page])

  useEffect(() => {
    const initialLoadId = window.setTimeout(() => void loadBriefs(), 0)
    const intervalId = window.setInterval(() => void loadBriefs(true), 8_000)
    return () => {
      window.clearTimeout(initialLoadId)
      window.clearInterval(intervalId)
    }
  }, [loadBriefs])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (draftFilters.dateFrom && draftFilters.dateTo && draftFilters.dateFrom > draftFilters.dateTo) {
      setFilterError('A data inicial não pode ser posterior à data final.')
      return
    }

    setFilterError(undefined)
    setPage(1)
    setAppliedFilters({ ...draftFilters })
  }

  function clearFilters() {
    setDraftFilters(initialFilters)
    setAppliedFilters(initialFilters)
    setFilterError(undefined)
    setPage(1)
  }

  function filterByStatus(status: BriefStatus) {
    const nextStatus = appliedFilters.status === status ? '' : status
    const nextFilters = { ...appliedFilters, status: nextStatus } as FilterForm
    setDraftFilters(nextFilters)
    setAppliedFilters(nextFilters)
    setPage(1)
  }

  function changeSorting(value: string) {
    const [sortBy, sortOrder] = value.split(':') as [BriefSortBy, SortOrder]
    setDraftFilters((filters) => ({ ...filters, sortBy, sortOrder }))
  }

  const briefs = response?.items ?? []
  const meta = response?.meta
  const counts = meta?.statusCounts ?? emptyCounts
  const hasFilters = Boolean(
    appliedFilters.search ||
    appliedFilters.status ||
    appliedFilters.dateFrom ||
    appliedFilters.dateTo ||
    appliedFilters.sortBy !== 'createdAt' ||
    appliedFilters.sortOrder !== 'desc',
  )

  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <span className="eyebrow">Painel de análises</span>
          <h1>Briefings transformados em decisões claras.</h1>
          <p>
            Crie uma solicitação, acompanhe o processamento e consulte o
            resultado estruturado da IA.
          </p>
        </div>
        <button className="button button-primary" type="button" onClick={onCreate}>
          <span aria-hidden="true">＋</span> Criar análise
        </button>
      </section>

      <section className="metrics-grid" aria-label="Resumo dos status">
        {statusOrder.map((status) => (
          <button
            className={`metric-card metric-${status.toLowerCase()} ${appliedFilters.status === status ? 'selected' : ''}`}
            type="button"
            key={status}
            onClick={() => filterByStatus(status)}
            aria-pressed={appliedFilters.status === status}
          >
            <span>{statusNames[status]}</span>
            <strong>{counts[status]}</strong>
            <small>{appliedFilters.status === status ? 'Remover filtro' : 'Filtrar lista'}</small>
          </button>
        ))}
      </section>

      <section className="content-card filters-card">
        <form className="filters-form" onSubmit={applyFilters}>
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={draftFilters.search}
              onChange={(event) => setDraftFilters((filters) => ({ ...filters, search: event.target.value }))}
              maxLength={120}
              placeholder="Buscar no título ou briefing"
              aria-label="Buscar análises"
            />
          </label>
          <label className="compact-field">
            <span>Status</span>
            <select
              value={draftFilters.status}
              onChange={(event) => setDraftFilters((filters) => ({ ...filters, status: event.target.value as FilterForm['status'] }))}
            >
              <option value="">Todos</option>
              <option value="PENDING">Pendente</option>
              <option value="PROCESSING">Processando</option>
              <option value="COMPLETED">Concluída</option>
              <option value="FAILED">Com falha</option>
            </select>
          </label>
          <label className="compact-field date-field">
            <span>De</span>
            <input
              type="date"
              value={draftFilters.dateFrom}
              onChange={(event) => setDraftFilters((filters) => ({ ...filters, dateFrom: event.target.value }))}
            />
          </label>
          <label className="compact-field date-field">
            <span>Até</span>
            <input
              type="date"
              value={draftFilters.dateTo}
              onChange={(event) => setDraftFilters((filters) => ({ ...filters, dateTo: event.target.value }))}
            />
          </label>
          <label className="compact-field sort-field">
            <span>Ordenar</span>
            <select value={`${draftFilters.sortBy}:${draftFilters.sortOrder}`} onChange={(event) => changeSorting(event.target.value)}>
              <option value="createdAt:desc">Mais recentes</option>
              <option value="createdAt:asc">Mais antigas</option>
              <option value="updatedAt:desc">Atualizadas recentemente</option>
              <option value="title:asc">Título A–Z</option>
              <option value="title:desc">Título Z–A</option>
            </select>
          </label>
          <button className="button button-primary button-small" type="submit">Aplicar</button>
          {hasFilters && (
            <button className="text-button clear-filter-button" type="button" onClick={clearFilters}>Limpar</button>
          )}
        </form>
        {filterError && <p className="filter-error" role="alert">{filterError}</p>}
      </section>

      <section className="content-card">
        <div className="card-heading">
          <div>
            <h2>{hasFilters ? 'Resultados filtrados' : 'Análises recentes'}</h2>
            <p>
              {meta?.total ?? 0} registro{meta?.total === 1 ? '' : 's'} encontrado{meta?.total === 1 ? '' : 's'}
            </p>
          </div>
          <button
            className="button button-ghost button-small"
            type="button"
            onClick={() => void loadBriefs(true)}
            disabled={refreshing}
          >
            <span className={refreshing ? 'refresh-icon spinning' : 'refresh-icon'} aria-hidden="true">↻</span>
            Atualizar
          </button>
        </div>

        {error && (
          <div className="inline-alert alert-error" role="alert">
            <span aria-hidden="true">!</span>
            <div><strong>Não foi possível atualizar a lista</strong><p>{error}</p></div>
          </div>
        )}

        {loading ? (
          <div className="loading-block" aria-live="polite">
            <span className="loader" aria-hidden="true" /> Carregando análises…
          </div>
        ) : briefs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon" aria-hidden="true">✦</div>
            <h3>{hasFilters ? 'Nenhum resultado encontrado' : 'Nenhuma análise criada'}</h3>
            <p>
              {hasFilters
                ? 'Ajuste os filtros ou limpe a busca para ver todas as análises.'
                : 'Envie o primeiro briefing para começar a acompanhar o fluxo.'}
            </p>
            <button className="button button-secondary" type="button" onClick={hasFilters ? clearFilters : onCreate}>
              {hasFilters ? 'Limpar filtros' : 'Criar primeira análise'}
            </button>
          </div>
        ) : (
          <>
            <div className="brief-list">
              <div className="brief-list-header" aria-hidden="true">
                <span>Briefing</span><span>Status</span><span>Criado em</span><span />
              </div>
              {briefs.map((brief) => (
                <button className="brief-row" type="button" key={brief.id} onClick={() => onOpen(brief.id)}>
                  <span className="brief-title-cell">
                    <span className="brief-avatar" aria-hidden="true">{brief.title.slice(0, 1).toUpperCase()}</span>
                    <span><strong>{brief.title}</strong><small>Atualizado {formatDate(brief.updatedAt)}</small></span>
                  </span>
                  <span><StatusBadge status={brief.status} /></span>
                  <span className="brief-date">{formatDate(brief.createdAt)}</span>
                  <span className="row-arrow" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
            {meta && meta.totalPages > 1 && (
              <nav className="pagination" aria-label="Paginação das análises">
                <button className="button button-ghost button-small" type="button" disabled={page <= 1} onClick={() => setPage((currentPage) => currentPage - 1)}>← Anterior</button>
                <span>Página <strong>{page}</strong> de <strong>{meta.totalPages}</strong></span>
                <button className="button button-ghost button-small" type="button" disabled={page >= meta.totalPages} onClick={() => setPage((currentPage) => currentPage + 1)}>Próxima →</button>
              </nav>
            )}
          </>
        )}
      </section>
    </div>
  )
}
