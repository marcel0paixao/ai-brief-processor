import {
  BRIEF_ANALYSIS_FAILED_JOB,
  type AnalyzeBriefJobData,
  type FailedBriefJobData,
} from '@ai-brief/shared';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Job, Queue } from 'bullmq';
import {
  describeJobFailure,
  publishDeadLetter,
} from '../src/job-failure';

function makeJob(attemptsMade: number): Job<AnalyzeBriefJobData> {
  return {
    id: 'brief-123',
    data: { briefId: 'brief-123', tenantId: 'tenant-456' },
    opts: { attempts: 3 },
    attemptsMade,
  } as Job<AnalyzeBriefJobData>;
}

test('mantém falhas recuperáveis fora da DLQ antes da última tentativa', () => {
  const error = Object.assign(new Error('O provider não respondeu.'), {
    code: 'LLM_UNAVAILABLE',
  });

  const failure = describeJobFailure(makeJob(2), error);

  assert.equal(failure.willRetry, true);
  assert.equal(failure.currentAttempt, 2);
  assert.equal(failure.maxAttempts, 3);
});

test('publica a última falha na DLQ com job, tenant e erro', async () => {
  const calls: Array<{
    name: string;
    data: FailedBriefJobData;
    options: { jobId?: string };
  }> = [];
  const queue = {
    add: async (
      name: string,
      data: FailedBriefJobData,
      options: { jobId?: string },
    ) => {
      calls.push({ name, data, options });
    },
  } as unknown as Queue<FailedBriefJobData>;
  const error = Object.assign(new Error('O provider ultrapassou o limite.'), {
    code: 'LLM_TIMEOUT',
  });
  const job = makeJob(3);
  const failure = describeJobFailure(job, error);

  assert.equal(failure.willRetry, false);
  await publishDeadLetter(queue, job, failure.errorFields, {
    failedAt: new Date('2026-09-01T12:00:00.000Z'),
    jobId: 'brief-123-dlq',
  });

  assert.deepEqual(calls, [
    {
      name: BRIEF_ANALYSIS_FAILED_JOB,
      data: {
        briefId: 'brief-123',
        tenantId: 'tenant-456',
        originalJobId: 'brief-123',
        errorCode: 'LLM_TIMEOUT',
        errorMessage: 'O provider ultrapassou o limite.',
        failedAt: '2026-09-01T12:00:00.000Z',
      },
      options: { jobId: 'brief-123-dlq' },
    },
  ]);
});
