import 'dotenv/config';
import mongoose from 'mongoose';
import { BRIEF_WORKER_DRAFT } from './briefs/brief-worker.draft';

let isShuttingDown = false;

function getMongoUri(): string {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI is required');
  }

  return mongoUri;
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.info('Worker received ' + signal + '. Closing MongoDB connection.');
  await mongoose.disconnect();
}

async function bootstrap(): Promise<void> {
  await mongoose.connect(getMongoUri());

  console.info(
    'Worker scaffold ready for queue "' +
      BRIEF_WORKER_DRAFT.queueName +
      '" and job "' +
      BRIEF_WORKER_DRAFT.jobName +
      '".',
  );
  console.info('No BullMQ consumer is registered yet.');
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

void bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error('Worker failed to start: ' + message);
  process.exitCode = 1;
});
