import type {
    BriefAnalysisResult,
    BriefProcessingError,
} from '@ai-brief/shared';
import { BriefStatus } from '@ai-brief/shared';
import type { Types } from 'mongoose';

export interface BriefRecord {
    _id: Types.ObjectId;
    tenantId: Types.ObjectId;
    title: string;
    brief: string;
    status: BriefStatus;
    result?: BriefAnalysisResult;
    error?: BriefProcessingError;
    attemptCount: number;
    processingStartedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

export type StartAttemptResult =
    | {
        kind: 'process';
        brief: BriefRecord;
    }
    | {
        kind: 'alreadyCompleted';
    };