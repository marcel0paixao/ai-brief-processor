import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  ANALYZE_BRIEF_JOB,
  AnalyzeBriefJobData,
  BRIEF_ANALYSIS_QUEUE,
} from './briefs-queue.constants';

@Injectable()
export class BriefsQueueService {
  constructor(
    @InjectQueue(BRIEF_ANALYSIS_QUEUE)
    private readonly queue: Queue<AnalyzeBriefJobData>,
  ) {}

  async enqueueAnalysis(briefId: string): Promise<void> {
    await this.queue.add(
      ANALYZE_BRIEF_JOB,
      { briefId },
      {
        jobId: briefId,
      },
    );
  }
}
