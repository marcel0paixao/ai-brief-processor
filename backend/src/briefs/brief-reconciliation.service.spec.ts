import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { MetricsService } from '../observability/metrics.service';
import { BriefReconciliationService } from './brief-reconciliation.service';
import { BriefsQueueService } from './queue/briefs-queue.service';
import { Brief } from './schemas/brief.schema';

describe('BriefReconciliationService', () => {
  it('republica somente jobs ausentes e registra a quantidade', async () => {
    const tenantId = new Types.ObjectId();
    const pendingBriefs = [new Types.ObjectId(), new Types.ObjectId()].map(
      (_id) => ({ _id, tenantId }),
    );
    const exec = jest.fn().mockResolvedValue(pendingBriefs);
    const limit = jest.fn().mockReturnValue({ exec });
    const select = jest.fn().mockReturnValue({ limit });
    const find = jest.fn().mockReturnValue({ select });
    const ensureAnalysis = jest
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const recordReconciledJobs = jest.fn();
    const service = new BriefReconciliationService(
      { find } as unknown as Model<Brief>,
      { ensureAnalysis } as unknown as BriefsQueueService,
      { recordReconciledJobs } as unknown as MetricsService,
      { get: jest.fn() } as unknown as ConfigService,
    );

    await expect(service.reconcile()).resolves.toBe(1);
    expect(ensureAnalysis).toHaveBeenCalledTimes(2);
    expect(recordReconciledJobs).toHaveBeenCalledWith(1);
  });
});
