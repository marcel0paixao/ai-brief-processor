import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ObservabilityModule } from '../observability/observability.module';
import { BriefReconciliationService } from './brief-reconciliation.service';
import { BriefsController } from './briefs.controller';
import { BriefsService } from './briefs.service';
import {
  BRIEF_ANALYSIS_QUEUE,
  BRIEF_QUEUE_CONFIG,
} from './queue/briefs-queue.constants';
import { BriefsQueueService } from './queue/briefs-queue.service';
import { Brief, BriefSchema } from './schemas/brief.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Brief.name, schema: BriefSchema }]),
    BullModule.registerQueue({
      name: BRIEF_ANALYSIS_QUEUE,
      configKey: BRIEF_QUEUE_CONFIG,
    }),
    ObservabilityModule,
  ],
  controllers: [BriefsController],
  providers: [BriefsService, BriefsQueueService, BriefReconciliationService],
})
export class BriefsModule {}
