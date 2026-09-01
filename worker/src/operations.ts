import { Counter, Histogram, Registry, collectDefaultMetrics } from '@prometheus-io/client';
import { createServer, type Server } from 'node:http';

type JobLabel = 'error_code' | 'outcome';

export class WorkerOperations {
  private readonly registry = new Registry();
  private readonly jobs = new Counter<JobLabel>({
    name: 'ai_brief_worker_jobs_total',
    help: 'Total de tentativas processadas pelo worker.',
    labelNames: ['outcome', 'error_code'],
    registers: [this.registry],
  });
  private readonly duration = new Histogram({
    name: 'ai_brief_worker_job_duration_seconds',
    help: 'Duração dos jobs concluídos pelo worker.',
    buckets: [0.5, 1, 2.5, 5, 10, 20, 30, 60],
    registers: [this.registry],
  });
  private readonly stalled = new Counter({
    name: 'ai_brief_worker_stalled_jobs_total',
    help: 'Total de jobs identificados como stalled.',
    registers: [this.registry],
  });
  private server?: Server;

  constructor(
    private readonly port: number,
    private readonly isHealthy: () => boolean,
  ) {
    this.registry.setDefaultLabels({ service: 'worker' });
    collectDefaultMetrics({ register: this.registry });
  }

  recordCompleted(durationMs?: number): void {
    this.jobs.inc({ outcome: 'completed', error_code: 'none' });
    if (durationMs !== undefined) this.duration.observe(durationMs / 1_000);
  }

  recordFailed(errorCode: string, willRetry: boolean): void {
    this.jobs.inc({
      outcome: willRetry ? 'retry' : 'failed',
      error_code: errorCode,
    });
  }

  recordStalled(): void {
    this.stalled.inc();
  }

  start(): Promise<void> {
    this.server = createServer(async (request, response) => {
      const path = request.url?.split('?')[0];

      if (request.method === 'GET' && path === '/health') {
        const healthy = this.isHealthy();
        response.writeHead(healthy ? 200 : 503, {
          'Content-Type': 'application/json; charset=utf-8',
        });
        response.end(JSON.stringify({ status: healthy ? 'ok' : 'degraded' }));
        return;
      }

      if (request.method === 'GET' && path === '/metrics') {
        response.writeHead(200, { 'Content-Type': this.registry.contentType });
        response.end(await this.registry.metrics());
        return;
      }

      response.writeHead(404).end();
    });

    return new Promise((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.port, '0.0.0.0', () => resolve());
    });
  }

  close(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.registry.clear();
    if (!server) return Promise.resolve();

    return new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
