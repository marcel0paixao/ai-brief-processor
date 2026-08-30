import { useState, type FormEvent } from 'react'
import { ApiError, createBrief } from '../api'

interface NewBriefPageProps {
  onCancel: () => void
  onCreated: (briefId: string) => void
}

export function NewBriefPage({ onCancel, onCreated }: NewBriefPageProps) {
  const [title, setTitle] = useState('')
  const [brief, setBrief] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const titleIsValid = title.trim().length >= 3
  const briefIsValid = brief.trim().length >= 20
  const canSubmit = titleIsValid && briefIsValid && !submitting

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(undefined)

    try {
      const createdBrief = await createBrief({
        title: title.trim(),
        brief: brief.trim(),
      })
      onCreated(createdBrief.id)
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.briefId) {
        onCreated(requestError.briefId)
        return
      }

      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Não foi possível criar a análise.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="form-page">
      <button className="back-link" type="button" onClick={onCancel}>
        <span aria-hidden="true">←</span> Voltar para análises
      </button>

      <section className="form-layout">
        <div className="form-intro">
          <span className="eyebrow">Nova análise</span>
          <h1>Conte o contexto. A IA organiza o caminho.</h1>
          <p>
            Inclua informações sobre objetivo, público, prazo e restrições. Um
            briefing claro produz uma análise mais útil.
          </p>

          <div className="process-steps" aria-label="Etapas do processamento">
            <div><span>1</span><p><strong>Envio</strong>O briefing é validado e persistido.</p></div>
            <div><span>2</span><p><strong>Processamento</strong>O worker estrutura a análise com IA.</p></div>
            <div><span>3</span><p><strong>Resultado</strong>Você recebe ações, pilares e riscos.</p></div>
          </div>
        </div>

        <form className="brief-form content-card" onSubmit={handleSubmit} noValidate>
          <div className="card-heading form-card-heading">
            <div>
              <h2>Dados do briefing</h2>
              <p>Os dois campos são obrigatórios.</p>
            </div>
            <span className="secure-note"><span aria-hidden="true">●</span> Salvo no MongoDB</span>
          </div>

          {error && (
            <div className="inline-alert alert-error" role="alert">
              <span aria-hidden="true">!</span>
              <div><strong>Não foi possível enviar</strong><p>{error}</p></div>
            </div>
          )}

          <label className="field-group">
            <span className="field-label">Título da análise</span>
            <input
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              minLength={3}
              maxLength={120}
              placeholder="Ex.: Campanha de lançamento do veículo elétrico"
              autoFocus
              required
            />
            <span className="field-help">
              <span>Mínimo de 3 caracteres</span>
              <span>{title.length}/120</span>
            </span>
          </label>

          <label className="field-group">
            <span className="field-label">Briefing</span>
            <textarea
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              minLength={20}
              maxLength={10_000}
              rows={11}
              placeholder="Descreva o produto, o objetivo, o público-alvo, o momento da campanha e qualquer restrição relevante…"
              required
            />
            <span className="field-help">
              <span>Mínimo de 20 caracteres</span>
              <span>{brief.length.toLocaleString('pt-BR')}/10.000</span>
            </span>
          </label>

          <div className="form-actions">
            <button className="button button-ghost" type="button" onClick={onCancel} disabled={submitting}>
              Cancelar
            </button>
            <button className="button button-primary" type="submit" disabled={!canSubmit}>
              {submitting ? (
                <><span className="loader loader-small" aria-hidden="true" /> Enviando…</>
              ) : (
                <>Analisar briefing <span aria-hidden="true">→</span></>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
