import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  ANALYZE_BRIEF_JOB,
  AnalyzeBriefJobData,
  BRIEF_ANALYSIS_QUEUE,
} from './briefs-queue.constants';

@Injectable()
export class BriefsQueueService {
  private readonly logger = new Logger(BriefsQueueService.name);

  constructor(
    @InjectQueue(BRIEF_ANALYSIS_QUEUE)
    private readonly queue: Queue<AnalyzeBriefJobData>,
  ) {}

  async enqueueAnalysis(briefId: string, tenantId: string): Promise<void> {
    await this.queue.add(
      ANALYZE_BRIEF_JOB,
      { briefId, tenantId },
      { jobId: briefId },
    );

    this.logger.log(
      `Brief analysis job queued jobId=${briefId} briefId=${briefId} tenantId=${tenantId}`,
    );
  }

  async retryAnalysis(briefId: string, tenantId: string): Promise<void> {
    // BullMQ keeps terminal jobs by default. Remove the previous job so the
    // stable jobId can be reused without creating duplicate IDs.
    await this.queue.remove(briefId);
    this.logger.log(
      `Previous brief analysis job removed for retry jobId=${briefId} briefId=${briefId} tenantId=${tenantId}`,
    );
    await this.enqueueAnalysis(briefId, tenantId);
  }
}
