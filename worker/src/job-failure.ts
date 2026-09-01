import {
  BRIEF_ANALYSIS_FAILED_JOB,
  type AnalyzeBriefJobData,
  type FailedBriefJobData,
} from '@ai-brief/shared';
import type { Job, Queue } from 'bullmq';

export interface ErrorLogFields {
  errorCode: string;
  errorName: string;
  errorMessage: string;
}

export function configuredAttempts(attempts: number | undefined): number {
  return typeof attempts === 'number' && attempts > 0 ? attempts : 1;
}

export function describeJobFailure(
  job: Job<AnalyzeBriefJobData> | undefined,
  error: Error,
): {
  maxAttempts: number;
  currentAttempt: number;
  willRetry: boolean;
  errorFields: ErrorLogFields;
} {
  const maxAttempts = configuredAttempts(job?.opts.attempts);
  const currentAttempt = job?.attemptsMade ?? 0;

  return {
    maxAttempts,
    currentAttempt,
    willRetry:
      Boolean(job) &&
      error.name !== 'UnrecoverableError' &&
      currentAttempt < maxAttempts,
    errorFields: errorLogFields(error),
  };
}

export async function publishDeadLetter(
  queue: Queue<FailedBriefJobData> | undefined,
  job: Job<AnalyzeBriefJobData>,
  error: ErrorLogFields,
  options: { failedAt?: Date; jobId?: string } = {},
): Promise<void> {
  if (!queue) throw new Error('Dead-letter queue is closed');

  await queue.add(
    BRIEF_ANALYSIS_FAILED_JOB,
    {
      ...job.data,
      originalJobId: String(job.id),
      errorCode: error.errorCode,
      errorMessage: error.errorMessage,
      failedAt: (options.failedAt ?? new Date()).toISOString(),
    },
    { jobId: options.jobId ?? `${job.id}-${Date.now()}` },
  );
}

export function errorLogFields(error: unknown): ErrorLogFields {
  const normalizedError =
    error instanceof Error ? error : new Error('Unknown error');
  let errorCode: string | undefined;

  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    errorCode = error.code;
  }

  if (!errorCode) {
    errorCode = /^\[([A-Z0-9_]+)\]/.exec(normalizedError.message)?.[1];
  }

  return {
    errorCode: errorCode ?? 'UNCLASSIFIED_ERROR',
    errorName: normalizedError.name,
    errorMessage: normalizedError.message,
  };
}
