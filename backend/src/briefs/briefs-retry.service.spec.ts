import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { BriefAnalysisOutcome, UserRole } from '@ai-brief/shared';
import { Model, Types } from 'mongoose';
import { BriefsQueueService } from './queue/briefs-queue.service';
import { BriefsService } from './briefs.service';
import { Brief, BriefStatus } from './schemas/brief.schema';

const tenantId = new Types.ObjectId();
const briefId = new Types.ObjectId();
const currentUser = {
  id: new Types.ObjectId().toString(),
  name: 'Admin User',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
  tenantId: tenantId.toString(),
  tenantName: 'Example Tenant',
  tenantSlug: 'example-tenant',
};

const failedBrief = {
  _id: briefId,
  tenantId,
  title: 'Campanha',
  brief: 'Briefing com conteúdo suficiente para processamento.',
  status: BriefStatus.FAILED,
  attemptCount: 3,
  error: {
    code: 'LLM_TIMEOUT',
    message: 'O provider ultrapassou o tempo limite.',
    retryable: true,
  },
  createdAt: new Date('2026-08-31T10:00:00.000Z'),
  updatedAt: new Date('2026-08-31T10:01:00.000Z'),
};

describe('BriefsService retry', () => {
  const findExec = jest.fn();
  const findOne = jest.fn(() => ({ exec: findExec }));
  const findOneAndUpdateExec = jest.fn();
  const findOneAndUpdate = jest.fn(
    (filter: unknown, update: unknown, options: unknown) => {
      void filter;
      void update;
      void options;
      return { exec: findOneAndUpdateExec };
    },
  );
  const updateExec = jest.fn();
  const updateOne = jest.fn(() => ({ exec: updateExec }));
  const retryAnalysis = jest.fn();
  const briefModel = {
    findOne,
    findOneAndUpdate,
    updateOne,
  } as unknown as Model<Brief>;
  const queueService = {
    retryAnalysis,
  } as unknown as BriefsQueueService;
  const service = new BriefsService(briefModel, queueService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('moves a retryable failure to pending and republishes the stable job ID', async () => {
    const pendingBrief = {
      ...failedBrief,
      status: BriefStatus.PENDING,
      error: undefined,
      processingStartedAt: undefined,
      completedAt: undefined,
      updatedAt: new Date('2026-08-31T10:02:00.000Z'),
    };
    findExec.mockResolvedValue(failedBrief);
    findOneAndUpdateExec.mockResolvedValue(pendingBrief);
    retryAnalysis.mockResolvedValue(undefined);

    await expect(
      service.retry(briefId.toString(), currentUser),
    ).resolves.toMatchObject({
      id: briefId.toString(),
      status: BriefStatus.PENDING,
      attemptCount: 3,
      error: undefined,
    });

    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    const typedUpdate = update as {
      $set: { status: BriefStatus; updatedAt: Date };
      $unset: Record<string, string>;
    };
    expect(filter).toEqual({
      _id: briefId,
      tenantId,
      status: BriefStatus.FAILED,
      'error.retryable': true,
    });
    expect(typedUpdate.$set.status).toBe(BriefStatus.PENDING);
    expect(typedUpdate.$set.updatedAt).toBeInstanceOf(Date);
    expect(typedUpdate.$unset).toEqual({
      error: '',
      result: '',
      processingStartedAt: '',
      completedAt: '',
    });
    expect(options).toEqual({ returnDocument: 'after' });
    expect(retryAnalysis).toHaveBeenCalledWith(
      briefId.toString(),
      tenantId.toString(),
    );
  });

  it('rejects a non-retryable failure without touching the queue', async () => {
    findExec.mockResolvedValue({
      ...failedBrief,
      error: { ...failedBrief.error, retryable: false },
    });

    await expect(
      service.retry(briefId.toString(), currentUser),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(retryAnalysis).not.toHaveBeenCalled();
  });

  it('reprocesses a completed insufficient brief after it is complemented', async () => {
    const insufficientBrief = {
      ...failedBrief,
      status: BriefStatus.COMPLETED,
      error: undefined,
      result: {
        outcome: BriefAnalysisOutcome.INSUFFICIENT_BRIEF,
        reason: 'O briefing precisa de mais contexto para ser analisado.',
        missingInformation: ['Objetivo esperado para a análise'],
      },
      completedAt: new Date('2026-08-31T10:02:00.000Z'),
    };
    const pendingBrief = {
      ...insufficientBrief,
      status: BriefStatus.PENDING,
      result: undefined,
      processingStartedAt: undefined,
      completedAt: undefined,
    };
    findExec.mockResolvedValue(insufficientBrief);
    findOneAndUpdateExec.mockResolvedValue(pendingBrief);
    retryAnalysis.mockResolvedValue(undefined);

    await expect(
      service.retry(briefId.toString(), currentUser),
    ).resolves.toMatchObject({
      id: briefId.toString(),
      status: BriefStatus.PENDING,
      result: undefined,
    });

    const [filter] = findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({
      _id: briefId,
      tenantId,
      status: BriefStatus.COMPLETED,
      'result.outcome': BriefAnalysisOutcome.INSUFFICIENT_BRIEF,
    });
    expect(retryAnalysis).toHaveBeenCalledWith(
      briefId.toString(),
      tenantId.toString(),
    );
  });

  it('returns the brief to failed if republishing is unavailable', async () => {
    const pendingBrief = {
      ...failedBrief,
      status: BriefStatus.PENDING,
      error: undefined,
    };
    findExec.mockResolvedValue(failedBrief);
    findOneAndUpdateExec.mockResolvedValue(pendingBrief);
    retryAnalysis.mockRejectedValue(new Error('Redis unavailable'));
    updateExec.mockResolvedValue({ modifiedCount: 1 });

    await expect(
      service.retry(briefId.toString(), currentUser),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: briefId, tenantId, status: BriefStatus.PENDING },
      {
        $set: {
          status: BriefStatus.FAILED,
          error: {
            code: 'QUEUE_UNAVAILABLE',
            message: 'The brief could not be scheduled for processing.',
            retryable: true,
          },
        },
      },
    );
  });
});
