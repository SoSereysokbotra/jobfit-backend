// src/modules/health/indicators/redis.health-indicator.spec.ts
//
// Soft/fail-open readiness reporting, plus Redis audit R9: `isQueueHealthy()` used to
// PING RedisService and report `processing: 'available'` on the strength of it. BullMQ
// holds a SEPARATE ioredis client with its own connection state, so `/health/ready` could
// call the queue healthy while every upload hung. The tests below are mostly about that
// one case — Redis up, BullMQ down — because it is the case the old code got wrong and
// the only one a single-connection check cannot see.

import { HealthIndicatorService } from '@nestjs/terminus';
import { RedisService } from '@shared/services/redis.service';
import { BullQueueService } from '@infra/queue/bull-queue.service';
import { RedisHealthIndicator } from './redis.health-indicator';

const makeHealthIndicatorService = () =>
  ({
    check: (key: string) => ({
      up: (data?: Record<string, unknown>) => ({
        [key]: { status: 'up', ...data },
      }),
      down: (data?: Record<string, unknown>) => ({
        [key]: { status: 'down', ...data },
      }),
    }),
  }) as unknown as HealthIndicatorService;

const makeRedis = (ping: () => Promise<string>) =>
  ({ raw: { ping } }) as unknown as RedisService;

const makeQueue = (reachable: boolean) =>
  ({
    isReachable: () => Promise.resolve(reachable),
  }) as unknown as BullQueueService;

const PONG = () => Promise.resolve('PONG');
const REFUSED = () => Promise.reject(new Error('Connection is closed.'));

const indicatorWith = (
  ping: () => Promise<string>,
  queueReachable: boolean,
): RedisHealthIndicator =>
  new RedisHealthIndicator(
    makeRedis(ping),
    makeQueue(queueReachable),
    makeHealthIndicatorService(),
  );

describe('RedisHealthIndicator (soft / never fails readiness)', () => {
  describe('isHealthy', () => {
    it('reports up + connection up when Redis responds PONG', async () => {
      const result = await indicatorWith(PONG, true).isHealthy('redis');

      expect(result.redis.status).toBe('up');
      expect(result.redis.connection).toBe('up');
    });

    it('stays up but degraded when Redis is unreachable', async () => {
      const result = await indicatorWith(REFUSED, false).isHealthy('redis');

      // Critical: soft dependency — must NOT be 'down', or Cloud Run would refuse traffic.
      expect(result.redis.status).toBe('up');
      expect(result.redis.connection).toBe('down');
      expect(result.redis.degraded).toBe(true);
    });
  });

  describe('isQueueHealthy (R9)', () => {
    it('is available only when BOTH connections answer', async () => {
      const result = await indicatorWith(PONG, true).isQueueHealthy('queue');

      expect(result.queue.status).toBe('up');
      expect(result.queue.processing).toBe('available');
    });

    it('reports unavailable when BullMQ is down even though Redis pings fine', async () => {
      // THE FINDING. The old check pinged RedisService only, so this exact state — the
      // one where an upload hangs — was reported as `processing: 'available'`.
      const result = await indicatorWith(PONG, false).isQueueHealthy('queue');

      expect(result.queue.processing).toBe('unavailable');
      expect(result.queue.degraded).toBe(true);
      expect(result.queue.connection).toBe('bullmq-down');
      expect(result.queue.message).toContain('BullMQ');
    });

    it('names the Redis half when that is the one that is down', async () => {
      const result = await indicatorWith(REFUSED, true).isQueueHealthy('queue');

      expect(result.queue.processing).toBe('unavailable');
      expect(result.queue.connection).toBe('redis-down');
    });

    it('reports both down without failing readiness', async () => {
      const result = await indicatorWith(REFUSED, false).isQueueHealthy('queue');

      expect(result.queue.status).toBe('up'); // still soft
      expect(result.queue.processing).toBe('unavailable');
      expect(result.queue.connection).toBe('down');
    });

    it('does not let a Redis ping rejection escape as an unhandled failure', async () => {
      // The Redis half is raced and mapped to a boolean; a rejection must become a
      // report, not a thrown probe.
      await expect(
        indicatorWith(REFUSED, true).isQueueHealthy('queue'),
      ).resolves.toBeDefined();
    });
  });
});
