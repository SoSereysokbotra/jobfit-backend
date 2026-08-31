// src/config/redis-connection.ts
//
// One place that answers "where is Redis, and how do I connect to it?", because there
// are TWO clients that need the answer and they were reading different variables.
//
// THE TRAP THIS CLOSES. `RedisService` prefers `REDIS_URL` and falls back to
// REDIS_HOST/PORT/PASSWORD. BullMQ (queue.module.ts) only ever read
// `redis.host`/`redis.port`/`redis.password`. So setting **only** `REDIS_URL` — which is
// the single variable every managed provider hands you, and the one cloudbuild.yaml
// wires — connected the cache and left the job queue pointing at `localhost:6379`.
//
// Nothing would have said so. The app boots, `/health/ready` is soft, and résumé uploads
// just never get parsed. A queue that is quietly connected to nothing is exactly the
// class of fault the Redis audit was about, so it is fixed here rather than documented
// as a deployment footgun.

/** Everything ioredis needs to open a connection, resolved from the environment. */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  /**
   * Present only for `rediss://`. ioredis treats the mere PRESENCE of this key as
   * "use TLS", so it must be omitted entirely — not set to undefined — for plain
   * connections, or a local unencrypted Redis fails to connect.
   */
  tls?: Record<string, never>;
}

/**
 * Resolve the Redis connection from the environment.
 *
 * `REDIS_URL` wins when set, because that is what managed providers (Upstash, Memorystore
 * with a connection string, Redis Cloud) give you, and because a URL carries the scheme —
 * so `rediss://` is how TLS gets turned on without a second variable.
 *
 * Falls back to REDIS_HOST/REDIS_PORT/REDIS_PASSWORD, which is how local development is
 * configured in `.env`.
 *
 * @param env defaults to `process.env`; injectable for tests.
 */
export function resolveRedisConnection(
  env: NodeJS.ProcessEnv = process.env,
): RedisConnectionOptions {
  const url = env.REDIS_URL?.trim();

  if (url) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      // Fail loudly at boot rather than silently falling back to localhost. A malformed
      // REDIS_URL in production means someone pasted the wrong value, and quietly
      // connecting to a local Redis that does not exist hides that completely.
      throw new Error(
        `REDIS_URL is not a valid URL: ${JSON.stringify(url)}. ` +
          'Expected redis://[user:pass@]host:port or rediss://… for TLS.',
      );
    }

    const secure = parsed.protocol === 'rediss:';
    if (!secure && parsed.protocol !== 'redis:') {
      throw new Error(
        `REDIS_URL has an unsupported scheme "${parsed.protocol}". Use redis:// or rediss://.`,
      );
    }

    return {
      host: parsed.hostname,
      // Managed providers usually put the port in the URL; 6379 is the protocol default.
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      // A URL of the form redis://:password@host carries an empty username — treat that
      // as absent rather than sending an empty AUTH username.
      username: parsed.username || undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      // Spread so the key is absent, not undefined, when TLS is off. See the interface.
      ...(secure ? { tls: {} as Record<string, never> } : {}),
    };
  }

  return {
    host: env.REDIS_HOST ?? 'localhost',
    port: parseInt(env.REDIS_PORT ?? '6379', 10),
    password: env.REDIS_PASSWORD || undefined,
  };
}
