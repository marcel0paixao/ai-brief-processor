import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'worker' },
  redact: {
    paths: ['openRouterApiKey', 'authorization'],
    censor: '[REDACTED]',
  },
});

export const processorLogger = {
  warn(message: string, metadata: Record<string, unknown>): void {
    logger.warn(metadata, message);
  },
};
