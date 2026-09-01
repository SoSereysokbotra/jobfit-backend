// R1 from the Redis audit: brute-force protection was bypassable by stopping Redis.
//
// `isLocked()` swallowed every Redis error and returned false, and recordFailedAttempt()
// silently no-opped — so with Redis down there was no account lockout and no IP lockout,
// and nothing was recorded. Fail-open is right for a cache and wrong for a security
// control; this one had it by inheritance rather than by decision.
//
// The load-bearing test is the first one in "Redis down".

import { Logger } from '@nestjs/common';
import { AccountLockoutService } from './account-lockout.service';

const EMAIL = 'victim@example.com';
const IP = '203.0.113.9';

describe('AccountLockoutService', () => {
  let redis: {
    incr: jest.Mock;
    expire: jest.Mock;
    set: jest.Mock;
    exists: jest.Mock;
    del: jest.Mock;
  };
  let service: AccountLockoutService;
  let errorLog: jest.SpyInstance;

  const down = (): Error => new Error('Connection is closed.');

  /** Make every Redis call reject, as ioredis does with enableOfflineQueue: false. */
  const killRedis = () => {
    redis.incr.mockRejectedValue(down());
    redis.expire.mockRejectedValue(down());
    redis.set.mockRejectedValue(down());
    redis.exists.mockRejectedValue(down());
    redis.del.mockRejectedValue(down());
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    redis = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      exists: jest.fn().mockResolvedValue(false),
      del: jest.fn().mockResolvedValue(undefined),
    };
    service = new AccountLockoutService(redis as never);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('Redis healthy — unchanged behaviour', () => {
    it('locks the account at the 5th failure', async () => {
      redis.incr.mockResolvedValue(5);

      await service.recordFailedAttempt(EMAIL, IP);

      expect(redis.set).toHaveBeenCalledWith(
        `lockout:account:blocked:${EMAIL}`,
        '1',
        1800,
      );
    });

    it('starts the window TTL only on the first failure', async () => {
      redis.incr.mockResolvedValue(1);
      await service.recordFailedAttempt(EMAIL, IP);
      expect(redis.expire).toHaveBeenCalledWith(
        `lockout:account:attempts:${EMAIL}`,
        900,
      );

      redis.expire.mockClear();
      redis.incr.mockResolvedValue(2);
      await service.recordFailedAttempt(EMAIL, IP);
      expect(redis.expire).not.toHaveBeenCalled();
    });

    it('reports locked when Redis says so', async () => {
      redis.exists.mockResolvedValue(true);
      await expect(service.isLocked(EMAIL, IP)).resolves.toBe(true);
    });

    it('reports unlocked when Redis says so', async () => {
      await expect(service.isLocked(EMAIL, IP)).resolves.toBe(false);
    });
  });

  describe('Redis down — the bypass is closed', () => {
    it('still locks the account after 5 failures', async () => {
      killRedis();

      for (let i = 0; i < 5; i++) await service.recordFailedAttempt(EMAIL, IP);

      // BEFORE THE FIX this returned false forever: unlimited guesses, nothing recorded.
      await expect(service.isLocked(EMAIL, IP)).resolves.toBe(true);
    });

    it('does not lock before the threshold', async () => {
      killRedis();

      for (let i = 0; i < 4; i++) await service.recordFailedAttempt(EMAIL, IP);

      expect(await service.isLocked(EMAIL, IP)).toBe(false);
    });

    it('locks by IP at 20, independently of the account dimension', async () => {
      killRedis();

      // 20 attempts spread across distinct emails — the enumeration case the account
      // dimension cannot catch.
      for (let i = 0; i < 20; i++) {
        await service.recordFailedAttempt(`user${i}@example.com`, IP);
      }

      // A fresh email from that IP is still refused.
      await expect(service.isLocked('brand-new@example.com', IP)).resolves.toBe(true);
    });

    it('logs at ERROR, once per outage, not once per request', async () => {
      killRedis();

      for (let i = 0; i < 5; i++) await service.recordFailedAttempt(EMAIL, IP);

      // A security control running degraded is an error, not a cache miss — but a
      // brute-force attempt during an outage must not bury its own evidence in repeats.
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(errorLog.mock.calls[0][0]).toMatch(/DEGRADED/);
    });
  });

  describe('recovery', () => {
    it('honours a lock recorded during the outage after Redis returns', async () => {
      killRedis();
      for (let i = 0; i < 5; i++) await service.recordFailedAttempt(EMAIL, IP);

      // Redis comes back, and of course knows nothing about those attempts.
      redis.exists.mockResolvedValue(false);

      // Recovery must not hand the attacker a clean slate.
      await expect(service.isLocked(EMAIL, IP)).resolves.toBe(true);
    });

    it('clears the local lock on a successful login', async () => {
      killRedis();
      for (let i = 0; i < 5; i++) await service.recordFailedAttempt(EMAIL, IP);
      expect(await service.isLocked(EMAIL, IP)).toBe(true);

      redis.del.mockResolvedValue(undefined);
      redis.exists.mockResolvedValue(false);
      await service.clearAttempts(EMAIL);

      await expect(service.isLocked(EMAIL, IP)).resolves.toBe(false);
    });

    it('clears locally even when Redis is still down', async () => {
      killRedis();
      for (let i = 0; i < 5; i++) await service.recordFailedAttempt(EMAIL, IP);

      await service.clearAttempts(EMAIL);

      // A stale local lock must not outlive the outage it was created in.
      const stillLocked = await service.isLocked(EMAIL, '198.51.100.1');
      expect(stillLocked).toBe(false);
    });
  });

  describe('the fallback cannot be turned into a memory-exhaustion vector', () => {
    it('stays bounded while an attacker enumerates addresses', async () => {
      killRedis();

      for (let i = 0; i < 12_000; i++) {
        await service.recordFailedAttempt(`enum${i}@example.com`, IP);
      }

      const size = (service as unknown as { fallback: Map<string, unknown> }).fallback
        .size;
      // Cap is 10k; the IP dimension is the real backstop here — one attacker is many
      // emails but few IPs.
      expect(size).toBeLessThanOrEqual(10_000);
      await expect(service.isLocked('anyone@example.com', IP)).resolves.toBe(true);
    });
  });
});
