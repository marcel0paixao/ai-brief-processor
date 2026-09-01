import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANALYZE_BRIEF_JOB,
  type AnalyzeBriefJobData,
  BriefAnalysisOutcome,
  type BriefAnalysisResult,
  BriefStatus,
} from '@ai-brief/shared';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { Types } from 'mongoose';
import { createBriefProcessor } from '../src/briefs/brief-processor';
import type { BriefRecord } from '../src/briefs/brief-record';
import type { BriefRepository } from '../src/briefs/brief-repository';
import { ProcessingError } from '../src/errors/processing-error';

const analysis: BriefAnalysisResult = {
  outcome: BriefAnalysisOutcome.ANALYZED,
  summary: 'Resumo',
  mainObjective: 'Objetivo',
  targetAudience: ['Público'],
  communicationPillars: ['Clareza'],
  suggestedActions: ['Executar'],
  risks: ['Risco'],
};

const brief: BriefRecord = {
  _id: new Types.ObjectId(),
  tenantId: new Types.ObjectId(),
  title: 'Campanha',
  brief: 'Conteúdo do briefing',
  status: BriefStatus.PROCESSING,
  attemptCount: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function makeJob(
  overrides: Partial<Job<AnalyzeBriefJobData>> = {},
): Job<AnalyzeBriefJobData> {
  return {
    id: 'job-1',
    name: ANALYZE_BRIEF_JOB,
    data: {
      briefId: brief._id.toHexString(),
      tenantId: brief.tenantId.toHexString(),
    },
    opts: { attempts: 3 },
    attemptsMade: 0,
    attemptsStarted: 1,
    ...overrides,
  } as Job<AnalyzeBriefJobData>;
}

function makeRepository(
  overrides: Partial<BriefRepository> = {},
): BriefRepository {
  return {
    startAttempt: async () => ({ kind: 'process', brief }),
    complete: async () => true,
    prepareRetry: async () => true,
    fail: async () => true,
    ...overrides,
  };
}

test('conclui um brief e retorna seu ID', async () => {
  let attemptsStarted = 0;
  let analyzerCalls = 0;
  let completedWith: BriefAnalysisResult | undefined;
  const publishedStatuses: BriefStatus[] = [];
  const repository = makeRepository({
    startAttempt: async (briefId, tenantId) => {
      attemptsStarted += 1;
      assert.equal(briefId, brief._id.toHexString());
      assert.equal(tenantId, brief.tenantId.toHexString());
      return { kind: 'process', brief };
    },
    complete: async (_briefId, _tenantId, result) => {
      completedWith = result;
      return true;
    },
  });
  const processor = createBriefProcessor({
    repository,
    analyzeBrief: async (input) => {
      analyzerCalls += 1;
      assert.deepEqual(input, {
        title: brief.title,
        brief: brief.brief,
      });
      return analysis;
    },
    publishBriefUpdate: async (event) => {
      publishedStatuses.push(event.status);
    },
  });

  const result = await processor(makeJob());

  assert.deepEqual(result, { briefId: brief._id.toHexString() });
  assert.equal(attemptsStarted, 1);
  assert.equal(analyzerCalls, 1);
  assert.deepEqual(completedWith, analysis);
  assert.deepEqual(publishedStatuses, [
    BriefStatus.PROCESSING,
    BriefStatus.COMPLETED,
  ]);
});

test('não chama a IA quando o brief já foi concluído', async () => {
  let analyzerCalled = false;
  const repository = makeRepository({
    startAttempt: async () => ({ kind: 'alreadyCompleted' }),
  });
  const processor = createBriefProcessor({
    repository,
    analyzeBrief: async () => {
      analyzerCalled = true;
      return analysis;
    },
  });

  const result = await processor(makeJob());

  assert.deepEqual(result, {
    briefId: brief._id.toHexString(),
    skipped: true,
  });
  assert.equal(analyzerCalled, false);
});

test('prepara retry para timeout antes da última tentativa', async () => {
  let retryError: unknown;
  let failed = false;
  const repository = makeRepository({
    prepareRetry: async (_briefId, _tenantId, error) => {
      retryError = error;
      return true;
    },
    fail: async () => {
      failed = true;
      return true;
    },
  });
  const processor = createBriefProcessor({
    repository,
    analyzeBrief: async () => {
      throw new ProcessingError('LLM_TIMEOUT', 'Tempo limite.', true);
    },
  });

  await assert.rejects(processor(makeJob()), ProcessingError);
  assert.deepEqual(retryError, {
    code: 'LLM_TIMEOUT',
    message: 'Tempo limite.',
    retryable: true,
  });
  assert.equal(failed, false);
});

test('marca como FAILED um erro recuperável na última tentativa', async () => {
  let failedError: unknown;
  let preparedRetry = false;
  const repository = makeRepository({
    prepareRetry: async () => {
      preparedRetry = true;
      return true;
    },
    fail: async (_briefId, _tenantId, error) => {
      failedError = error;
      return true;
    },
  });
  const processor = createBriefProcessor({
    repository,
    analyzeBrief: async () => {
      throw new ProcessingError('LLM_TIMEOUT', 'Tempo limite.', true);
    },
  });

  await assert.rejects(
    processor(makeJob({ attemptsMade: 2 })),
    ProcessingError,
  );
  assert.deepEqual(failedError, {
    code: 'LLM_TIMEOUT',
    message: 'Tempo limite.',
    retryable: true,
  });
  assert.equal(preparedRetry, false);
});

test('marca erro não recuperável e impede novos retries do BullMQ', async () => {
  let failedError: unknown;
  let preparedRetry = false;
  const repository = makeRepository({
    prepareRetry: async () => {
      preparedRetry = true;
      return true;
    },
    fail: async (_briefId, _tenantId, error) => {
      failedError = error;
      return true;
    },
  });
  const processor = createBriefProcessor({
    repository,
    analyzeBrief: async () => {
      throw new ProcessingError('LLM_AUTH_ERROR', 'Sem permissão.', false);
    },
  });

  await assert.rejects(processor(makeJob()), UnrecoverableError);
  assert.deepEqual(failedError, {
    code: 'LLM_AUTH_ERROR',
    message: 'Sem permissão.',
    retryable: false,
  });
  assert.equal(preparedRetry, false);
});

test('job inválido é irrecuperável e não acessa o repositório', async () => {
  let repositoryCalled = false;
  const repository = makeRepository({
    startAttempt: async () => {
      repositoryCalled = true;
      return { kind: 'process', brief };
    },
  });
  const processor = createBriefProcessor({
    repository,
    analyzeBrief: async () => analysis,
  });

  await assert.rejects(
    processor(
      makeJob({
        data: { briefId: '', tenantId: brief.tenantId.toHexString() },
      }),
    ),
    UnrecoverableError,
  );
  assert.equal(repositoryCalled, false);
});
