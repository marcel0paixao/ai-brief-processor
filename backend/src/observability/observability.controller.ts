import {
  Controller,
  Get,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ConnectionStates, type Connection } from 'mongoose';
import { Public } from '../auth/decorators/public.decorator';
import { MetricsService } from './metrics.service';

@Controller()
@Public()
@SkipThrottle()
export class ObservabilityController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly metrics: MetricsService,
  ) {}

  @Get('health')
  health(): { status: 'ok'; mongo: 'up' } {
    if (this.connection.readyState !== ConnectionStates.connected) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        mongo: 'down',
      });
    }

    return { status: 'ok', mongo: 'up' };
  }

  @Get('metrics')
  async renderMetrics(@Res() response: Response): Promise<void> {
    response.setHeader('Content-Type', this.metrics.contentType);
    response.send(await this.metrics.render());
  }
}
