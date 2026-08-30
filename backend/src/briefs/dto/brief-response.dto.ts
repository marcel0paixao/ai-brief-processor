import { BriefStatus } from '../schemas/brief.schema';

export class BriefAnalysisResultDto {
  summary!: string;
  mainObjective!: string;
  targetAudience!: string[];
  communicationPillars!: string[];
  suggestedActions!: string[];
  risks!: string[];
}

export class BriefProcessingErrorDto {
  code!: string;
  message!: string;
  retryable!: boolean;
}

export class CreateBriefResponseDto {
  id!: string;
  status!: BriefStatus;
}

export class BriefListItemDto {
  id!: string;
  title!: string;
  status!: BriefStatus;
  createdAt!: Date;
  updatedAt!: Date;
}

export class BriefListMetaDto {
  page!: number;
  limit!: number;
  total!: number;
  totalPages!: number;
  statusCounts!: Record<BriefStatus, number>;
}

export class BriefListResponseDto {
  items!: BriefListItemDto[];
  meta!: BriefListMetaDto;
}

export class BriefDetailDto extends BriefListItemDto {
  brief!: string;
  result?: BriefAnalysisResultDto;
  error?: BriefProcessingErrorDto;
  attemptCount!: number;
  processingStartedAt?: Date;
  completedAt?: Date;
}
