import assert from 'node:assert/strict';
import { afterEach, before, test } from 'node:test';
import { ProcessingError } from '../src/errors/processing-error';

type AnalyzeBrief = (input: {
  title: string;
  brief: string;
}) => Promise<unknown>;

const originalFetch = globalThis.fetch;
let analyzeBrief: AnalyzeBrief;

before(async () => {
  process.env.MONGODB_URI = 'mongodb://localhost/test';
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_MODEL = 'test-model';
  process.env.OPENROUTER_BASE_URL = 'https://provider.test/api/v1';
  process.env.LLM_TIMEOUT_MS = '5';
  ({ analyzeBrief } = await import('../src/llm/openrouter-client'));
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const input = {
  title: 'Campanha de teste',
  brief: 'Briefing suficientemente longo para testar o cliente isoladamente.',
};

async function expectProcessingError(
  code: string,
  retryable: boolean,
): Promise<void> {
  await assert.rejects(analyzeBrief(input), (error: unknown) => {
    assert.ok(error instanceof ProcessingError);
    assert.equal(error.code, code);
    assert.equal(error.retryable, retryable);
    return true;
  });
}

test('classifica 401 como erro de autenticação não recuperável', async () => {
  globalThis.fetch = async () => new Response(null, { status: 401 });
  await expectProcessingError('LLM_AUTH_ERROR', false);
});

test('classifica 400 como requisição inválida não recuperável', async () => {
  globalThis.fetch = async () => new Response(null, { status: 400 });
  await expectProcessingError('LLM_REQUEST_INVALID', false);
});

test('classifica 408 como timeout recuperável', async () => {
  globalThis.fetch = async () => new Response(null, { status: 408 });
  await expectProcessingError('LLM_TIMEOUT', true);
});

test('classifica 429 como rate limit recuperável', async () => {
  globalThis.fetch = async () => new Response(null, { status: 429 });
  await expectProcessingError('LLM_RATE_LIMITED', true);
});

test('classifica 5xx como indisponibilidade recuperável', async () => {
  globalThis.fetch = async () => new Response(null, { status: 503 });
  await expectProcessingError('LLM_UNAVAILABLE', true);
});

test('classifica falha de rede como indisponibilidade, não timeout', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('connection refused');
  };
  await expectProcessingError('LLM_UNAVAILABLE', true);
});

test('classifica somente o aborto do signal como timeout real', async () => {
  globalThis.fetch = async (_input, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      assert.ok(signal);
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      });
    });

  await expectProcessingError('LLM_TIMEOUT', true);
});

test('classifica timeout durante leitura do corpo como timeout', async () => {
  globalThis.fetch = async () =>
    ({
      ok: true,
      status: 200,
      json: async () => {
        throw new DOMException('The operation timed out', 'TimeoutError');
      },
    }) as Response;

  await expectProcessingError('LLM_TIMEOUT', true);
});
