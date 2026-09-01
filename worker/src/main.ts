import './load-env';
import {
  BRIEF_ANALYSIS_DLQ,
  BRIEF_ANALYSIS_QUEUE,
  BRIEF_EVENTS_CHANNEL,
  type AnalyzeBriefJobData,
  type FailedBriefJobData,
} from '@ai-brief/shared';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import mongoose from 'mongoose';
import {
  createBriefProcessor,
  type BriefProcessorResult,
} from './briefs/brief-processor';
import { briefRepository } from './briefs/brief-repository';
import { config } from './config';
import {
  configuredAttempts,
  describeJobFailure,
  errorLogFields,
  publishDeadLetter,
} from './job-failure';
import { analyzeBrief } from './llm/openrouter-client';
import { logger, processorLogger } from './logger';
import { WorkerOperations } from './operations';

type ShutdownReason = NodeJS.Signals | 'STARTUP_FAILURE';

let isShuttingDown = false;
let worker: Worker<AnalyzeBriefJobData, BriefProcessorResult> | undefined;
let deadLetterQueue: Queue<FailedBriefJobData> | undefined;
let redis: IORedis | undefined;
let eventsRedis: IORedis | undefined;
let operations: WorkerOperations | undefined;

async function bootstrap(): Promise<void> {
  await mongoose.connect(config.mongodbUri);

  redis = new IORedis({
    host: config.redisHost,
    port: config.redisPort,
    db: config.redisDb,
    maxRetriesPerRequest: null,
  });
  eventsRedis = redis.duplicate({ connectionName: 'brief-events-publisher' });
  deadLetterQueue = new Queue<FailedBriefJobData>(BRIEF_ANALYSIS_DLQ, {
    connection: redis,
  });

  worker = new Worker(
    BRIEF_ANALYSIS_QUEUE,
    createBriefProcessor({
      repository: briefRepository,
      analyzeBrief,
      logger: processorLogger,
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

  operations = new WorkerOperations(
    config.operationsPort,
    () =>
      worker?.isRunning() === true &&
      redis?.status === 'ready' &&
      mongoose.connection.readyState === 1,
  );

  worker.on('active', (job) => {
    const maxAttempts = configuredAttempts(job.opts.attempts);

    logger.info(
      {
        jobId: job.id,
        briefId: job.data.briefId,
        tenantId: job.data.tenantId,
        currentAttempt: job.attemptsMade + 1,
        maxAttempts,
        status: 'PROCESSING',
      },
      'Brief job started',
    );
  });

  worker.on('completed', (job) => {
    const durationMs =
      job.processedOn && job.finishedOn
        ? job.finishedOn - job.processedOn
        : undefined;
    operations?.recordCompleted(durationMs);

    logger.info(
      {
        jobId: job.id,
        briefId: job.data.briefId,
        tenantId: job.data.tenantId,
        attemptsStarted: job.attemptsStarted,
        durationMs,
        status: 'COMPLETED',
      },
      'Brief job completed',
    );
  });

  worker.on('failed', (job, error) => {
    const { maxAttempts, currentAttempt, willRetry, errorFields } =
      describeJobFailure(job, error);
    operations?.recordFailed(errorFields.errorCode, willRetry);

    logger.error(
      {
        jobId: job?.id,
        briefId: job?.data.briefId,
        tenantId: job?.data.tenantId,
        currentAttempt,
        maxAttempts,
        willRetry,
        status: willRetry ? 'PENDING' : 'FAILED',
        ...errorFields,
      },
      'Brief job attempt failed',
    );

    if (job && !willRetry) {
      void publishDeadLetter(deadLetterQueue, job, errorFields).catch(
        (deadLetterError) => {
          logger.error(
            {
              jobId: job.id,
              ...errorLogFields(deadLetterError),
            },
            'Failed to publish dead-letter job',
          );
        },
      );
    }
  });

  worker.on('stalled', (jobId, previousState) => {
    operations?.recordStalled();
    logger.warn({ jobId, previousState }, 'Brief job stalled');
  });

  worker.on('error', (error) => {
    logger.error(errorLogFields(error), 'BullMQ worker error');
  });

  await worker.waitUntilReady();
  await operations.start();
  logger.info(
    {
      queue: BRIEF_ANALYSIS_QUEUE,
      concurrency: config.concurrency,
      operationsPort: config.operationsPort,
    },
    'Brief worker ready',
  );
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

void bootstrap().catch(async (error: unknown) => {
  logger.error(errorLogFields(error), 'Worker failed to start');
  process.exitCode = 1;
  await shutdown('STARTUP_FAILURE');
});

async function closeResource(
  resource: string,
  close: () => Promise<unknown> | undefined,
): Promise<boolean> {
  try {
    await close();
    return true;
  } catch (error) {
    logger.error(errorLogFields(error), `Failed to close ${resource}`);
    return false;
  }
}

async function shutdown(reason: ShutdownReason): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info({ reason }, 'Worker shutting down');

  const activeOperations = operations;
  operations = undefined;
  const operationsClosed = await closeResource('operations server', () =>
    activeOperations?.close(),
  );

  const activeWorker = worker;
  worker = undefined;
  const workerClosed = await closeResource('BullMQ worker', () =>
    activeWorker?.close(),
  );

  const activeDeadLetterQueue = deadLetterQueue;
  deadLetterQueue = undefined;
  const deadLetterQueueClosed = await closeResource('dead-letter queue', () =>
    activeDeadLetterQueue?.close(),
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
    operationsClosed &&
    workerClosed &&
    deadLetterQueueClosed &&
    eventsRedisClosed &&
    redisClosed &&
    mongoClosed;
  if (!clean) process.exitCode = 1;

  logger.info({ reason, clean }, 'Worker stopped');
}
