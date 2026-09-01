# Plano de implementação do worker

Entregas com exemplos de código: [worker-implementation-examples.md](./worker-implementation-examples.md).

Cronograma para fechar o fluxo assíncrono (BullMQ → MongoDB → OpenRouter) e, em seguida, os bônus. Estimativa em horas de implementação focada.

O enunciado original do desafio não está no repositório. Requisitos e bônus vêm do README, do scaffold do worker e do que a API já publica.

**Princípio:** fechar o fluxo ponta a ponta antes de qualquer bônus. Retry HTTP, healthcheck e outbox sem processor não mudam o que o avaliador vê na UI.

## Estado atual

O worker ainda é um scaffold: sobe, conecta no Mongo e desliga com `SIGINT`/`SIGTERM`. Não há consumidor BullMQ nem chamada ao LLM. Os jobs ficam no Redis e os briefs permanecem em `PENDING`.

A API, o contrato em `shared`, o schema Mongo e o polling do frontend já estão prontos para receber o processor.

### O que já amarra o worker (não refazer)

- Fila `brief-analysis`, job `analyze-brief`, payload `{ briefId, tenantId }`.
- `jobId = briefId` (idempotência na criação).
- Producer já usa 3 tentativas e backoff exponencial de 2 s.
- Documento já tem `status`, `result`, `error` (`code`, `message`, `retryable`), `attemptCount`, `processingStartedAt`, `completedAt`.
- Variáveis `OPENROUTER_*`, `LLM_TIMEOUT_MS` e `WORKER_CONCURRENCY` ficam exclusivamente em `worker/.env`, também carregado pelo Compose.
- Frontend já faz polling em `PENDING` e `PROCESSING`.

## Esforço estimado

| Bloco | Horas | Observação |
| --- | ---: | --- |
| MVP (requisitos) | 35 | D1–D8 |
| Bônus recomendados | 11 | D9–D10 |
| Transactional Outbox | 8 | Adiar |
| **Total sem outbox** | **46** | ~10 dias a 4–5 h/dia |

## Ritmos

**Meio período (~4–5 h/dia) — recomendado:** 8 dias para o MVP (D1–D8), 2 dias de bônus (D9–D10). Cabe num desafio de duas semanas sem atropelar testes.

**Tempo integral (~7–8 h/dia):** MVP em cerca de 5 dias corridos. Bônus na sequência. Outbox fora.

## Cronograma

Não começar pelos bônus. O README prioriza o fluxo ponta a ponta: job sai de `PENDING`, vira `PROCESSING`, persiste resultado ou erro visível, e o frontend mostra `COMPLETED`/`FAILED`.

| Dia | Fase | Horas | Entrega | Critério de pronto |
| --- | --- | ---: | --- | --- |
| D1 | Fundação | 4 | Config Redis, env, pastas, schema Mongoose no worker | Worker sobe, lê `REDIS_*` e `MONGODB_URI`, falha cedo se faltar chave |
| D2 | Consumidor | 4 | Instância `Worker` BullMQ na fila `brief-analysis` | Job publicado pela API é pego; log com `briefId` e `tenantId` |
| D3 | Estados | 4 | Transições atômicas `PENDING → PROCESSING → COMPLETED/FAILED` | `findOneAndUpdate` com `tenantId`; `attemptCount` e timestamps preenchidos |
| D4 | LLM | 6 | Cliente OpenRouter + prompt + validação do JSON | Resultado no formato `BriefAnalysisResult` ou erro persistido |
| D5 | Confiabilidade | 5 | Timeout, retries, `UnrecoverableError`, skip de duplicata | 3 tentativas alinhadas à API; `FAILED` só na última ou erro permanente |
| D6 | Ops | 3 | Shutdown fecha Worker + Redis + Mongo; logs correlacionados | `SIGINT`/`SIGTERM` não cortam job no meio sem fechar a fila |
| D7 | Testes | 6 | Vitest (ou Jest) no worker: estados, validação, skip `COMPLETED` | LLM e Redis mockados; cobertura do processor, não do SDK |
| D8 | E2E | 3 | Compose com chave real ou stub; atualizar README | Criar brief na UI → polling → resultado ou erro visível |
| D9 | Bônus A+B | 7 | Healthcheck do worker + reconciliação de `PENDING` órfão | Compose marca worker healthy; brief sem job volta à fila |
| D10 | Bônus C | 4 | `POST /briefs/:id/retry` (API) + botão no detalhe | `FAILED` retryable reentra na fila sem violar `jobId = briefId` |

## Requisitos do MVP (README)

1. Criar o `Worker` BullMQ na fila `brief-analysis` / job `analyze-brief`.
2. Ler o brief em Mongo com `{ _id, tenantId }` — nunca só pelo id.
3. Transições `PENDING → PROCESSING → COMPLETED | FAILED` (atômicas).
4. Timeout `LLM_TIMEOUT_MS` (`AbortController`) + retries da fila.
5. Validar resposta do LLM no contrato `BriefAnalysisResult` (zod).
6. Execução duplicada: skip se `COMPLETED`; reclaim se `PROCESSING` stale.
7. Recuperação após reinício: `lockDuration` maior que o timeout; stalled jobs.
8. Logs com `briefId` / `tenantId` / `attempt`; erro persistido para a UI.
9. Graceful shutdown: `worker.close()` e depois `mongoose.disconnect()`.
10. Testes do processor (estados, validação, skip, `UnrecoverableError`).

### Contrato mínimo do processor (D3–D5)

1. Validar o payload.
2. Claim atômico para `PROCESSING`.
3. Chamar o LLM com timeout.
4. Validar JSON.
5. Gravar `result` e `COMPLETED`, limpando `error`.
6. Em falha retryable, relançar o erro do job (BullMQ tenta de novo) e só na última tentativa marcar `FAILED`.
7. Falha de schema, brief inexistente ou tenant mismatch: `UnrecoverableError` + `FAILED` não retryable.

O shutdown atual só chama `mongoose.disconnect()`. Com a fila, a ordem precisa ser: parar de aceitar jobs → esperar o job em voo → fechar conexão Redis do BullMQ → `mongoose.disconnect()`.

## Bônus (depois do E2E verde)

| Bônus | Onde | Esforço | Valor no desafio | Decisão |
| --- | --- | ---: | --- | --- |
| Healthcheck do worker | worker + Compose | 3 h | Alto — Compose hoje não sabe se o processo vive | Fazer no D9 |
| Reconciliação `PENDING` sem job | worker (scan periódico) | 4 h | Alto — fecha o gap persistência ≠ fila | Fazer no D9 |
| Retry manual | API + frontend | 4 h | Médio — UI já mostra `retryable` | Fazer no D10 |
| Transactional Outbox | API + worker | 8 h | Baixo no prazo — substitui reconciliação com mais peça | Adiar |

Retry HTTP (D10) toca API e frontend, não só o worker. A UI já mostra `retryable`; faltam o endpoint e o botão.

## Decisões recomendadas e trade-offs

| Tema | Escolha | Por quê | Custo |
| --- | --- | --- | --- |
| Schema Mongo no worker | Schema Mongoose local espelhando o da API | Worker não depende de NestJS; `shared` continua sem ODM | Duplicação; mudanças de campo exigem dois lugares |
| Cliente LLM | `fetch` + OpenAI-compatible `/v1/chat/completions` | Uma dependência a menos; base URL já está no `.env` | Sem SDK de retries próprios — a fila cobre isso |
| Validação | zod no worker a partir de `BriefAnalysisResult` | Rejeita alucinação/JSON solto antes de persistir | Prompt precisa pedir JSON estrito (`response_format`) |
| Concorrência | `concurrency: 1` ou `2` | Modelo free no OpenRouter estoura 429 fácil | Throughput baixo; escala depois com workers extra |
| `lockDuration` | `LLM_TIMEOUT_MS` + margem (ex. 45–60 s) | Evita stalled no meio da chamada HTTP | Reinício lento se o processo morrer de verdade |
| `jobId = briefId` | Manter na criação; retry usa remove + add ou sufixo | Idempotência no `POST /briefs` já existe | Retry do mesmo id colide se o job completed ainda existir |
| Healthcheck | HTTP mínimo (`http` nativo) em porta interna | Compose já usa `wget` nos outros serviços | Worker deixa de ser “só processo”; precisa bind |
| Reconciliação vs Outbox | Scan de `PENDING` antigo + re-add | Cobre o gap atual com pouca mudança na API | Janela de atraso; Outbox é mais correto e mais caro |

### Riscos se inverter a ordem

Sem processor, outbox só enfileira jobs que ninguém consome. Retry manual sem política de `jobId` quebra o producer atual. Healthcheck sem consumidor só prova que o scaffold ainda está vivo.

## Detalhes que o scaffold ainda não fecha

- **PATCH/DELETE** de brief em `PROCESSING` não cancela o job. Fora do escopo do MVP; documentar. Se o documento sumir no meio do processamento, tratar como `UnrecoverableError`.
- **`OPENROUTER_API_KEY` vazia** deve falhar o job de forma visível (`FAILED`). Em geral 401/config é permanente (`retryable: false`).
- **Não persistir** resposta do LLM sem validar o contrato. O frontend assume exatamente `summary`, `mainObjective` e as quatro listas.

## Fora deste ciclo

Não colocar NestJS no worker. Não implementar outbox, refresh token, e-mail ou cancelamento de job. Não começar pelos bônus.

Quando for implementar, o caminho natural é D1–D8 até um brief sair de `PENDING` na interface; D9–D10 só depois disso estar verde.
