import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from '@prometheus-io/client';
import { Injectable, OnModuleDestroy } from '@nestjs/common';

type HttpLabel = 'handler' | 'method' | 'status_code';

@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly registry = new Registry();
  private readonly httpRequests = new Counter<HttpLabel>({
    name: 'ai_brief_http_requests_total',
    help: 'Total de requisições HTTP processadas pela API.',
    labelNames: ['handler', 'method', 'status_code'],
    registers: [this.registry],
  });
  private readonly httpDuration = new Histogram<HttpLabel>({
    name: 'ai_brief_http_request_duration_seconds',
    help: 'Duração das requisições HTTP processadas pela API.',
    labelNames: ['handler', 'method', 'status_code'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });
  private readonly reconciledJobs = new Counter({
    name: 'ai_brief_reconciled_jobs_total',
    help: 'Total de briefs pendentes republicados pela reconciliação.',
    registers: [this.registry],
  });

  constructor() {
    this.registry.setDefaultLabels({ service: 'backend' });
    collectDefaultMetrics({ register: this.registry });
  }

  recordHttp(
    handler: string,
    method: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = {
      handler,
      method,
      status_code: String(statusCode),
    };
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, durationSeconds);
  }

  recordReconciledJobs(count: number): void {
    if (count > 0) this.reconciledJobs.inc(count);
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  onModuleDestroy(): void {
    this.registry.clear();
  }
}
