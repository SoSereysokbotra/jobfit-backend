// src/modules/health/heartbeat.service.ts
//
// External heartbeat — a "dead man's switch" for Healthchecks.io (or any compatible ping
// service). It is TRIGGERED (not a background timer) by GET /health/heartbeat, which an
// external Cloud Scheduler job calls every minute. This design is deliberate: on Cloud Run
// the container scales to zero and CPU is throttled outside of requests, so an in-process
// setInterval would stop while the app is idle and cause false "down" alerts. Letting an
// always-on external scheduler drive the beat both wakes the container AND proves it serves.
//
// The beat is DB-aware: it runs a trivial `SELECT 1`. On success it pings the URL as normal;
// if the DB is unreachable it pings the `/fail` variant so the outage surfaces immediately.
// If the app is down entirely, the scheduler's call fails, no ping is sent, and Healthchecks.io
// alerts once the grace period elapses — the failure mode in-app alerting can never self-report.
//
// FAIL-OPEN: every path is wrapped and time-boxed — a heartbeat must never throw or block.
// Unset HEALTHCHECKS_PING_URL = the beat still reports DB status but sends no external ping.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@infra/prisma/prisma.service';

const PING_TIMEOUT_MS = 5000;

export interface HeartbeatResult {
  healthy: boolean;
  pinged: boolean;
}

@Injectable()
export class HeartbeatService {
  private readonly logger = new Logger(HeartbeatService.name);
  private readonly pingUrl?: string;

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.pingUrl = config.get<string>('app.healthchecksPingUrl');
  }

  /** One heartbeat: check the DB, then ping Healthchecks.io (success or /fail). Never throws. */
  async beat(): Promise<HeartbeatResult> {
    let healthy = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      healthy = false; // DB unreachable — report a failed heartbeat
    }

    if (!this.pingUrl) return { healthy, pinged: false };

    const url = healthy ? this.pingUrl : `${this.pingUrl.replace(/\/$/, '')}/fail`;
    try {
      await fetch(url, { method: 'POST', signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
      return { healthy, pinged: true };
    } catch (err) {
      // Fail-open: a missed ping is itself the signal Healthchecks.io reacts to.
      this.logger.warn(`Heartbeat ping failed (fail-open): ${(err as Error).message}`);
      return { healthy, pinged: false };
    }
  }
}
