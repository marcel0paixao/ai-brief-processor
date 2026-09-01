import { Queue } from 'bullmq';
import {
  ANALYZE_BRIEF_JOB,
  AnalyzeBriefJobData,
} from './briefs-queue.constants';
import { BriefsQueueService } from './briefs-queue.service';

describe('BriefsQueueService', () => {
  const remove = jest.fn();
  const add = jest.fn();
  const queue = { remove, add } as unknown as Queue<AnalyzeBriefJobData>;
  const service = new BriefsQueueService(queue);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes the terminal job before adding a retry with the same ID', async () => {
    remove.mockResolvedValue(1);
    add.mockResolvedValue(undefined);

    await service.retryAnalysis('brief-1', 'tenant-1');

    expect(remove).toHaveBeenCalledWith('brief-1');
    expect(add).toHaveBeenCalledWith(
      ANALYZE_BRIEF_JOB,
      { briefId: 'brief-1', tenantId: 'tenant-1' },
      { jobId: 'brief-1' },
    );
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(
      add.mock.invocationCallOrder[0],
    );
  });
});
