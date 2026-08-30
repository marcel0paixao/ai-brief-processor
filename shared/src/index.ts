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

export interface BriefAnalysisResult {
  summary: string;
  mainObjective: string;
  targetAudience: string[];
  communicationPillars: string[];
  suggestedActions: string[];
  risks: string[];
}

export interface BriefProcessingError {
  code: string;
  message: string;
  retryable: boolean;
}
