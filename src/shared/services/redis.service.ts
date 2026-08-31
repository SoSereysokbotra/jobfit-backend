// src/shared/services/redis.service.ts
//
// Thin ioredis wrapper exposed as a NestJS injectable. Provides get/set/del/scan
// (+ a few atomic helpers: incr/expire/exists) used by the auth infrastructure.
//
// Resilience: the client is configured to FAIL FAST when Redis is unreachable
// (enableOfflineQueue: false) rather than hang, and the connection 'error' event is
// handled so a missing Redis never crashes the process. Callers decide their own
// degraded behaviour (AccountLockoutService falls back to in-process counters;
// TokenBlacklistService has its own documented mode).
//
// RECONNECTION IS UNBOUNDED, DELIBERATELY (Redis audit R4). `retryStrategy` used to
// return `null` after 10 attempts, and `null` tells ioredis to STOP RETRYING FOR THE
// LIFETIME OF THE PROCESS. After roughly 20 seconds the client was dead: Redis could
// come back and this service would never notice, so recovery needed a backend restart —
// on Cloud Run, a deploy. A cache that cannot rejoin its cache is worse than one that
// keeps knocking, and the cost of knocking is one TCP connect attempt every few seconds.

import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/** Ramp: attempt 1 waits 200ms, attempt 2 waits 400ms, and so on up to the cap. */
const RECONNECT_STEP_MS = 200;
/**
 * Ceiling on the wait between reconnection attempts. Five seconds keeps recovery quick
 * enough that a restarted Redis is picked up within one request's patience, while a
 * long outage costs ~12 connect attempts a minute — nothing.
 */
const RECONNECT_MAX_DELAY_MS = 5_000;

/**
 * How long to wait before the next reconnection attempt. NEVER returns `null`: that is
 * ioredis's "give up permanently" signal, and giving up permanently was R4.
 */
export function reconnectDelayMs(attempt: number): number {
  return Math.min(attempt * RECONNECT_STEP_MS, RECONNECT_MAX_DELAY_MS);
}

/**
 * Ceiling on a single command (Redis audit R10).
 *
 * `enableOfflineQueue: false` only covers a client that KNOWS it is disconnected. A
 * server that is connected but wedged — swapping, blocked on a slow command, a half-open
 * TCP connection the kernel has not given up on — accepts the write and never answers,
 * and every caller waits forever. Nothing in this service noticed that state.
 *
 * 2s, against the health indicator's 1s ping: everything here is a single O(1) key
 * operation on a local-network cache, so 2s is already two orders of magnitude of
 * headroom. Made larger, it stops being a bound on a user-facing request; the callers
 * degrade on a timeout, and degrading quickly beats blocking.
 */
const COMMAND_TIMEOUT_MS = 2_000;

/**
 * Ceiling on establishing the connection. Longer than a command because a cold TCP+auth
 * handshake to a cloud Redis legitimately takes longer than a GET, and a connect that
 * times out is retried by the strategy above anyway.
 */
const CONNECT_TIMEOUT_MS = 5_000;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;
  private readonly keyPrefix: string;
  private errorLogged = false;
  /** Distinguishes the first connect from a reconnection after an outage. */
  private everReady = false;

  constructor(private readonly config: ConfigService) {
    this.keyPrefix = this.config.get<string>('REDIS_PREFIX') ?? '';

    const commonOpts = {
      keyPrefix: this.keyPrefix,
      lazyConnect: true, // don't connect at construction; onModuleInit does it non-fatally
      enableOfflineQueue: false, // reject commands immediately when down (fail-fast)
      maxRetriesPerRequest: 1 as const,
      // A connected-but-hung server is not a disconnected one, and only these bound it.
      commandTimeout: COMMAND_TIMEOUT_MS,
      connectTimeout: CONNECT_TIMEOUT_MS,
      // Keeps trying forever — see the header. `maxRetriesPerRequest: 1` still bounds an
      // individual command, so retrying the CONNECTION indefinitely does not make any
      // single caller wait longer.
      retryStrategy: reconnectDelayMs,
    };

    // Prefer a full REDIS_URL if provided; otherwise assemble from host/port/password
    // (the keys JobFit's config/env define).
    const url = this.config.get<string>('REDIS_URL');
    if (url) {
      this.client = new Redis(url, commonOpts);
    } else {
      this.client = new Redis({
        host: this.config.get<string>('REDIS_HOST') ?? 'localhost',
        port: parseInt(this.config.get<string>('REDIS_PORT') ?? '6379', 10),
        password: this.config.get<string>('REDIS_PASSWORD') || undefined,
        ...commonOpts,
      });
    }

    this.client.on('error', (err: Error) => {
      // Log once per outage to avoid spamming while Redis is down.
      if (!this.errorLogged) {
        this.logger.warn(
          `Redis error — Redis-backed features will fail open: ${err.message}`,
        );
        this.errorLogged = true;
      }
    });

    this.client.on('ready', () => {
      // Recovery is now something that happens on its own, so say so out loud: the old
      // behaviour made "Redis is back" an event nobody could observe without a restart.
      this.logger.log(
        this.everReady ? 'Redis reconnected' : 'Redis connection ready',
      );
      this.errorLogged = false;
      this.everReady = true;
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.connect();
    } catch (err) {
      this.logger.warn(
        `Redis unavailable at startup — continuing without it (fail-open): ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      /* ignore shutdown errors */
    }
  }

  /** Escape hatch for advanced commands not wrapped here. */
  get raw(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds && ttlSeconds > 0) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.client.exists(key)) > 0;
  }

  /**
   * Return all keys matching `${prefix}*` using a non-blocking SCAN loop.
   * NOTE: ioredis does not apply `keyPrefix` to SCAN's MATCH pattern, so we prepend it
   * here; returned keys therefore include the configured keyPrefix.
   */
  async scan(prefix: string): Promise<string[]> {
    const match = `${this.keyPrefix}${prefix}*`;
    const found: string[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(
        cursor,
        'MATCH',
        match,
        'COUNT',
        100,
      );
      cursor = next;
      found.push(...keys);
    } while (cursor !== '0');
    return found;
  }

  /** Delete every key matching `${prefix}*` (used for prefix-scan cache invalidation). */
  async deleteByPrefix(prefix: string): Promise<void> {
    const keys = await this.scan(prefix);
    if (keys.length > 0) {
      // scan() returns full keys (keyPrefix already included), so delete via the raw
      // client to avoid re-applying keyPrefix.
      await this.client.del(...keys);
    }
  }
}
