import { useCallback, useEffect, useState } from 'react'
import {
  deleteBrief,
  getBrief,
  retryBrief,
  updateBrief,
  type AnalyzedBriefResult,
  type BriefDetail,
  type InsufficientBriefResult,
} from '../api'
import { StatusBadge } from '../components/StatusBadge'
import { formatDate } from '../format'
import { getStatusLabel } from '../status'

interface BriefDetailPageProps {
  briefId: string
  isAdmin: boolean
  onBack: () => void
  onDeleted: () => void
}

function ResultList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="result-empty">Não informado no briefing.</p>
  }

  return (
    <ul className="result-list">
      {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
    </ul>
  )
}

function AnalysisResult({ result }: { result: AnalyzedBriefResult }) {
  return (
    <div className="result-grid">
      <article className="result-card result-wide result-summary">
        <span className="result-kicker">Resumo executivo</span>
        <p>{result.summary}</p>
      </article>
      <article className="result-card result-wide">
        <span className="result-kicker">Objetivo principal</span>
        <p>{result.mainObjective}</p>
      </article>
      <article className="result-card">
        <span className="result-kicker">Público-alvo</span>
        <ResultList items={result.targetAudience} />
      </article>
      <article className="result-card">
        <span className="result-kicker">Pilares de comunicação</span>
        <ResultList items={result.communicationPillars} />
      </article>
      <article className="result-card">
        <span className="result-kicker">Ações sugeridas</span>
        <ResultList items={result.suggestedActions} />
      </article>
      <article className="result-card result-risk">
        <span className="result-kicker">Riscos e pontos de atenção</span>
        <ResultList items={result.risks} />
      </article>
    </div>
  )
}

function InsufficientResult({
  result,
  canEdit,
  onEdit,
}: {
  result: InsufficientBriefResult
  canEdit: boolean
  onEdit: () => void
}) {
  return (
    <section className="insufficient-panel">
      <div className="insufficient-icon" aria-hidden="true">?</div>
      <div>
        <span className="eyebrow">Análise responsável</span>
        <h2>O briefing precisa de mais contexto</h2>
        <p>{result.reason}</p>
        <h3>Inclua estas informações</h3>
        <ResultList items={result.missingInformation} />
        {canEdit && (
          <div className="insufficient-actions">
            <button className="button button-primary" type="button" onClick={onEdit}>
              Complementar briefing
            </button>
          </div>
        )}
      </div>
    </section>
  )
}

export function BriefDetailPage({ briefId, isAdmin, onBack, onDeleted }: BriefDetailPageProps) {
  const [brief, setBrief] = useState<BriefDetail>()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBrief, setEditBrief] = useState('')
  const [error, setError] = useState<string>()

  const loadBrief = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)

    try {
      setBrief(await getBrief(briefId))
      setError(undefined)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível carregar a análise.',
      )
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [briefId])

  useEffect(() => {
    let cancelled = false

    void getBrief(briefId)
      .then((loadedBrief) => {
        if (cancelled) return
        setBrief(loadedBrief)
        setError(undefined)
      })
      .catch((requestError: unknown) => {
        if (cancelled) return
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Não foi possível carregar a análise.',
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [briefId])

  useEffect(() => {
    if (brief?.status !== 'PENDING' && brief?.status !== 'PROCESSING') return

    const intervalId = window.setInterval(() => void loadBrief(true), 2_500)
    return () => window.clearInterval(intervalId)
  }, [brief?.status, loadBrief])

  function startEditing() {
    if (!brief) return
    setEditTitle(brief.title)
    setEditBrief(brief.brief)
    setEditing(true)
    setError(undefined)
  }

  async function saveChanges() {
    if (!brief || editTitle.trim().length < 3 || editBrief.trim().length < 20) return

    setSaving(true)
    setError(undefined)
    const shouldReprocess = brief.result?.outcome === 'INSUFFICIENT_BRIEF'

    try {
      const updatedBrief = await updateBrief(brief.id, {
        title: editTitle.trim(),
        brief: editBrief.trim(),
      })
      setBrief(
        shouldReprocess ? await retryBrief(brief.id) : updatedBrief,
      )
      setEditing(false)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível salvar as alterações.',
      )
      if (shouldReprocess) void loadBrief(true)
    } finally {
      setSaving(false)
    }
  }

  async function removeBrief() {
    if (!brief || !window.confirm(`Excluir permanentemente a análise “${brief.title}”?`)) return

    setDeleting(true)
    setError(undefined)

    try {
      await deleteBrief(brief.id)
      onDeleted()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível excluir a análise.',
      )
      setDeleting(false)
    }
  }

  async function retryProcessing() {
    if (!brief?.error?.retryable) return

    setRetrying(true)
    setError(undefined)

    try {
      setBrief(await retryBrief(brief.id))
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível reenviar a análise para processamento.',
      )
    } finally {
      setRetrying(false)
    }
  }

  if (loading) {
    return (
      <div className="loading-page">
        <span className="loader" aria-hidden="true" /> Carregando análise…
      </div>
    )
  }

  if (!brief) {
    return (
      <div className="content-card not-found-state">
        <div className="empty-icon" aria-hidden="true">!</div>
        <h1>Análise indisponível</h1>
        <p>{error ?? 'O registro solicitado não foi encontrado.'}</p>
        <button className="button button-secondary" type="button" onClick={onBack}>
          Voltar para a lista
        </button>
      </div>
    )
  }

  const isInProgress = brief.status === 'PENDING' || brief.status === 'PROCESSING'

  return (
    <div className="page-stack detail-page">
      <button className="back-link" type="button" onClick={onBack}>
        <span aria-hidden="true">←</span> Voltar para análises
      </button>

      <section className="detail-heading">
        <div>
          <div className="detail-status-line">
            <StatusBadge status={brief.status} />
            {isInProgress && (
              <span className="live-note"><span /> atualização automática</span>
            )}
          </div>
          <h1>{brief.title}</h1>
          <p>
            Criada em {formatDate(brief.createdAt)} · atualizada em{' '}
            {formatDate(brief.updatedAt)}
          </p>
        </div>
        <div className="detail-actions">
          {isAdmin && (
            <>
              <button className="button button-ghost" type="button" onClick={startEditing} disabled={editing || deleting}>
                Editar
              </button>
              <button className="button button-danger" type="button" onClick={() => void removeBrief()} disabled={deleting}>
                {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
            </>
          )}
          <button
            className="button button-ghost"
            type="button"
            onClick={() => void loadBrief(true)}
            disabled={refreshing}
          >
            <span className={refreshing ? 'refresh-icon spinning' : 'refresh-icon'} aria-hidden="true">↻</span>
            Atualizar
          </button>
        </div>
      </section>

      {error && (
        <div className="inline-alert alert-error" role="alert">
          <span aria-hidden="true">!</span>
          <div><strong>Falha na atualização</strong><p>{error}</p></div>
        </div>
      )}

      <section className="detail-layout">
        <div className="detail-main">
          {brief.status === 'COMPLETED' && brief.result ? (
            <section>
              <div className="section-heading">
                <span className="eyebrow">Análise estruturada</span>
                <h2>Resultado</h2>
              </div>
              {brief.result.outcome === 'INSUFFICIENT_BRIEF' ? (
                <InsufficientResult
                  result={brief.result}
                  canEdit={isAdmin}
                  onEdit={startEditing}
                />
              ) : (
                <AnalysisResult result={brief.result} />
              )}
            </section>
          ) : brief.status === 'FAILED' ? (
            <section className="failed-panel">
              <div className="failed-icon" aria-hidden="true">!</div>
              <div>
                <span className="eyebrow">Processamento interrompido</span>
                <h2>A análise não pôde ser concluída</h2>
                <p>{brief.error?.message ?? 'Ocorreu uma falha inesperada durante o processamento.'}</p>
                <dl>
                  <div><dt>Código</dt><dd>{brief.error?.code ?? 'UNKNOWN_ERROR'}</dd></div>
                  <div><dt>Pode tentar novamente?</dt><dd>{brief.error?.retryable ? 'Sim' : 'Não'}</dd></div>
                </dl>
                {brief.error?.retryable && (
                  <div className="failed-actions">
                    <button
                      className="button button-primary"
                      type="button"
                      onClick={() => void retryProcessing()}
                      disabled={retrying}
                    >
                      {retrying ? <><span className="loader loader-small" /> Reenviando…</> : 'Tentar novamente'}
                    </button>
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="processing-panel">
              <div className="processing-visual" aria-hidden="true">
                <span className="orbit orbit-one" />
                <span className="orbit orbit-two" />
                <strong>AI</strong>
              </div>
              <div>
                <span className="eyebrow">{getStatusLabel(brief.status)}</span>
                <h2>{brief.status === 'PENDING' ? 'Aguardando o worker' : 'Interpretando o briefing'}</h2>
                <p>
                  {brief.status === 'PENDING'
                    ? 'A solicitação foi salva e está aguardando o início do processamento.'
                    : 'A IA está organizando objetivos, públicos, pilares, ações e riscos.'}
                </p>
                <div className="progress-track"><span /></div>
                <small>Esta página será atualizada automaticamente.</small>
              </div>
            </section>
          )}

          {editing ? (
            <section className="content-card edit-brief-card">
              <div className="card-heading">
                <div><span className="eyebrow">Acesso de administrador</span><h2>Editar análise</h2></div>
              </div>
              <label className="field-group">
                <span className="field-label">Título</span>
                <input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} minLength={3} maxLength={120} />
                <span className="field-help"><span>Mínimo de 3 caracteres</span><span>{editTitle.length}/120</span></span>
              </label>
              <label className="field-group">
                <span className="field-label">Briefing</span>
                <textarea value={editBrief} onChange={(event) => setEditBrief(event.target.value)} minLength={20} maxLength={10_000} rows={9} />
                <span className="field-help"><span>Mínimo de 20 caracteres</span><span>{editBrief.length.toLocaleString('pt-BR')}/10.000</span></span>
              </label>
              <div className="form-actions">
                <button className="button button-ghost" type="button" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
                <button className="button button-primary" type="button" onClick={() => void saveChanges()} disabled={saving || editTitle.trim().length < 3 || editBrief.trim().length < 20}>
                  {saving ? <><span className="loader loader-small" /> Salvando…</> : 'Salvar alterações'}
                </button>
              </div>
            </section>
          ) : (
            <section className="content-card original-brief-card">
              <div className="card-heading">
                <div><span className="eyebrow">Entrada original</span><h2>Briefing enviado</h2></div>
              </div>
              <p>{brief.brief}</p>
            </section>
          )}
        </div>

        <aside className="metadata-card content-card">
          <h2>Processamento</h2>
          <dl>
            <div><dt>Status</dt><dd><StatusBadge status={brief.status} /></dd></div>
            <div><dt>Tentativas</dt><dd>{brief.attemptCount}</dd></div>
            <div><dt>Iniciado em</dt><dd>{formatDate(brief.processingStartedAt)}</dd></div>
            <div><dt>Finalizado em</dt><dd>{formatDate(brief.completedAt)}</dd></div>
            <div><dt>Identificador</dt><dd className="brief-id" title={brief.id}>{brief.id}</dd></div>
          </dl>
        </aside>
      </section>
    </div>
  )
}
