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

import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { DatabaseHealthIndicator } from './indicators/database.health-indicator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
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
}
