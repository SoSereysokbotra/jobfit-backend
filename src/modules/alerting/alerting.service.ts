// src/modules/alerting/alerting.service.ts
//
// Phase 4 — in-app alerting. Turns significant runtime signals into (a) a `system_events`
// row (the in-app incident ledger surfaced by GET /admin/system/alerts) and (b) a Slack
// alert. Two guard rails keep it quiet:
//   * DEDUP    — the same fingerprint alerts at most once per DEDUP_WINDOW (Redis).
//   * SUPPRESS — Slack is muted during a startup grace window (deploy noise) or a manual
//                `alert:suppressed` key; the ledger row is still written.
//
// Mapping decision: the SystemEventType enum has no generic "unhandled error" value (adding
// one would need a live schema migration), and per-error visibility already lives in GCP
// Error Reporting (Phase 2). So server errors map to the ledger semantically:
//   * DB/connection failures      -> DATABASE_ERROR   (critical, immediate)
//   * a burst of 5xx in a window  -> ERROR_RATE_HIGH  (once per window)
//
// FAIL-OPEN: every method swallows its own errors — alerting must never break a request or
// crash the process (guide §6 "monitoring the monitoring").

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  Prisma,
  SystemEventSeverity,
  SystemEventType,
} from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import {
  SlackNotifierService,
  type AlertSeverity,
} from '@modules/notification/slack-notifier.service';

const STARTUP_GRACE_MS = 60_000; // mute Slack for the first minute (deploy/boot noise)
const DEDUP_WINDOW_S = 300; // 5 min — one Slack per fingerprint per window
const ERROR_RATE_WINDOW_S = 300; // 5 min rolling window
const ERROR_RATE_THRESHOLD = 10; // 5xx count in-window that trips ERROR_RATE_HIGH

const KEY = {
  dedup: (fp: string) => `alert:dedup:${fp}`,
  errorRateCount: 'alert:errrate:count',
  suppressed: 'alert:suppressed',
};

export interface ServerErrorContext {
  error: unknown;
  statusCode: number;
  method: string;
  path: string;
  requestId?: string;
  userId?: string;
}

interface RaiseInput {
  eventType: SystemEventType;
  severity: SystemEventSeverity;
  slackSeverity: AlertSeverity;
  title: string;
  message: string;
  fingerprint: string;
  details?: Record<string, unknown>;
}

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);
  private readonly bootTime = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly slack: SlackNotifierService,
  ) {}

  /** Called by the global exception filter for every 5xx. Fire-and-forget, never throws. */
  async onServerError(ctx: ServerErrorContext): Promise<void> {
    try {
      if (this.isDbError(ctx.error)) {
        await this.raise({
          eventType: SystemEventType.DATABASE_ERROR,
          severity: SystemEventSeverity.CRITICAL,
          slackSeverity: 'critical',
          title: 'Database error',
          message: this.describe(ctx.error),
          fingerprint: this.fingerprint(ctx),
          details: this.detailsOf(ctx),
        });
      }
      await this.trackErrorRate(ctx);
    } catch (err) {
      this.logger.warn(
        `onServerError failed (fail-open): ${(err as Error).message}`,
      );
    }
  }

  /** Generic entry point for threshold sources (health/queue probes, schedulers, …). */
  async raiseAlert(input: RaiseInput): Promise<void> {
    try {
      await this.raise(input);
    } catch (err) {
      this.logger.warn(`raiseAlert failed (fail-open): ${(err as Error).message}`);
    }
  }

  // ── internals ───────────────────────────────────────────────────────────────

  private async trackErrorRate(ctx: ServerErrorContext): Promise<void> {
    let count = 1;
    try {
      count = await this.redis.incr(KEY.errorRateCount);
      if (count === 1) {
        await this.redis.expire(KEY.errorRateCount, ERROR_RATE_WINDOW_S);
      }
    } catch {
      return; // Redis down — can't measure a rate; skip (DB errors already alert directly).
    }

    if (count >= ERROR_RATE_THRESHOLD) {
      await this.raise({
        eventType: SystemEventType.ERROR_RATE_HIGH,
        severity: SystemEventSeverity.CRITICAL,
        slackSeverity: 'critical',
        title: 'High error rate',
        message: `${count} server errors in the last ${ERROR_RATE_WINDOW_S / 60} min`,
        fingerprint: 'error-rate-high',
        details: {
          count,
          windowSeconds: ERROR_RATE_WINDOW_S,
          lastPath: ctx.path,
          lastStatus: ctx.statusCode,
        },
      });
    }
  }

  private async raise(input: RaiseInput): Promise<void> {
    if (!(await this.claimFirstOccurrence(input.fingerprint))) {
      return; // deduped — already alerted this window
    }

    // 1) Persist to the in-app ledger (surfaced by GET /admin/system/alerts).
    try {
      await this.prisma.systemEvent.create({
        data: {
          eventType: input.eventType,
          severity: input.severity,
          message: input.message,
          details: (input.details ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      this.logger.warn(
        `system_events write failed: ${(err as Error).message}`,
      );
    }

    // 2) Slack — muted during the suppression window (ledger row already written).
    if (await this.isSuppressed()) {
      this.logger.debug(`Slack alert suppressed (grace/muted): ${input.title}`);
      return;
    }
    await this.slack.send({
      title: input.title,
      message: input.message,
      severity: input.slackSeverity,
      fields: input.details as Record<string, string | number | undefined>,
    });
  }

  /**
   * Returns true if this is the first occurrence of `fingerprint` in the dedup window.
   * Redis-backed; fails OPEN (returns true → send) so a Redis outage never silences alerts.
   */
  private async claimFirstOccurrence(fingerprint: string): Promise<boolean> {
    try {
      const key = KEY.dedup(fingerprint);
      if (await this.redis.exists(key)) return false;
      await this.redis.set(key, '1', DEDUP_WINDOW_S);
      return true;
    } catch {
      return true;
    }
  }

  private async isSuppressed(): Promise<boolean> {
    if (Date.now() - this.bootTime < STARTUP_GRACE_MS) return true;
    try {
      return await this.redis.exists(KEY.suppressed);
    } catch {
      return false;
    }
  }

  private isDbError(error: unknown): boolean {
    const name = error instanceof Error ? error.name : '';
    const msg = error instanceof Error ? error.message : String(error);
    return (
      /prisma/i.test(name) ||
      /(database|ECONNREFUSED|connection (refused|closed|terminated|reset)|too many connections|pool timeout|can't reach database)/i.test(
        msg,
      )
    );
  }

  private describe(error: unknown): string {
    if (error instanceof Error) return `${error.name}: ${error.message}`;
    return String(error);
  }

  private fingerprint(ctx: ServerErrorContext): string {
    const name = ctx.error instanceof Error ? ctx.error.name : 'Error';
    const firstFrame =
      ctx.error instanceof Error && ctx.error.stack
        ? (ctx.error.stack.split('\n')[1] ?? '').trim()
        : this.describe(ctx.error);
    return createHash('sha1')
      .update(`${name}|${firstFrame}|${ctx.path}`)
      .digest('hex')
      .slice(0, 16);
  }

  private detailsOf(ctx: ServerErrorContext): Record<string, unknown> {
    return {
      method: ctx.method,
      path: ctx.path,
      statusCode: ctx.statusCode,
      requestId: ctx.requestId,
      userId: ctx.userId,
    };
  }
}
