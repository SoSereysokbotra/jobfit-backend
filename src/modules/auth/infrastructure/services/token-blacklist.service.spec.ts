// src/modules/auth/infrastructure/services/token-blacklist.service.spec.ts
//
// Redis audit R6: isBlacklisted() returned `false` on any Redis error, so a revoked
// access token was accepted for its remaining lifetime during an outage, and blacklist()
// silently no-opped so a logout during an outage revoked nothing at all.
//
// The chosen mode is DEGRADE, not fail-closed: every authenticated request carries a jti,
// so rejecting on error would 401 the entire API during a cache outage — and production
// has no Redis configured at all today. See the header of the service for the full
// argument. These tests pin the parts of that decision that are easy to undo by accident.

import { Logger } from '@nestjs/common';
import { RedisService } from '../../../../shared/services/redis.service';
import { TokenBlacklistService } from './token-blacklist.service';

const FIFTEEN_MIN = 15 * 60;

describe('TokenBlacklistService', () => {
  let get: jest.Mock;
  let set: jest.Mock;
  let service: TokenBlacklistService;
  let errorSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;

  /** Make every Redis call throw, as it does with Redis unreachable. */
  const redisDown = (message = 'ECONNREFUSED') => {
    get.mockRejectedValue(new Error(message));
    set.mockRejectedValue(new Error(message));
  };
  const redisUp = () => {
    get.mockResolvedValue(null);
    set.mockResolvedValue(undefined);
  };

  beforeEach(() => {
    get = jest.fn().mockResolvedValue(null);
    set = jest.fn().mockResolvedValue(undefined);
    service = new TokenBlacklistService({
      get,
      set,
    } as unknown as RedisService);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('the healthy path', () => {
    it('reports a token Redis knows about as revoked', async () => {
      get.mockResolvedValue('1');
      await expect(service.isBlacklisted('jti-1')).resolves.toBe(true);
    });

    it('reports an unknown token as not revoked', async () => {
      await expect(service.isBlacklisted('jti-1')).resolves.toBe(false);
    });

    it('writes the revocation to Redis with the token\'s remaining life as the TTL', async () => {
      await service.blacklist('jti-1', FIFTEEN_MIN);
      expect(set).toHaveBeenCalledWith('blacklist:jti-1', '1', FIFTEEN_MIN);
    });

    it('ignores an empty jti and a non-positive TTL', async () => {
      await expect(service.isBlacklisted('')).resolves.toBe(false);
      await service.blacklist('', FIFTEEN_MIN);
      await service.blacklist('jti-1', 0);
      await service.blacklist('jti-1', -5);
      expect(set).not.toHaveBeenCalled();
    });
  });

  describe('during a Redis outage', () => {
    it('still revokes a token logged out during the outage', async () => {
      redisDown();

      await service.blacklist('jti-1', FIFTEEN_MIN);

      // Before R6 this returned false: the write no-opped and the read failed open, so
      // logging out mid-outage revoked nothing whatsoever.
      await expect(service.isBlacklisted('jti-1')).resolves.toBe(true);
    });

    it('does not throw out of blacklist(), so a logout still completes', async () => {
      redisDown();
      await expect(
        service.blacklist('jti-1', FIFTEEN_MIN),
      ).resolves.toBeUndefined();
    });

    it('lets an unrelated token through rather than 401ing the whole API', async () => {
      redisDown();

      // Deliberate: fail-closed here means rejecting every authenticated request, since
      // every request carries a jti. That is a bigger incident than 15 minutes of a
      // revoked token.
      await expect(service.isBlacklisted('never-revoked')).resolves.toBe(false);
    });

    it('logs the degradation once per outage, at error level', async () => {
      redisDown();

      for (let i = 0; i < 20; i++) await service.isBlacklisted(`jti-${i}`);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toContain('DEGRADED');
    });
  });

  describe('recovery', () => {
    it('still honours a revocation made during the outage after Redis returns', async () => {
      redisDown();
      await service.blacklist('jti-1', FIFTEEN_MIN);

      redisUp(); // Redis is back — and knows nothing about jti-1.

      // Recovery must not hand back a clean slate. Same rule as R1.
      await expect(service.isBlacklisted('jti-1')).resolves.toBe(true);
    });

    it('announces recovery and re-arms the degraded log', async () => {
      redisDown();
      await service.isBlacklisted('jti-1');
      redisUp();
      await service.isBlacklisted('jti-2');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('recovered'),
      );

      errorSpy.mockClear();
      redisDown();
      await service.isBlacklisted('jti-3');
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('the mirror', () => {
    it('is written through even while Redis is healthy', async () => {
      await service.blacklist('jti-1', FIFTEEN_MIN);
      expect(set).toHaveBeenCalled();

      // Redis then dies. The revocation must survive, because it was mirrored at the
      // time it was made rather than only on failure.
      redisDown();
      await expect(service.isBlacklisted('jti-1')).resolves.toBe(true);
    });

    it('stops honouring a mirrored revocation once the token itself has expired', async () => {
      redisDown();
      await service.blacklist('jti-1', 1); // 1 second

      await expect(service.isBlacklisted('jti-1')).resolves.toBe(true);

      jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);
      // Nothing left to protect: the token is expired, the JWT check rejects it anyway.
      await expect(service.isBlacklisted('jti-1')).resolves.toBe(false);
    });

    it('stays bounded under a flood, and stays fast doing it', async () => {
      redisDown();

      const started = Date.now();
      for (let i = 0; i < 12_000; i++) {
        await service.blacklist(`jti-${i}`, FIFTEEN_MIN);
      }
      const elapsed = Date.now() - started;

      // R1's lesson: an unbounded prune/evict scan on the write path turns a defence
      // into a CPU amplifier under exactly the load it exists for.
      //
      // The threshold is deliberately LOOSE. The signal here is orders of magnitude, not
      // milliseconds: bounded, this is ~20ms; an O(n) scan per insert past a 10k cap is
      // ~10^8 map iterations and takes tens of seconds. A tight bound would only make
      // this test flaky on a loaded machine running 98 suites in parallel — which it
      // duly did at 3000ms — without catching anything a loose one misses.
      expect(elapsed).toBeLessThan(15_000);

      // The most recent revocations — the ones with the most remaining exposure — are
      // the ones kept.
      await expect(service.isBlacklisted('jti-11999')).resolves.toBe(true);
    });
  });
});
