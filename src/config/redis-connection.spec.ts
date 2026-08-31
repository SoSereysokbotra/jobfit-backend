// src/config/redis-connection.spec.ts
//
// The bug these exist for: BullMQ read REDIS_HOST/REDIS_PORT and ignored REDIS_URL, while
// RedisService preferred REDIS_URL. Setting only REDIS_URL — the single variable every
// managed provider hands you — connected the cache and silently left the job queue
// pointed at localhost.
//
// So the load-bearing test is "both clients resolve the same target from the same env".

import { resolveRedisConnection } from './redis-connection';

describe('resolveRedisConnection', () => {
  describe('REDIS_URL (how production is configured)', () => {
    it('parses host, port and password out of a URL', () => {
      expect(
        resolveRedisConnection({ REDIS_URL: 'redis://:s3cret@cache.internal:6380' }),
      ).toEqual({
        host: 'cache.internal',
        port: 6380,
        username: undefined,
        password: 's3cret',
      });
    });

    it('defaults to 6379 when the URL carries no port', () => {
      expect(resolveRedisConnection({ REDIS_URL: 'redis://cache.internal' }).port).toBe(
        6379,
      );
    });

    it('keeps a username when the provider uses one', () => {
      const c = resolveRedisConnection({
        REDIS_URL: 'redis://default:pw@host:6379',
      });
      expect(c.username).toBe('default');
      expect(c.password).toBe('pw');
    });

    it('url-decodes a password containing reserved characters', () => {
      // Managed providers generate passwords with / + = in them, and those arrive
      // percent-encoded. Passing the encoded form straight to AUTH fails to connect.
      const c = resolveRedisConnection({
        REDIS_URL: 'redis://:p%40ss%2Fword@host:6379',
      });
      expect(c.password).toBe('p@ss/word');
    });

    describe('TLS', () => {
      it('enables TLS for rediss://', () => {
        const c = resolveRedisConnection({ REDIS_URL: 'rediss://secure.upstash.io:6379' });
        expect(c.tls).toEqual({});
      });

      it('OMITS the tls key entirely for redis://, rather than setting it undefined', () => {
        const c = resolveRedisConnection({ REDIS_URL: 'redis://localhost:6379' });
        // ioredis treats the mere PRESENCE of `tls` as "use TLS". `tls: undefined` would
        // make a local unencrypted Redis fail to connect, so the key must be absent.
        expect('tls' in c).toBe(false);
      });
    });

    describe('a bad value fails loudly instead of falling back', () => {
      it('throws on a malformed URL', () => {
        expect(() => resolveRedisConnection({ REDIS_URL: 'not a url' })).toThrow(
          /not a valid URL/,
        );
      });

      it('throws on a scheme that is not redis:// or rediss://', () => {
        // Pasting an http:// dashboard link, or a postgres:// string, is a real mistake.
        // Quietly connecting to localhost instead would hide it completely.
        expect(() =>
          resolveRedisConnection({ REDIS_URL: 'https://console.upstash.com/x' }),
        ).toThrow(/unsupported scheme/);
      });
    });
  });

  describe('host/port fallback (how local dev is configured)', () => {
    it('uses REDIS_HOST/REDIS_PORT/REDIS_PASSWORD when there is no URL', () => {
      expect(
        resolveRedisConnection({
          REDIS_HOST: 'redis',
          REDIS_PORT: '6380',
          REDIS_PASSWORD: 'pw',
        }),
      ).toEqual({ host: 'redis', port: 6380, password: 'pw' });
    });

    it('defaults to localhost:6379 with no password when nothing is set', () => {
      expect(resolveRedisConnection({})).toEqual({
        host: 'localhost',
        port: 6379,
        password: undefined,
      });
    });

    it('treats an empty REDIS_PASSWORD as no password', () => {
      // .env commonly has `REDIS_PASSWORD=` for a local Redis with auth disabled.
      // Sending an empty AUTH is an error, not a no-op.
      expect(resolveRedisConnection({ REDIS_PASSWORD: '' }).password).toBeUndefined();
    });

    it('ignores a blank REDIS_URL rather than treating it as set', () => {
      expect(
        resolveRedisConnection({ REDIS_URL: '   ', REDIS_HOST: 'fallback' }).host,
      ).toBe('fallback');
    });
  });

  describe('the two clients cannot diverge', () => {
    it('resolves one target from a URL-only environment', () => {
      // THE REGRESSION. Before this helper, RedisService read the URL and BullMQ read
      // REDIS_HOST — absent here — so BullMQ silently used localhost while the cache
      // talked to the real server.
      const env = { REDIS_URL: 'rediss://real-redis.example.com:6379' };

      const forCache = resolveRedisConnection(env);
      const forQueue = resolveRedisConnection(env);

      expect(forCache).toEqual(forQueue);
      expect(forQueue.host).toBe('real-redis.example.com');
      expect(forQueue.host).not.toBe('localhost');
    });

    it('prefers the URL when BOTH the URL and host/port are set', () => {
      // A deploy that sets REDIS_URL while a stale REDIS_HOST lingers must not split the
      // two clients across two servers.
      const env = {
        REDIS_URL: 'redis://authoritative:6379',
        REDIS_HOST: 'stale-leftover',
        REDIS_PORT: '9999',
      };
      expect(resolveRedisConnection(env).host).toBe('authoritative');
      expect(resolveRedisConnection(env).port).toBe(6379);
    });
  });
});
