export const BRIEF_ANALYSIS_QUEUE = 'brief-analysis';
export const ANALYZE_BRIEF_JOB = 'analyze-brief';

export interface AnalyzeBriefJobData {
  briefId: string;
  tenantId: string;
}

export enum UserRole {
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum BriefStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum BriefAnalysisOutcome {
  ANALYZED = 'ANALYZED',
  INSUFFICIENT_BRIEF = 'INSUFFICIENT_BRIEF',
}

export interface AnalyzedBriefResult {
  outcome: BriefAnalysisOutcome.ANALYZED;
  summary: string;
  mainObjective: string;
  targetAudience: string[];
  communicationPillars: string[];
  suggestedActions: string[];
  risks: string[];
}

export interface InsufficientBriefResult {
  outcome: BriefAnalysisOutcome.INSUFFICIENT_BRIEF;
  reason: string;
  missingInformation: string[];
}

export type BriefAnalysisResult =
  | AnalyzedBriefResult
  | InsufficientBriefResult;

export type BriefInputQualityAssessment =
  | { sufficient: true }
  | {
      sufficient: false;
      reason: string;
      missingInformation: string[];
    };

export function assessBriefInputQuality(
  brief: string,
): BriefInputQualityAssessment {
  const words =
    brief
      .normalize('NFKC')
      .toLocaleLowerCase('pt-BR')
      .match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? [];
  const meaningfulWords = words.filter((word) => word.length >= 3);
  const distinctWords = new Set(meaningfulWords);
  const distinctLetters = new Set(meaningfulWords.join(''));

  if (
    words.length >= 4 &&
    distinctWords.size >= 3 &&
    distinctLetters.size >= 6
  ) {
    return { sufficient: true };
  }

  return {
    sufficient: false,
    reason:
      'O briefing não contém texto coerente suficiente para fundamentar uma análise sem inventar informações.',
    missingInformation: [
      'Uma descrição compreensível da iniciativa, produto ou problema',
      'O contexto ou resultado esperado para a análise',
    ],
  };
}

export interface BriefProcessingError {
  code: string;
  message: string;
  retryable: boolean;
}
