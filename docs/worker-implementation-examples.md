# Worker: entregas com exemplos de código

Complemento de [worker-implementation-plan.md](./worker-implementation-plan.md). Este arquivo mostra **o que entra no disco em cada dia** e trechos ilustrativos alinhados ao scaffold atual.

Os snippets são esboço de desenho, não implementação copiável linha a linha. Nomes de fila, job, payload e status já existem em `@ai-brief/shared`. O producer da API já usa `attempts: 3`, backoff de 2 s e `jobId: briefId`.

Não implementar NestJS no worker. Não começar pelos bônus.

## Árvore proposta (MVP)

```text
worker/src/
  main.ts                         # bootstrap + shutdown
  config.ts                       # env tipado
  briefs/
    brief.schema.ts               # Mongoose local (espelha a API)
    brief.repository.ts           # claims atômicos
    analyze-brief.processor.ts    # orquestra o job
    brief-analysis.schema.ts      # zod
  llm/
    openrouter.client.ts
    prompt.ts
  queue/
    create-brief-worker.ts        # new Worker(...)
    redis.ts
  logging.ts
```

Bônus (D9–D10) acrescentam `health/http.ts`, `briefs/reconciliation.ts` e, na API/frontend, retry.

Remover `brief-worker.draft.ts` quando o consumidor existir.

---

## D1 — Fundação (config + schema)

**Entrega:** o processo ainda não consome a fila, mas falha cedo se faltar env e o schema do brief existe no worker (sem Nest).

**Arquivos:** `worker/src/config.ts`, `worker/src/briefs/brief.schema.ts`.

```ts
// worker/src/config.ts
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(name + ' is required');
  return value;
}

export function loadConfig() {
  return {
    mongodbUri: required('MONGODB_URI'),
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      db: Number(process.env.REDIS_DB ?? 0),
    },
    openRouter: {
      apiKey: process.env.OPENROUTER_API_KEY ?? '',
      model: process.env.OPENROUTER_MODEL ?? 'openrouter/free',
      baseUrl: process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
      timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 30_000),
    },
  };
}
```

Schema Mongoose no worker: mesma collection `briefs`, mesmos campos da API (`status`, `result`, `error`, `attemptCount`, `processingStartedAt`, `completedAt`, `tenantId`). Importar só `BriefStatus` de `@ai-brief/shared`, não o schema Nest.

**Pronto quando:** `npm run start:dev --workspace worker` sobe com `MONGODB_URI` e cai com mensagem clara sem ela.

---

## D2 — Consumidor BullMQ

**Entrega:** cada `analyze-brief` publicado pela API gera um log. Ainda pode não persistir status.

**Arquivos:** `worker/src/queue/redis.ts`, `worker/src/queue/create-brief-worker.ts`, `main.ts` passa a registrar o Worker.

```ts
// worker/src/queue/redis.ts
import { Redis } from 'ioredis';

export function createRedisConnection(config: {
  host: string;
  port: number;
  db: number;
}) {
  return new Redis({
    ...config,
    maxRetriesPerRequest: null, // exigido pelo Worker do BullMQ
    connectionName: 'brief-consumer',
  });
}
```

```ts
// worker/src/queue/create-brief-worker.ts
import {
  ANALYZE_BRIEF_JOB,
  BRIEF_ANALYSIS_QUEUE,
  type AnalyzeBriefJobData,
} from '@ai-brief/shared';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';

export function createBriefWorker(
  connection: Redis,
  processJob: (data: AnalyzeBriefJobData, attempt: number) => Promise<void>,
  lockDurationMs: number,
) {
  return new Worker<AnalyzeBriefJobData>(
    BRIEF_ANALYSIS_QUEUE,
    async (job) => {
      if (job.name !== ANALYZE_BRIEF_JOB) return;
      await processJob(job.data, job.attemptsMade + 1);
    },
    {
      connection,
      concurrency: 1,
      lockDuration: lockDurationMs,
    },
  );
}
```

No `bootstrap`, depois do `mongoose.connect`: criar Redis, criar Worker, guardar as instâncias para o shutdown (D6).

**Pronto quando:** `POST /briefs` na API faz o worker imprimir `briefId` e `tenantId`. O documento ainda pode ficar `PENDING` até o D3.

---

## D3 — Transições atômicas

**Entrega:** o job muda o Mongo mesmo com LLM stub (resultado fake ou skip da chamada).

**Arquivo:** `worker/src/briefs/brief.repository.ts`.

Sempre filtrar `_id` **e** `tenantId`. Claim só a partir de `PENDING` (ou `PROCESSING` stale no D5).

```ts
import { BriefStatus } from '@ai-brief/shared';
import { Types } from 'mongoose';
import { BriefModel } from './brief.schema';

export async function claimForProcessing(
  briefId: string,
  tenantId: string,
) {
  return BriefModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(briefId),
      tenantId: new Types.ObjectId(tenantId),
      status: BriefStatus.PENDING,
    },
    {
      $set: {
        status: BriefStatus.PROCESSING,
        processingStartedAt: new Date(),
        error: undefined,
      },
      $inc: { attemptCount: 1 },
    },
    { returnDocument: 'after' },
  );
}

export async function markCompleted(
  briefId: string,
  tenantId: string,
  result: unknown,
) {
  return BriefModel.updateOne(
    {
      _id: new Types.ObjectId(briefId),
      tenantId: new Types.ObjectId(tenantId),
      status: BriefStatus.PROCESSING,
    },
    {
      $set: {
        status: BriefStatus.COMPLETED,
        result,
        completedAt: new Date(),
      },
      $unset: { error: 1 },
    },
  );
}

export async function markFailed(
  briefId: string,
  tenantId: string,
  error: { code: string; message: string; retryable: boolean },
) {
  return BriefModel.updateOne(
    {
      _id: new Types.ObjectId(briefId),
      tenantId: new Types.ObjectId(tenantId),
    },
    {
      $set: {
        status: BriefStatus.FAILED,
        error,
        completedAt: new Date(),
      },
    },
  );
}
```

Processor mínimo no D3:

```ts
const claimed = await claimForProcessing(data.briefId, data.tenantId);

if (!claimed) {
  // D5: distinguir COMPLETED (skip) vs PROCESSING vs not found
  return;
}

await markCompleted(data.briefId, data.tenantId, stubResult);
```

**Pronto quando:** criar um brief na UI, o detalhe passa por `PROCESSING` e chega em `COMPLETED` com um stub (polling já existe no frontend).

---

## D4 — OpenRouter + validação

**Entrega:** o stub some. Resposta inválida não grava `result`.

**Arquivos:** `worker/src/llm/openrouter.client.ts`, `worker/src/llm/prompt.ts`, `worker/src/briefs/brief-analysis.schema.ts`.

```ts
// worker/src/briefs/brief-analysis.schema.ts
import { z } from 'zod';

export const briefAnalysisResultSchema = z.object({
  summary: z.string().min(1),
  mainObjective: z.string().min(1),
  targetAudience: z.array(z.string()).min(1),
  communicationPillars: z.array(z.string()).min(1),
  suggestedActions: z.array(z.string()).min(1),
  risks: z.array(z.string()).min(1),
});
```

```ts
// worker/src/llm/openrouter.client.ts
export async function analyzeBriefWithLlm(input: {
  title: string;
  brief: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
}): Promise<unknown> {
  if (!input.apiKey) {
    const error = new Error('OPENROUTER_API_KEY is missing');
    (error as Error & { permanent?: boolean }).permanent = true;
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await fetch(input.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: 'Bearer ' + input.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: 'Title: ' + input.title + '\n\nBrief:\n' + input.brief,
          },
        ],
      }),
    });

    if (response.status === 401 || response.status === 403) {
      const error = new Error('LLM authentication failed');
      (error as Error & { permanent?: boolean }).permanent = true;
      throw error;
    }

    if (!response.ok) {
      throw new Error('LLM HTTP ' + response.status);
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned empty content');
    return JSON.parse(content) as unknown;
  } finally {
    clearTimeout(timer);
  }
}
```

`SYSTEM_PROMPT` deve pedir **somente** JSON com as chaves de `BriefAnalysisResult` (`summary`, `mainObjective`, `targetAudience`, `communicationPillars`, `suggestedActions`, `risks`).

Depois do parse:

```ts
const parsed = briefAnalysisResultSchema.safeParse(raw);

if (!parsed.success) {
  throw new Error('LLM_INVALID_RESPONSE');
}

await markCompleted(briefId, tenantId, parsed.data);
```

**Pronto quando:** um brief real na UI mostra o grid de resultado (não o stub). JSON lixo vai para o caminho de erro (D5 fecha se isso é retry ou `FAILED` permanente).

---

## D5 — Retries, timeout, duplicata

**Entrega:** comportamento alinhado ao producer (`attempts: 3`).

**Arquivo principal:** `worker/src/briefs/analyze-brief.processor.ts`.

```ts
import { BriefStatus, type AnalyzeBriefJobData } from '@ai-brief/shared';
import { UnrecoverableError } from 'bullmq';

const MAX_ATTEMPTS = 3;

export async function processAnalyzeBrief(
  data: AnalyzeBriefJobData,
  attempt: number,
): Promise<void> {
  const existing = await findBrief(data.briefId, data.tenantId);

  if (!existing) {
    throw new UnrecoverableError('Brief not found for tenant');
  }

  if (existing.status === BriefStatus.COMPLETED) {
    return;
  }

  const claimed = await claimForProcessing(data.briefId, data.tenantId);
  if (!claimed && existing.status === BriefStatus.PROCESSING) {
    // outra tentativa / worker; D5 pode reclaim se processingStartedAt for velho
  }

  try {
    const raw = await analyzeBriefWithLlm(/* ... */);
    const parsed = briefAnalysisResultSchema.parse(raw);
    await markCompleted(data.briefId, data.tenantId, parsed);
  } catch (error) {
    const permanent = isPermanent(error);
    const lastAttempt = attempt >= MAX_ATTEMPTS;

    if (permanent || lastAttempt) {
      await markFailed(data.briefId, data.tenantId, {
        code: permanent ? 'LLM_PERMANENT' : 'LLM_RETRY_EXHAUSTED',
        message: error instanceof Error ? error.message : 'Unknown error',
        retryable: !permanent,
      });
      if (permanent) throw new UnrecoverableError('Permanent LLM failure');
      return;
    }

    throw error; // BullMQ agenda a próxima tentativa
  }
}
```

`isPermanent`: chave ausente, 401/403, brief inexistente, JSON inválido **depois** da política que você escolher (inválido pode ser retryable nas primeiras tentativas — documentar a escolha).

`lockDuration`: `LLM_TIMEOUT_MS + 15_000` (ex.: 45 s se o timeout for 30 s).

**Pronto quando:** matar o OpenRouter / timeout deixa o brief em `PROCESSING` e depois `FAILED` com `retryable: true` na última tentativa; chave inválida vai direto para `FAILED` não retryable.

---

## D6 — Shutdown e logs

**Entrega:** `SIGINT`/`SIGTERM` não deixam job preso além do lock do BullMQ.

Substituir o shutdown atual (só Mongo) por esta ordem:

```ts
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.info(JSON.stringify({ msg: 'shutting_down', signal }));

  if (briefWorker) await briefWorker.close();
  if (redis) await redis.quit();
  await mongoose.disconnect();
}
```

Log por job (não precisa de Pino no MVP):

```ts
console.info(
  JSON.stringify({
    msg: 'job_started',
    briefId: data.briefId,
    tenantId: data.tenantId,
    attempt,
  }),
);
```

**Pronto quando:** `Ctrl+C` no `start:dev` espera o job em voo (ou até o close do Worker) e encerra sem erro de conexão Redis aberta.

---

## D7 — Testes

**Entrega:** script `test` no workspace `worker` (Vitest combina com o frontend; Jest com o backend — escolher um e não misturar no mesmo pacote).

Casos mínimos:

| Caso | Esperado |
| --- | --- |
| Brief `PENDING` + LLM ok | `COMPLETED` + `result` |
| LLM lança timeout nas 2 primeiras | relança; na 3ª `FAILED` retryable |
| Brief já `COMPLETED` | não chama LLM |
| `tenantId` errado | `UnrecoverableError` |
| JSON fora do zod | não persiste `result` |

```ts
it('skips completed briefs without calling the LLM', async () => {
  const llm = vi.fn();
  await processAnalyzeBrief(
    { briefId: completed.id, tenantId: completed.tenantId },
    1,
    { llm, repo: fakeRepoWith(completed) },
  );
  expect(llm).not.toHaveBeenCalled();
});
```

Injetar `llm` e `repo` no processor (parâmetro ou factory). Não bater Redis/Mongo reais no unitário.

**Pronto quando:** `npm test --workspace worker` passa no CI local sem Docker extra.

---

## D8 — E2E e README

**Entrega:** checklist manual, não código novo obrigatório.

1. `npm run env:setup` e preencher `OPENROUTER_API_KEY` somente em `worker/.env`.
2. `npm run infra:up` + `dev:backend` + `dev:worker` + `dev:frontend`.
3. Registrar tenant, criar brief ≥ 20 caracteres.
4. Detalhe: `PENDING` → `PROCESSING` → `COMPLETED` com as seis seções.
5. Conferir `attemptCount` e `completedAt` no GET.
6. Atualizar o README: tirar “processor pendente” / “scaffold”.

**Pronto quando:** o fluxo acima funciona uma vez sem mexer no Redis à mão.

---

## D9 — Bônus: healthcheck + reconciliação

### Healthcheck

HTTP mínimo (ex. porta `8081`), só no worker:

```ts
import http from 'node:http';

export function startHealthServer(port: number) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  });
  server.listen(port, '0.0.0.0');
  return server;
}
```

No `docker-compose.yml` do serviço `worker`:

```yaml
ports: []  # não precisa expor no host
healthcheck:
  test: ["CMD", "wget", "--quiet", "--spider", "http://127.0.0.1:8081/health"]
  interval: 10s
  timeout: 5s
  retries: 5
  start_period: 10s
```

Ajustar path (`/` vs `/health`) para bater com o servidor. Imagem Alpine do worker hoje não inclui `wget` — ou instalar no Dockerfile, ou usar `node -e "fetch(...)"` no `healthcheck`.

### Reconciliação

A cada N minutos (ex. 2 min), listar `PENDING` com `createdAt` mais antigo que 1–2 min e `queue.add` de novo.

```ts
await queue.add(
  ANALYZE_BRIEF_JOB,
  { briefId: brief.id, tenantId: brief.tenantId },
  { jobId: brief.id },
);
```

Se o job ainda existir, o add com o mesmo `jobId` falha: capturar e ignorar (já está na fila). Isso cobre o gap “Mongo gravou, Redis não”.

**Pronto quando:** `docker compose ps` marca worker healthy; um `PENDING` órfão (job apagado no Redis) volta a processar.

---

## D10 — Bônus: retry manual

**Entrega fora do worker:** API + botão no detalhe. O processor do D5 já precisa aceitar `FAILED` retryable voltando para a fila.

### API

```ts
// briefs.controller.ts
@Post(':id/retry')
@HttpCode(HttpStatus.ACCEPTED)
retry(
  @Param() { id }: BriefIdParamDto,
  @CurrentUser() currentUser: AuthenticatedUser,
) {
  return this.briefsService.retry(id, currentUser);
}
```

```ts
// briefs.service.ts (ideia)
async retry(id: string, currentUser: AuthenticatedUser) {
  const brief = await this.findByIdOrThrow(id, currentUser.tenantId);

  if (brief.status !== BriefStatus.FAILED || !brief.error?.retryable) {
    throw new BadRequestException('Brief cannot be retried');
  }

  await this.briefModel.updateOne(
    { _id: brief._id, tenantId: brief.tenantId },
    { $set: { status: BriefStatus.PENDING }, $unset: { error: 1, completedAt: 1 } },
  );

  await this.queue.remove(id); // evita colisão com jobId = briefId
  await this.briefsQueueService.enqueueAnalysis(id, currentUser.tenantId);

  return { id, status: BriefStatus.PENDING };
}
```

`Queue.remove` + `add` com o mesmo `jobId` é a escolha alinhada ao producer atual. Alternativa: `jobId: id + ':' + Date.now()` — aí a reconciliação e a criação precisam da mesma regra.

### Frontend

Em `BriefDetailPage`, se `error?.retryable`, botão “Tentar novamente” → `POST /briefs/:id/retry` → volta o polling.

O worker **não** precisa de rota nova: só claim a partir de `PENDING` de novo.

**Pronto quando:** um brief `FAILED` retryable volta a `PENDING`/`PROCESSING` e completa ou falha de novo, visível na UI.

---

## Ordem dos arquivos no git (sugestão de commits)

Não é obrigatório; ajuda na revisão.

1. `worker: add config and brief mongoose schema`
2. `worker: consume brief-analysis queue`
3. `worker: persist PROCESSING and COMPLETED`
4. `worker: integrate OpenRouter and validate JSON`
5. `worker: retries, timeout and idempotent skip`
6. `worker: graceful shutdown and structured logs`
7. `worker: unit tests for processor`
8. `docs: document end-to-end worker flow`
9. `worker: healthcheck and pending reconciliation`
10. `feat: manual brief retry endpoint and UI`

## O que estes exemplos não resolvem

- Cancelar job se o admin der PATCH/DELETE no meio do `PROCESSING`.
- Outbox transacional.
- Trocar `jobId` na criação (`POST /briefs`) — manter `briefId`.
- Dependência Nest no worker.
