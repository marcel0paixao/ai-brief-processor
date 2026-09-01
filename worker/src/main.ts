import './load-env';
import {
  BRIEF_ANALYSIS_QUEUE,
  BRIEF_EVENTS_CHANNEL,
} from '@ai-brief/shared';
import type { AnalyzeBriefJobData } from '@ai-brief/shared';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import mongoose from 'mongoose';
import {
  createBriefProcessor,
  type BriefProcessorResult,
} from './briefs/brief-processor';
import { briefRepository } from './briefs/brief-repository';
import { config } from './config';
import { analyzeBrief } from './llm/openrouter-client';

type ShutdownReason = NodeJS.Signals | 'STARTUP_FAILURE';

let isShuttingDown = false;

let worker: Worker<AnalyzeBriefJobData, BriefProcessorResult> | undefined;
let redis: IORedis | undefined;
let eventsRedis: IORedis | undefined;

async function bootstrap(): Promise<void> {
  await mongoose.connect(config.mongodbUri);

  redis = new IORedis({
    host: config.redisHost,
    port: config.redisPort,
    db: config.redisDb,
    maxRetriesPerRequest: null,
  });
  eventsRedis = redis.duplicate({ connectionName: 'brief-events-publisher' });

  worker = new Worker(
    BRIEF_ANALYSIS_QUEUE,
    createBriefProcessor({
      repository: briefRepository,
      analyzeBrief,
      publishBriefUpdate: async (event) => {
        if (!eventsRedis) throw new Error('Brief event publisher is closed');
        await eventsRedis.publish(BRIEF_EVENTS_CHANNEL, JSON.stringify(event));
      },
    }),
    {
      connection: redis,
      concurrency: config.concurrency,
    },
  );

  worker.on('active', (job) => {
    const maxAttempts = configuredAttempts(job.opts.attempts);

    console.info('Brief job started', {
      jobId: job.id,
      briefId: job.data.briefId,
      tenantId: job.data.tenantId,
      currentAttempt: job.attemptsMade + 1,
      maxAttempts,
      status: 'PROCESSING',
    });
  });

  worker.on('completed', (job) => {
    console.info('Brief job completed', {
      jobId: job.id,
      briefId: job.data.briefId,
      tenantId: job.data.tenantId,
      attemptsStarted: job.attemptsStarted,
      durationMs:
        job.processedOn && job.finishedOn
          ? job.finishedOn - job.processedOn
          : undefined,
      status: 'COMPLETED',
    });
  });

  worker.on('failed', (job, error) => {
    const maxAttempts = configuredAttempts(job?.opts.attempts);
    const currentAttempt = job?.attemptsMade ?? 0;
    const willRetry =
      Boolean(job) &&
      error.name !== 'UnrecoverableError' &&
      currentAttempt < maxAttempts;

    console.error('Brief job attempt failed', {
      jobId: job?.id,
      briefId: job?.data.briefId,
      tenantId: job?.data.tenantId,
      currentAttempt,
      maxAttempts,
      willRetry,
      status: willRetry ? 'PENDING' : 'FAILED',
      ...errorLogFields(error),
    });
  });

  worker.on('stalled', (jobId, previousState) => {
    console.warn('Brief job stalled', {
      jobId,
      previousState,
    });
  });

  worker.on('error', (error) => {
    console.error('BullMQ worker error', {
      ...errorLogFields(error),
    });
  });

  await worker.waitUntilReady();
  console.info('Brief worker ready', {
    queue: BRIEF_ANALYSIS_QUEUE,
    concurrency: config.concurrency,
  });
}

function configuredAttempts(attempts: number | undefined): number {
  return typeof attempts === 'number' && attempts > 0 ? attempts : 1;
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

void bootstrap().catch(async (error: unknown) => {
  console.error('Worker failed to start', errorLogFields(error));
  process.exitCode = 1;
  await shutdown('STARTUP_FAILURE');
});

function errorLogFields(error: unknown): {
  errorCode: string;
  errorName: string;
  errorMessage: string;
} {
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

async function closeResource(
  resource: string,
  close: () => Promise<unknown> | undefined,
): Promise<boolean> {
  try {
    await close();
    return true;
  } catch (error) {
    console.error(`Failed to close ${resource}`, errorLogFields(error));
    return false;
  }
}

async function shutdown(reason: ShutdownReason): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.info('Worker shutting down', { reason });

  const activeWorker = worker;
  worker = undefined;
  const workerClosed = await closeResource('BullMQ worker', () =>
    activeWorker?.close(),
  );

  const activeRedis = redis;
  redis = undefined;
  const activeEventsRedis = eventsRedis;
  eventsRedis = undefined;
  const eventsRedisClosed = await closeResource(
    'Redis event publisher',
    async () => {
      if (!activeEventsRedis) return;

      try {
        await activeEventsRedis.quit();
      } catch (error) {
        activeEventsRedis.disconnect();
        throw error;
      }
    },
  );
  const redisClosed = await closeResource('Redis', async () => {
    if (!activeRedis) return;

    try {
      await activeRedis.quit();
    } catch (error) {
      activeRedis.disconnect();
      throw error;
    }
  });

  const mongoClosed = await closeResource('MongoDB', async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  const clean =
    workerClosed && eventsRedisClosed && redisClosed && mongoClosed;
  if (!clean) process.exitCode = 1;

  console.info('Worker stopped', { reason, clean });
}
