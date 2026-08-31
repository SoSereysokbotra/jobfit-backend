// src/modules/health/indicators/redis.health-indicator.ts
//
// Phase 3 — readiness SOFT dependencies (Redis + the Redis-backed BullMQ queue).
//
// DESIGN: the Redis-backed features degrade rather than fail when it is down
// (lockout/blacklist/cache — it is often not even running locally). So these indicators
// must NEVER mark readiness `down` — that would make Cloud Run refuse traffic over an
// optional dependency. They always report `up`, but annotate `connection: 'down',
// degraded: true` when unreachable, so the readiness payload still surfaces it.
//
// THE QUEUE IS CHECKED THROUGH BULLMQ, NOT THROUGH REDIS (Redis audit R9). BullMQ holds
// its own ioredis client with its own connection state, so a RedisService PING said
// nothing about whether an upload would be picked up. `/health/ready` could report
// `processing: 'available'` while every enqueue was hanging. Both are checked now, and
// the payload names which one is down — they fail independently, and "Redis is up but
// the queue is not" is a real state worth being able to read off a probe.

import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import { RedisService } from '@shared/services/redis.service';
import { BullQueueService } from '@infra/queue/bull-queue.service';

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
    private readonly queue: BullQueueService,
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
   * Background-job queue readiness. Soft, same as above.
   *
   * Both connections are checked, because the queue is only usable when BOTH answer and
   * they are genuinely separate clients. `processing` is the honest verdict: available
   * only when the client that actually enqueues work says so.
   */
  async isQueueHealthy(key = 'queue'): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    // isReachable() never throws and is bounded internally; the Redis half is raced here
    // as before. Run together — a readiness probe should not pay for them in series.
    const [redisUp, bullmqUp] = await Promise.all([
      withTimeout(this.redis.raw.ping(), PING_TIMEOUT_MS).then(
        () => true,
        () => false,
      ),
      this.queue.isReachable(),
    ]);

    if (redisUp && bullmqUp) {
      return indicator.up({
        backend: 'redis',
        processing: 'available',
        connection: 'up',
      });
    }

    return indicator.up({
      backend: 'redis',
      processing: 'unavailable',
      degraded: true,
      // Which half failed, because they fail independently and the answer changes what
      // you go and look at.
      connection: redisUp ? 'bullmq-down' : bullmqUp ? 'redis-down' : 'down',
      message: bullmqUp
        ? 'Redis did not answer a ping.'
        : "BullMQ's connection did not answer; enqueued work would not be picked up.",
    });
  }
}
