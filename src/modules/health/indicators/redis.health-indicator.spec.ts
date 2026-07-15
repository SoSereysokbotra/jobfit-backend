import { HealthIndicatorService } from '@nestjs/terminus';
import { RedisService } from '@shared/services/redis.service';
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

describe('RedisHealthIndicator (soft / fail-open)', () => {
  it('reports up + connection up when Redis responds PONG', async () => {
    const indicator = new RedisHealthIndicator(
      makeRedis(() => Promise.resolve('PONG')),
      makeHealthIndicatorService(),
    );

    const result = await indicator.isHealthy('redis');

    expect(result.redis.status).toBe('up');
    expect(result.redis.connection).toBe('up');
  });

  it('stays up but degraded when Redis is unreachable (never fails readiness)', async () => {
    const indicator = new RedisHealthIndicator(
      makeRedis(() => Promise.reject(new Error('Connection is closed.'))),
      makeHealthIndicatorService(),
    );

    const result = await indicator.isHealthy('redis');

    // Critical: soft dependency — must NOT be 'down', or Cloud Run would refuse traffic.
    expect(result.redis.status).toBe('up');
    expect(result.redis.connection).toBe('down');
    expect(result.redis.degraded).toBe(true);
  });

  it('queue readiness is Redis-derived and also soft', async () => {
    const up = new RedisHealthIndicator(
      makeRedis(() => Promise.resolve('PONG')),
      makeHealthIndicatorService(),
    );
    const down = new RedisHealthIndicator(
      makeRedis(() => Promise.reject(new Error('down'))),
      makeHealthIndicatorService(),
    );

    expect((await up.isQueueHealthy('queue')).queue.processing).toBe('available');
    const degraded = await down.isQueueHealthy('queue');
    expect(degraded.queue.status).toBe('up');
    expect(degraded.queue.processing).toBe('unavailable');
  });
});
