// src/shared/services/redis.service.spec.ts
//
// Reconnection behaviour (Redis audit R4). The bug was one word: `retryStrategy` returned
// `null` after 10 attempts, which is ioredis's "stop retrying, permanently" signal. After
// ~20 seconds of downtime the client was dead for the process lifetime — Redis could come
// back and this service would never notice, so every Redis-backed feature stayed degraded
// until someone redeployed.
//
// The mutation these tests exist to catch is a re-introduced ceiling: any strategy that
// can answer `null`, or any finite attempt cap, fails here.

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService, reconnectDelayMs } from './redis.service';

// ioredis is a CJS module that is its own default export, so an automock leaves
// `.default` undefined. Build the double explicitly.
jest.mock('ioredis', () => {
  const ctor = jest.fn();
  return Object.assign(ctor, { default: ctor });
});

const MockedRedis = Redis as unknown as jest.Mock;

function configOf(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

/** Options ioredis was actually constructed with (last arg, whichever form was used). */
function constructorOptions(): Record<string, unknown> {
  const args = MockedRedis.mock.calls[0];
  return args[args.length - 1] as Record<string, unknown>;
}

describe('RedisService', () => {
  let handlers: Record<string, (arg?: unknown) => void>;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = {};
    MockedRedis.mockImplementation(() => ({
      on: (event: string, fn: (arg?: unknown) => void) => {
        handlers[event] = fn;
      },
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
    }));
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('reconnectDelayMs (R4)', () => {
    it('never gives up, however long the outage has run', () => {
      // The old strategy answered null from attempt 11. Walk well past that, and past
      // any plausible re-introduced cap.
      for (const attempt of [11, 12, 50, 1_000, 100_000]) {
        const delay = reconnectDelayMs(attempt);
        expect(delay).not.toBeNull();
        expect(typeof delay).toBe('number');
        expect(delay).toBeGreaterThan(0);
      }
    });

    it('backs off, then holds at a 5s ceiling', () => {
      expect(reconnectDelayMs(1)).toBe(200);
      expect(reconnectDelayMs(5)).toBe(1000);
      expect(reconnectDelayMs(25)).toBe(5000);
      // Capped: a day-long outage still retries every 5s, not every 20 minutes.
      expect(reconnectDelayMs(100_000)).toBe(5000);
    });

    it('keeps retrying often enough to recover promptly', () => {
      // ~12 attempts a minute at the ceiling. Cheap enough to run forever, quick enough
      // that a restarted Redis is picked up inside one request's patience.
      expect(60_000 / reconnectDelayMs(1_000)).toBeGreaterThanOrEqual(12);
    });
  });

  describe('client configuration', () => {
    it('installs the unbounded strategy on the real client', () => {
      new RedisService(configOf({ REDIS_HOST: 'localhost' }));

      const opts = constructorOptions();
      const strategy = opts.retryStrategy as (t: number) => number | null;
      expect(strategy(1)).toBe(200);
      expect(strategy(11)).not.toBeNull();
      expect(strategy(10_000)).toBe(5000);
    });

    it('keeps failing fast on individual commands while the connection retries', () => {
      new RedisService(configOf({ REDIS_HOST: 'localhost' }));

      const opts = constructorOptions();
      // Retrying the CONNECTION forever must not turn into a caller waiting forever —
      // that was R2, in the other client.
      expect(opts.enableOfflineQueue).toBe(false);
      expect(opts.maxRetriesPerRequest).toBe(1);
    });

    it('bounds a connected-but-hung server with timeouts (R10)', () => {
      new RedisService(configOf({ REDIS_HOST: 'localhost' }));

      const opts = constructorOptions();
      // enableOfflineQueue only covers a client that KNOWS it is disconnected. A wedged
      // server accepts the command and never answers; without these, callers wait
      // forever and nothing in the service notices.
      expect(opts.commandTimeout).toBeGreaterThan(0);
      expect(opts.connectTimeout).toBeGreaterThan(0);

      // A bound that is not actually a bound on a user-facing request is not a fix.
      // Everything here is a single O(1) key operation against a nearby cache.
      expect(opts.commandTimeout as number).toBeLessThanOrEqual(5_000);
      // A cold TCP+auth handshake to a cloud Redis legitimately outlasts a GET.
      expect(opts.connectTimeout as number).toBeGreaterThanOrEqual(
        opts.commandTimeout as number,
      );
    });

    it('applies the key prefix when REDIS_PREFIX is set (R7)', () => {
      new RedisService(configOf({ REDIS_HOST: 'localhost', REDIS_PREFIX: 'prod:' }));

      // Declared in env.validation.ts since day one but set nowhere, so this was always
      // ''. Two environments on one Redis collided on lockout:* and blacklist:*.
      expect(constructorOptions().keyPrefix).toBe('prod:');
    });

    it('uses REDIS_URL when given, with the same strategy', () => {
      new RedisService(configOf({ REDIS_URL: 'redis://cache:6379' }));

      expect(MockedRedis.mock.calls[0][0]).toBe('redis://cache:6379');
      const strategy = constructorOptions().retryStrategy as (
        t: number,
      ) => number | null;
      expect(strategy(50)).toBe(5000);
    });
  });

  describe('outage logging', () => {
    it('logs an outage once, not once per failed attempt', () => {
      new RedisService(configOf({ REDIS_HOST: 'localhost' }));

      // Retrying forever means many more error events than before; they must not become
      // a log flood.
      for (let i = 0; i < 50; i++) {
        handlers.error?.(new Error('ECONNREFUSED'));
      }

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('announces a recovery distinctly, and re-arms the outage log', () => {
      new RedisService(configOf({ REDIS_HOST: 'localhost' }));

      handlers.ready?.();
      expect(logSpy).toHaveBeenLastCalledWith('Redis connection ready');

      handlers.error?.(new Error('ECONNREFUSED'));
      handlers.ready?.();
      // Recovery without a restart is the whole point of R4 — it should be visible.
      expect(logSpy).toHaveBeenLastCalledWith('Redis reconnected');

      // A second outage is reported again rather than swallowed.
      warnSpy.mockClear();
      handlers.error?.(new Error('ECONNREFUSED'));
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('startup', () => {
    it('does not throw when Redis is unreachable at boot', async () => {
      MockedRedis.mockImplementation(() => ({
        on: (event: string, fn: (arg?: unknown) => void) => {
          handlers[event] = fn;
        },
        connect: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        quit: jest.fn(),
      }));
      const service = new RedisService(configOf({ REDIS_HOST: 'localhost' }));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
      // The retry strategy is what gets it connected later; boot is not the last chance.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis unavailable at startup'),
      );
    });
  });
});
