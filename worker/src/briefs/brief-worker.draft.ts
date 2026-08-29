import { ANALYZE_BRIEF_JOB, BRIEF_ANALYSIS_QUEUE } from '@ai-brief/shared';

export const BRIEF_WORKER_DRAFT = {
  queueName: BRIEF_ANALYSIS_QUEUE,
  jobName: ANALYZE_BRIEF_JOB,
  pendingResponsibilities: [
    'Create the BullMQ Worker instance.',
    'Load the brief from MongoDB.',
    'Define state transitions and retry behavior.',
    'Integrate and validate the LLM response.',
    'Persist the result or a user-visible error.',
    'Close BullMQ during graceful shutdown.',
    'Cover the chosen behavior with tests.',
  ],
} as const;
