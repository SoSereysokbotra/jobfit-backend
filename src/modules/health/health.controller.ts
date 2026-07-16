// src/modules/health/health.controller.ts
//
// Phase 3 — Kubernetes/Cloud Run-style health probes.
//   GET /health/live  — liveness: is the process up? (no external deps; never fails on a
//                       dependency outage — used by Cloud Run liveness/startup probes so a
//                       transient DB/Redis blip doesn't kill the container).
//   GET /health/ready — readiness: should this instance receive traffic? HARD-gates on the
//                       database (503 if down); Redis + queue are soft (degraded, still 200).
//
// Both are @Public() (no JWT) so probes and the load balancer can reach them.

import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { DatabaseHealthIndicator } from './indicators/database.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';
import { HeartbeatService } from './heartbeat.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly heartbeat: HeartbeatService,
  ) {}

  @Get('live')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness probe — process is up (no dependency checks)' })
  liveness() {
    // Empty check set = always healthy while the event loop responds.
    return this.health.check([]);
  }

  @Get('ready')
  @Public()
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe — DB hard-gated (503 if down); Redis/queue soft (degraded)',
  })
  readiness() {
    return this.health.check([
      () => this.db.isHealthy('database'),
      () => this.redis.isHealthy('redis'),
      () => this.redis.isQueueHealthy('queue'),
    ]);
  }

  @Get('heartbeat')
  @Public()
  @ApiOperation({
    summary:
      'External heartbeat — checks the DB and pings Healthchecks.io. Triggered every minute ' +
      'by Cloud Scheduler (Cloud Run scales to zero, so a background timer is unreliable). ' +
      'Returns 200 when healthy, 503 when the DB is down (a /fail ping is still sent).',
  })
  async heartbeatPing() {
    const result = await this.heartbeat.beat();
    if (!result.healthy) {
      // Surface as 503 so the beat also shows up as a failure in Cloud Scheduler/logs.
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
        pinged: result.pinged,
      });
    }
    return { status: 'ok', database: 'up', pinged: result.pinged };
  }
}
