import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MetricsService } from '../observability/metrics.service';
import { BriefsQueueService } from './queue/briefs-queue.service';
import { Brief, BriefStatus } from './schemas/brief.schema';

const MIN_PENDING_AGE_MS = 30_000;

@Injectable()
export class BriefReconciliationService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(BriefReconciliationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectModel(Brief.name) private readonly briefModel: Model<Brief>,
    private readonly queue: BriefsQueueService,
    private readonly metrics: MetricsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = Number(
      this.config.get<string>('BRIEF_RECONCILIATION_INTERVAL_MS') ?? 60_000,
    );

    this.timer = setInterval(() => void this.reconcile(), intervalMs);
    this.timer.unref();
    void this.reconcile();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async reconcile(): Promise<number> {
    if (this.running) return 0;
    this.running = true;

    try {
      const staleBefore = new Date(Date.now() - MIN_PENDING_AGE_MS);
      const pendingBriefs = await this.briefModel
        .find({
          status: BriefStatus.PENDING,
          updatedAt: { $lte: staleBefore },
        })
        .select({ _id: 1, tenantId: 1 })
        .limit(100)
        .exec();
      let restored = 0;

      for (const brief of pendingBriefs) {
        const added = await this.queue.ensureAnalysis(
          brief._id.toString(),
          brief.tenantId.toString(),
        );
        if (added) restored += 1;
      }

      if (restored > 0) {
        this.metrics.recordReconciledJobs(restored);
        this.logger.warn(`Reconciled ${restored} pending brief job(s)`);
      }

      return restored;
    } catch (error) {
      const normalized =
        error instanceof Error
          ? error
          : new Error('Unknown reconciliation error');
      this.logger.error('Brief reconciliation failed', normalized.stack);
      return 0;
    } finally {
      this.running = false;
    }
  }
}
