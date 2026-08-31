import assert from 'node:assert/strict';
import { afterEach, before, test } from 'node:test';
import {
  BriefAnalysisOutcome,
  type BriefAnalysisResult,
} from '@ai-brief/shared';
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

const analyzedResult: BriefAnalysisResult = {
  outcome: BriefAnalysisOutcome.ANALYZED,
  summary:
    'O briefing apresenta o lançamento de um veículo elétrico para jovens adultos, apoiado por sustentabilidade, tecnologia e mobilidade urbana. A análise preserva apenas os elementos informados e registra as decisões ainda necessárias.',
  mainObjective:
    'Estruturar uma campanha de lançamento que apresente o veículo elétrico aos jovens adultos e conecte sustentabilidade, tecnologia e mobilidade urbana em uma mensagem verificável e consistente.',
  targetAudience: ['Jovens adultos'],
  communicationPillars: [
    'Sustentabilidade — tema explicitamente indicado como foco da campanha.',
    'Tecnologia — dimensão declarada para sustentar a mensagem de lançamento.',
  ],
  suggestedActions: [
    'Definir uma mensagem central que conecte os pilares confirmados ao lançamento e oriente os entregáveis da campanha.',
    'Organizar as informações disponíveis do veículo antes de transformá-las em afirmações para as peças de comunicação.',
    'Validar os canais adequados ao público informado antes de consolidar a distribuição dos conteúdos da campanha.',
    'Estabelecer métricas de awareness e interesse antes do lançamento para permitir a avaliação dos resultados.',
  ],
  risks: [
    'A ausência de orçamento impede dimensionar o alcance e escolher formatos de comunicação financeiramente viáveis.',
    'Sem canais definidos, a campanha pode produzir entregáveis incompatíveis com os contextos reais de distribuição.',
    'A falta de métricas de sucesso impede verificar objetivamente o resultado alcançado pelo lançamento.',
  ],
};

function providerResponse(result: BriefAnalysisResult): Response {
  return Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify({ result }),
        },
      },
    ],
  });
}

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
      const keepEventLoopAlive = setTimeout(() => undefined, 100);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(keepEventLoopAlive);
          reject(signal.reason);
        },
        { once: true },
      );
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

test('não chama o provider para texto obviamente incoerente', async () => {
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    return providerResponse(analyzedResult);
  };

  const result = (await analyzeBrief({
    title: 'Teste aleatório',
    brief: 'adsdasdsadsa adsdasdsadsa adsdasdsadsa',
  })) as BriefAnalysisResult;

  assert.equal(fetchCalled, false);
  assert.equal(result.outcome, BriefAnalysisOutcome.INSUFFICIENT_BRIEF);
});

test('envia regras de grounding e retorna análise estruturada', async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(typeof init?.body, 'string');
    const request = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
      response_format: { json_schema: { schema: unknown } };
    };
    const systemMessage = request.messages.find(
      (message) => message.role === 'system',
    );
    const userMessage = request.messages.find(
      (message) => message.role === 'user',
    );

    assert.match(systemMessage?.content ?? '', /INSUFFICIENT_BRIEF/);
    assert.match(systemMessage?.content ?? '', /não crie pilares genéricos/i);
    assert.match(userMessage?.content ?? '', /<brief_content>/);
    assert.ok(request.response_format.json_schema.schema);
    return providerResponse(analyzedResult);
  };

  const result = await analyzeBrief(input);
  assert.deepEqual(result, analyzedResult);
});

test('aceita recusa estruturada para briefing semanticamente insuficiente', async () => {
  const insufficient: BriefAnalysisResult = {
    outcome: BriefAnalysisOutcome.INSUFFICIENT_BRIEF,
    reason:
      'O texto usa palavras isoladas sem relação semântica suficiente para identificar uma iniciativa ou um objetivo.',
    missingInformation: [
      'Descrição compreensível da iniciativa',
      'Objetivo esperado para a análise',
    ],
  };
  globalThis.fetch = async () => providerResponse(insufficient);

  const result = await analyzeBrief(input);
  assert.deepEqual(result, insufficient);
});

test('rejeita recusa misturada com análise inventada', async () => {
  globalThis.fetch = async () =>
    Response.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              result: {
                outcome: BriefAnalysisOutcome.INSUFFICIENT_BRIEF,
                reason:
                  'O texto não apresenta conteúdo suficiente para sustentar uma análise confiável.',
                missingInformation: ['Descrição da iniciativa'],
                communicationPillars: [
                  'Clareza — manter a mensagem consistente.',
                ],
              },
            }),
          },
        },
      ],
    });

  await expectProcessingError('LLM_INVALID_RESPONSE', true);
});
