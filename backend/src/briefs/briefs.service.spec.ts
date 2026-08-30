import { ServiceUnavailableException } from '@nestjs/common';
import { UserRole } from '@ai-brief/shared';
import { Model, Types } from 'mongoose';
import { BriefsQueueService } from './queue/briefs-queue.service';
import { BriefsService } from './briefs.service';
import { Brief, BriefStatus } from './schemas/brief.schema';

const validInput = {
  title: 'Product launch campaign',
  brief: 'We need to introduce the new product to small business owners.',
};

const tenantId = new Types.ObjectId();
const userId = new Types.ObjectId();
const currentUser = {
  id: userId.toString(),
  name: 'Admin User',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
  tenantId: tenantId.toString(),
  tenantName: 'Example Tenant',
  tenantSlug: 'example-tenant',
};

describe('BriefsService', () => {
  const create = jest.fn();
  const updateExec = jest.fn();
  const updateOne = jest.fn(() => ({ exec: updateExec }));
  const enqueueAnalysis = jest.fn();
  const briefModel = {
    create,
    updateOne,
  } as unknown as Model<Brief>;
  const queueService = {
    enqueueAnalysis,
  } as unknown as BriefsQueueService;
  const service = new BriefsService(briefModel, queueService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists and enqueues a pending brief', async () => {
    const briefId = new Types.ObjectId();
    create.mockResolvedValue({
      _id: briefId,
      status: BriefStatus.PENDING,
    });
    enqueueAnalysis.mockResolvedValue(undefined);

    await expect(service.create(validInput, currentUser)).resolves.toEqual({
      id: briefId.toString(),
      status: BriefStatus.PENDING,
    });
    expect(create).toHaveBeenCalledWith({
      ...validInput,
      tenantId,
      createdBy: userId,
      status: BriefStatus.PENDING,
    });
    expect(enqueueAnalysis).toHaveBeenCalledWith(
      briefId.toString(),
      tenantId.toString(),
    );
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('marks the brief as failed when enqueueing fails', async () => {
    const briefId = new Types.ObjectId();
    create.mockResolvedValue({
      _id: briefId,
      status: BriefStatus.PENDING,
    });
    enqueueAnalysis.mockRejectedValue(new Error('Redis unavailable'));
    updateExec.mockResolvedValue({ matchedCount: 1 });

    const creation = service.create(validInput, currentUser);

    await expect(creation).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: briefId, tenantId },
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
    expect(updateExec).toHaveBeenCalledTimes(1);
  });
});
