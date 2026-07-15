// src/modules/metrics/metrics.service.ts
//
// Phase 3 — Prometheus metrics, scraped into Cloud Monitoring (via the Ops/OTel agent or
// Google Managed Prometheus). Uses a DEDICATED Registry (not the global default) so it is
// safe to instantiate more than once (tests) without "metric already registered" errors.
//
// Exposed:
//   * default process metrics (cpu, memory, event-loop lag, gc, ...)
//   * http_request_duration_seconds  (Histogram: method, route, status_code)
//   * http_requests_total            (Counter:   method, route, status_code) — error rate
//     is derived from status_code>=500
//   * jobfit_resume_parsing_pending  (Gauge, collected on scrape) — background-queue backlog
//     proxy (resumes awaiting parsing)

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResumeParsingStatus } from '@prisma/client';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';
import { PrismaService } from '@infra/prisma/prisma.service';

export interface HttpMetricLabels {
  method: string;
  route: string;
  status_code: string;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  readonly registry = new Registry();
  readonly enabled: boolean;

  readonly httpDuration: Histogram<keyof HttpMetricLabels>;
  readonly httpTotal: Counter<keyof HttpMetricLabels>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.enabled = this.config.get<boolean>('app.metricsEnabled', true);

    collectDefaultMetrics({ register: this.registry });

    this.httpDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.httpTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    // Collected lazily at scrape time. Guarded — a DB hiccup must not fail the scrape.
    new Gauge({
      name: 'jobfit_resume_parsing_pending',
      help: 'Resumes pending/processing parsing (background-queue backlog proxy)',
      registers: [this.registry],
      collect: async () => {
        const gauge = this.registry.getSingleMetric(
          'jobfit_resume_parsing_pending',
        ) as Gauge<string> | undefined;
        try {
          const pending = await this.prisma.resume.count({
            where: {
              parsingStatus: {
                in: [ResumeParsingStatus.PENDING, ResumeParsingStatus.PROCESSING],
              },
            },
          });
          gauge?.set(pending);
        } catch (err) {
          this.logger.warn(
            `Backlog gauge collect failed: ${(err as Error).message}`,
          );
        }
      },
    });
  }

  observeHttp(labels: HttpMetricLabels, durationSeconds: number): void {
    this.httpDuration.observe(labels, durationSeconds);
    this.httpTotal.inc(labels);
  }

  scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
