import {
    BriefStatus,
    type BriefAnalysisResult,
    type BriefProcessingError,
} from '@ai-brief/shared';
import mongoose, { Types } from 'mongoose';
import { ProcessingError } from '../errors/processing-error';
import type {
    BriefRecord,
    StartAttemptResult,
} from './brief-record';

export interface BriefRepository {
    startAttempt(
        briefId: string,
        tenantId: string,
    ): Promise<StartAttemptResult>;

    complete(
        briefId: string,
        tenantId: string,
        result: BriefAnalysisResult,
    ): Promise<boolean>;

    prepareRetry(
        briefId: string,
        tenantId: string,
        error: BriefProcessingError,
    ): Promise<boolean>;

    fail(
        briefId: string,
        tenantId: string,
        error: BriefProcessingError,
    ): Promise<boolean>;
}

function collection() {
    const database = mongoose.connection.db;

    if (!database) {
        throw new Error('MongoDB is not connected');
    }

    return database.collection<BriefRecord>('briefs');
}

function parseScope(
    briefId: string,
    tenantId: string,
): {
    _id: Types.ObjectId;
    tenantId: Types.ObjectId;
} {
    if (
        !Types.ObjectId.isValid(briefId) ||
        !Types.ObjectId.isValid(tenantId)
    ) {
        throw new ProcessingError(
            'INVALID_JOB_DATA',
            'O job contém identificadores inválidos.',
            false,
        );
    }

    return {
        _id: new Types.ObjectId(briefId),
        tenantId: new Types.ObjectId(tenantId),
    };
}

export class MongoBriefRepository implements BriefRepository {
    async startAttempt(
        briefId: string,
        tenantId: string,
    ): Promise<StartAttemptResult> {
        const scope = parseScope(briefId, tenantId);
        const now = new Date();

        const claimedBrief = await collection().findOneAndUpdate(
            {
                ...scope,
                status: { $ne: BriefStatus.COMPLETED },
            },
            {
                $set: {
                    status: BriefStatus.PROCESSING,
                    processingStartedAt: now,
                    updatedAt: now,
                },
                $inc: {
                    attemptCount: 1,
                },
                $unset: {
                    result: '',
                    error: '',
                    completedAt: '',
                },
            },
            {
                returnDocument: 'after',
            },
        );

        if (claimedBrief) {
            return {
                kind: 'process',
                brief: claimedBrief,
            };
        }

        // O update não encontrou o registro. Precisamos diferenciar:
        // inexistente/outro tenant ou já concluído.
        const existingBrief = await collection().findOne(scope, {
            projection: {
                status: 1,
            },
        });

        if (!existingBrief) {
            throw new ProcessingError(
                'BRIEF_NOT_FOUND',
                'Brief não encontrado dentro do tenant.',
                false,
            );
        }

        if (existingBrief.status === BriefStatus.COMPLETED) {
            return {
                kind: 'alreadyCompleted',
            };
        }

        // Caso raro: o documento mudou entre as duas operações.
        throw new ProcessingError(
            'WORKER_INTERNAL_ERROR',
            'Não foi possível adquirir o brief para processamento.',
            true,
        );
    }

    async complete(
        briefId: string,
        tenantId: string,
        result: BriefAnalysisResult,
    ): Promise<boolean> {
        const scope = parseScope(briefId, tenantId);
        const now = new Date();

        const update = await collection().updateOne(
            {
                ...scope,
                status: BriefStatus.PROCESSING,
            },
            {
                $set: {
                    status: BriefStatus.COMPLETED,
                    result,
                    completedAt: now,
                    updatedAt: now,
                },
                $unset: {
                    error: '',
                },
            },
        );

        return update.modifiedCount === 1;
    }

    async prepareRetry(
        briefId: string,
        tenantId: string,
        error: BriefProcessingError,
    ): Promise<boolean> {
        const scope = parseScope(briefId, tenantId);
        const now = new Date();

        const update = await collection().updateOne(
            {
                ...scope,
                status: BriefStatus.PROCESSING,
            },
            {
                $set: {
                    status: BriefStatus.PENDING,
                    error: {
                        ...error,
                        retryable: true,
                    },
                    updatedAt: now,
                },
                $unset: {
                    result: '',
                    completedAt: '',
                },
            },
        );

        return update.modifiedCount === 1;
    }

    async fail(
        briefId: string,
        tenantId: string,
        error: BriefProcessingError,
    ): Promise<boolean> {
        const scope = parseScope(briefId, tenantId);
        const now = new Date();

        const update = await collection().updateOne(
            {
                ...scope,
                status: { $ne: BriefStatus.COMPLETED },
            },
            {
                $set: {
                    status: BriefStatus.FAILED,
                    error,
                    updatedAt: now,
                },
                $unset: {
                    result: '',
                    completedAt: '',
                },
            },
        );

        return update.modifiedCount === 1;
    }
}

export const briefRepository = new MongoBriefRepository();