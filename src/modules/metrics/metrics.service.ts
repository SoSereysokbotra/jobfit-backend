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
//   * jobfit_ai_calls_total          (Counter:   operation, outcome) — GPU/paid-API load
//   * jobfit_ai_call_duration_seconds (Histogram: operation)
//
// ON "COUNT LLM CALLS PER USER" (MENTOR_REVIEW_2026-08-18 §11). Deliberately NOT a label.
// `userId` is unbounded cardinality, and a Prometheus counter with one series per user is
// how you take down your own monitoring — the metric that tells you about the cost problem
// must not become a bigger cost problem. The per-user question is answered two other ways:
// the throttler now imposes a hard per-account ceiling (throttler.config.ts documents the
// arithmetic), and 429s show up here as http_requests_total{status_code="429"}. If a real
// per-user breakdown is ever needed, it belongs in structured logs, which are queryable
// after the fact and cost nothing to keep wide.

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

/**
 * `operation` is the AI service path ('/embed', '/job/requirements', …) — a small fixed
 * set, so the cardinality is bounded. `outcome` separates a model that answered from one
 * that failed, because a spike in failures and a spike in load look identical on a plain
 * request count, and only one of them is a cost problem.
 */
export interface AiMetricLabels {
  operation: string;
  outcome: 'success' | 'error';
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  readonly registry = new Registry();
  readonly enabled: boolean;

  readonly httpDuration: Histogram<keyof HttpMetricLabels>;
  readonly httpTotal: Counter<keyof HttpMetricLabels>;

  readonly aiCallsTotal: Counter<keyof AiMetricLabels>;
  readonly aiCallDuration: Histogram<'operation'>;

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

    this.aiCallsTotal = new Counter({
      name: 'jobfit_ai_calls_total',
      help: 'Calls to the AI service, by operation and outcome',
      labelNames: ['operation', 'outcome'],
      registers: [this.registry],
    });

    // Buckets run to 60s: generation and résumé parsing are tens of seconds by design,
    // so the default web-request buckets would pile every real call into +Inf and tell
    // you nothing about which model is slow.
    this.aiCallDuration = new Histogram({
      name: 'jobfit_ai_call_duration_seconds',
      help: 'AI service call duration in seconds',
      labelNames: ['operation'],
      buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 40, 60],
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

  /**
   * One call to the AI service. Called from AiClient's transport, so it counts RETRIES
   * as separate calls — which is right: a retried call costs a second inference.
   */
  observeAiCall(labels: AiMetricLabels, durationSeconds: number): void {
    this.aiCallsTotal.inc(labels);
    this.aiCallDuration.observe({ operation: labels.operation }, durationSeconds);
  }

  scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
