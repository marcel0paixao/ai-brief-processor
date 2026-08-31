import { ANALYZE_BRIEF_JOB } from '@ai-brief/shared';
import type {
  AnalyzeBriefJobData,
  BriefAnalysisResult,
  BriefProcessingError,
} from '@ai-brief/shared';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { ProcessingError } from '../errors/processing-error';
import type { BriefRepository } from './brief-repository';

interface AnalyzeBriefInput {
  title: string;
  brief: string;
}

interface BriefProcessorLogger {
  warn(message: string, metadata: Record<string, unknown>): void;
}

export interface BriefProcessorResult {
  briefId: string;
  skipped?: boolean;
}

export interface BriefProcessorDependencies {
  repository: BriefRepository;
  analyzeBrief(input: AnalyzeBriefInput): Promise<BriefAnalysisResult>;
  logger?: BriefProcessorLogger;
}

function readJobScope(job: Job<AnalyzeBriefJobData>): AnalyzeBriefJobData {
  if (job.name !== ANALYZE_BRIEF_JOB) {
    throw new ProcessingError(
      'INVALID_JOB_DATA',
      `Nome de job inválido: esperado ${ANALYZE_BRIEF_JOB}, recebido ${job.name}.`,
      false,
    );
  }

  const briefId = job.data?.briefId?.trim();
  const tenantId = job.data?.tenantId?.trim();

  if (!briefId || !tenantId) {
    throw new ProcessingError(
      'INVALID_JOB_DATA',
      'Brief ID e tenant ID são obrigatórios.',
      false,
    );
  }

  return { briefId, tenantId };
}

function normalizeError(error: unknown): ProcessingError {
  if (error instanceof ProcessingError) {
    return error;
  }

  return new ProcessingError(
    'WORKER_INTERNAL_ERROR',
    'Ocorreu um erro inesperado durante o processamento.',
    true,
    { cause: error },
  );
}

function serializeError(error: ProcessingError): BriefProcessingError {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  };
}

function configuredAttempts(job: Job<AnalyzeBriefJobData>): number {
  const attempts = job.opts.attempts;
  return typeof attempts === 'number' && attempts > 0 ? attempts : 1;
}

function toUnrecoverableError(error: ProcessingError): UnrecoverableError {
  return new UnrecoverableError(`[${error.code}] ${error.message}`);
}

export function createBriefProcessor(dependencies: BriefProcessorDependencies) {
  return async function processBrief(
    job: Job<AnalyzeBriefJobData>,
  ): Promise<BriefProcessorResult> {
    const { repository, analyzeBrief, logger = console } = dependencies;
    let scope: AnalyzeBriefJobData | undefined;
    let attemptStarted = false;

    try {
      scope = readJobScope(job);
      const attempt = await repository.startAttempt(
        scope.briefId,
        scope.tenantId,
      );

      if (attempt.kind === 'alreadyCompleted') {
        return { briefId: scope.briefId, skipped: true };
      }

      attemptStarted = true;
      const result = await analyzeBrief({
        title: attempt.brief.title,
        brief: attempt.brief.brief,
      });
      const completed = await repository.complete(
        scope.briefId,
        scope.tenantId,
        result,
      );

      if (!completed) {
        logger.warn('Não foi possível concluir a transição do brief.', {
          briefId: scope.briefId,
          tenantId: scope.tenantId,
          jobId: job.id,
          attemptsStarted: job.attemptsStarted,
        });
        throw new ProcessingError(
          'WORKER_INTERNAL_ERROR',
          'O estado do brief mudou durante o processamento.',
          true,
        );
      }

      return { briefId: scope.briefId };
    } catch (error) {
      const processingError = normalizeError(error);
      const storedError = serializeError(processingError);
      const currentAttempt = job.attemptsMade + 1;
      const maxAttempts = configuredAttempts(job);
      const willRetry =
        processingError.retryable && currentAttempt < maxAttempts;

      if (scope && attemptStarted) {
        const persisted = willRetry
          ? await repository.prepareRetry(
              scope.briefId,
              scope.tenantId,
              storedError,
            )
          : await repository.fail(
              scope.briefId,
              scope.tenantId,
              storedError,
            );

        if (!persisted) {
          logger.warn('A transição de falha do brief não foi aplicada.', {
            briefId: scope.briefId,
            tenantId: scope.tenantId,
            jobId: job.id,
            targetStatus: willRetry ? 'PENDING' : 'FAILED',
            currentAttempt,
            maxAttempts,
            attemptsStarted: job.attemptsStarted,
          });
        }
      }

      if (!processingError.retryable) {
        throw toUnrecoverableError(processingError);
      }

      throw processingError;
    }
  };
}
