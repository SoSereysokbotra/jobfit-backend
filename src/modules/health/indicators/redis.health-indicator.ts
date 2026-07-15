// src/modules/health/indicators/redis.health-indicator.ts
//
// Phase 3 — readiness SOFT dependencies (Redis + the Redis-backed BullMQ queue).
//
// DESIGN: Redis is fail-open across this app (lockout/blacklist/cache degrade gracefully
// when it is down — it is often not even running locally). So these indicators must NEVER
// mark readiness `down` — that would make Cloud Run refuse traffic over an optional
// dependency. They always report `up`, but annotate `connection: 'down', degraded: true`
// when unreachable, so the readiness payload still surfaces the degradation.

import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import { RedisService } from '@shared/services/redis.service';

const PING_TIMEOUT_MS = 1000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ]);
}

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly redis: RedisService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  /** Ping Redis; always `up` (soft), annotated with real connection state. */
  async isHealthy(key = 'redis'): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const pong = await withTimeout(this.redis.raw.ping(), PING_TIMEOUT_MS);
      return indicator.up({ connection: pong === 'PONG' ? 'up' : 'unknown' });
    } catch (err) {
      // Soft: report degraded but keep readiness green (fail-open).
      return indicator.up({
        connection: 'down',
        degraded: true,
        message: (err as Error).message,
      });
    }
  }

  /**
   * Background-job queue readiness. BullMQ is Redis-backed, so queue processing is
   * available iff Redis is reachable. Soft, same as above.
   */
  async isQueueHealthy(key = 'queue'): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      await withTimeout(this.redis.raw.ping(), PING_TIMEOUT_MS);
      return indicator.up({ backend: 'redis', processing: 'available' });
    } catch (err) {
      return indicator.up({
        backend: 'redis',
        processing: 'unavailable',
        degraded: true,
        message: (err as Error).message,
      });
    }
  }
}
