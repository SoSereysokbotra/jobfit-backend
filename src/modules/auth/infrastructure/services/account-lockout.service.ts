// src/modules/auth/infrastructure/services/account-lockout.service.ts
//
// Brute-force protection. Two independent dimensions:
//   - account (by email): 5 failures / 15-min window  -> 30-min lockout
//   - ip:                  20 failures / 15-min window -> 30-min lockout
//
// Keys:
//   lockout:account:attempts:{email}   (rolling counter, 15-min TTL)
//   lockout:account:blocked:{email}    (existence = locked, 30-min TTL)
//   lockout:ip:attempts:{ip}           (rolling counter, 15-min TTL)
//   lockout:ip:blocked:{ip}            (existence = locked, 30-min TTL)
//
// ── WHY THIS NO LONGER FAILS OPEN ────────────────────────────────────────────
//
// It used to swallow every Redis error and return `false` from isLocked(). That made
// brute-force protection BYPASSABLE BY STOPPING REDIS: unlimited password guesses
// against any account, with nothing recorded (Redis audit, R1).
//
// Fail-open is the right default for a cache. It is the wrong default for a security
// control — and this service was getting it by inheritance from the surrounding pattern
// rather than by decision.
//
// Fail-CLOSED is also wrong here: refusing all logins during a Redis outage turns a cache
// outage into a total authentication outage, which is a worse incident than the one being
// prevented.
//
// So: DEGRADE. Redis stays the primary store; when it errors we fall back to in-process
// counters. Weaker than Redis and honestly so —
//
//   * PER INSTANCE. With N backend instances an attacker gets up to N× the attempts,
//     the same caveat the throttler documents. Bounded by a constant factor instead of
//     unbounded, which is the entire difference from before.
//   * LOST ON RESTART. A deploy clears the fallback counters.
//   * BOUNDED MEMORY. The map is capped and pruned, because an attacker enumerating
//     emails would otherwise grow it without limit — turning a lockout into a memory
//     exhaustion vector. When the cap is hit the IP dimension is the backstop: an
//     attacker is many emails but few IPs.
//
// Making it exact needs a durable store (counters on the User row, or Postgres-backed
// windows). That is a deliberate follow-up, not an oversight.

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../shared/services/redis.service';
import { IAccountLockoutService } from '../../domain/services/iaccount-lockout.service.interface';

// Thresholds — exact values per the auth spec.
const ACCOUNT_MAX_ATTEMPTS = 5;
const IP_MAX_ATTEMPTS = 20;
const ATTEMPT_WINDOW_SECONDS = 15 * 60; // 15 minutes
const LOCKOUT_SECONDS = 30 * 60; // 30 minutes

/**
 * Ceiling on in-process fallback entries.
 *
 * Sized so a real outage on a real instance never reaches it, while an enumeration
 * attack cannot grow the map without bound. At the cap we evict rather than refuse to
 * track — refusing would let a new attacker in completely untracked. See evictOne() for
 * which entry goes and why a live lock is never the first choice.
 */
const FALLBACK_MAX_ENTRIES = 10_000;

/** How often the fallback map is swept for lapsed entries. See prune(). */
const PRUNE_INTERVAL_MS = 60_000;

/** How many candidates evictOne() inspects before giving up and taking the oldest. */
const EVICTION_SCAN_LIMIT = 50;

interface FallbackCounter {
  attempts: number;
  /** Epoch ms when the rolling attempt window lapses. */
  windowExpiresAt: number;
  /** Epoch ms until which this subject is locked out; 0 = not locked. */
  blockedUntil: number;
}

@Injectable()
export class AccountLockoutService implements IAccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);

  /** In-process counters, used ONLY while Redis is erroring. */
  private readonly fallback = new Map<string, FallbackCounter>();
  /** True while we are on the fallback path, so the warning is logged once per outage. */
  private degraded = false;
  /** Epoch ms of the last fallback sweep — prune() is throttled to keep it off the hot path. */
  private lastPrunedAt = 0;

  constructor(private readonly redis: RedisService) {}

  private accountAttemptsKey = (email: string) =>
    `lockout:account:attempts:${email}`;
  private accountBlockedKey = (email: string) =>
    `lockout:account:blocked:${email}`;
  private ipAttemptsKey = (ip: string) => `lockout:ip:attempts:${ip}`;
  private ipBlockedKey = (ip: string) => `lockout:ip:blocked:${ip}`;

  async recordFailedAttempt(email: string, ip: string): Promise<void> {
    try {
      await this.bumpAndMaybeBlock(
        this.accountAttemptsKey(email),
        this.accountBlockedKey(email),
        ACCOUNT_MAX_ATTEMPTS,
      );
      await this.bumpAndMaybeBlock(
        this.ipAttemptsKey(ip),
        this.ipBlockedKey(ip),
        IP_MAX_ATTEMPTS,
      );
      this.recovered();
    } catch (err) {
      this.enterDegraded('recordFailedAttempt', err);
      // Count it locally instead of dropping it. A dropped failure is a free guess.
      this.fallbackBump(this.accountBlockedKey(email), ACCOUNT_MAX_ATTEMPTS);
      this.fallbackBump(this.ipBlockedKey(ip), IP_MAX_ATTEMPTS);
    }
  }

  private async bumpAndMaybeBlock(
    attemptsKey: string,
    blockedKey: string,
    threshold: number,
  ): Promise<void> {
    const count = await this.redis.incr(attemptsKey);
    if (count === 1) {
      // First failure in a new window — start the window TTL.
      await this.redis.expire(attemptsKey, ATTEMPT_WINDOW_SECONDS);
    }
    if (count >= threshold) {
      await this.redis.set(blockedKey, '1', LOCKOUT_SECONDS);
    }
  }

  async isLocked(email: string, ip: string): Promise<boolean> {
    try {
      const [accountLocked, ipLocked] = await Promise.all([
        this.redis.exists(this.accountBlockedKey(email)),
        this.redis.exists(this.ipBlockedKey(ip)),
      ]);
      this.recovered();
      // A lock recorded locally during an earlier outage must still be honoured once
      // Redis returns — otherwise recovery hands the attacker a clean slate.
      return (
        accountLocked ||
        ipLocked ||
        this.fallbackLocked(this.accountBlockedKey(email)) ||
        this.fallbackLocked(this.ipBlockedKey(ip))
      );
    } catch (err) {
      this.enterDegraded('isLocked', err);
      return (
        this.fallbackLocked(this.accountBlockedKey(email)) ||
        this.fallbackLocked(this.ipBlockedKey(ip))
      );
    }
  }

  async clearAttempts(email: string): Promise<void> {
    // Always clear the local copy: a successful login must not leave a stale local lock
    // that outlives the outage.
    this.fallback.delete(this.accountBlockedKey(email));
    try {
      await this.redis.del(this.accountAttemptsKey(email));
      await this.redis.del(this.accountBlockedKey(email));
    } catch (err) {
      this.logger.warn(
        `clearAttempts could not reach Redis: ${(err as Error).message}`,
      );
    }
  }

  // ── in-process fallback ────────────────────────────────────────────────────

  /** Count a failure locally, and lock the subject once it crosses `threshold`. */
  private fallbackBump(key: string, threshold: number): void {
    const now = Date.now();
    this.prune(now);

    const existing = this.fallback.get(key);
    const counter: FallbackCounter =
      existing && existing.windowExpiresAt > now
        ? existing
        : {
            attempts: 0,
            windowExpiresAt: now + ATTEMPT_WINDOW_SECONDS * 1000,
            blockedUntil: existing?.blockedUntil ?? 0,
          };

    counter.attempts += 1;
    if (counter.attempts >= threshold) {
      counter.blockedUntil = now + LOCKOUT_SECONDS * 1000;
    }

    if (!this.fallback.has(key) && this.fallback.size >= FALLBACK_MAX_ENTRIES) {
      this.evictOne();
    }
    this.fallback.set(key, counter);
  }

  private fallbackLocked(key: string): boolean {
    const counter = this.fallback.get(key);
    if (!counter) return false;
    if (counter.blockedUntil > Date.now()) return true;
    // Lock lapsed. Drop it so the map does not accumulate dead entries.
    if (counter.windowExpiresAt <= Date.now()) this.fallback.delete(key);
    return false;
  }

  /**
   * Drop entries whose window AND lock have both lapsed.
   *
   * THROTTLED, because this is O(n) and it runs on the failed-login path. Pruning on
   * every write meant an attacker mid-outage made us scan the whole map per guess —
   * turning a defence into a CPU amplifier. Once a minute is ample: entries live for
   * 15-30 minutes, and the size cap handles the pathological case between sweeps.
   */
  private prune(now: number): void {
    if (now - this.lastPrunedAt < PRUNE_INTERVAL_MS) return;
    this.lastPrunedAt = now;
    for (const [key, c] of this.fallback) {
      if (c.windowExpiresAt <= now && c.blockedUntil <= now) {
        this.fallback.delete(key);
      }
    }
  }

  /**
   * Make room for one new entry, in constant time.
   *
   * A full scan for the soonest-to-expire entry is O(n), and this runs on the
   * failed-login path once the map is full — so under the very enumeration attack the
   * cap exists to survive, it becomes a CPU amplifier. Measured: 12k inserts against a
   * 10k cap spent seconds in this function alone.
   *
   * A Map iterates in INSERTION order, and every entry gets the same fixed lifetimes, so
   * oldest-inserted is a good proxy for soonest-to-expire. We walk from the oldest and
   * evict the first entry that is not currently locked out, looking at a bounded number
   * of candidates. Preferring unlocked entries matters: evicting a live lock would hand
   * an attacker their access back, which is the one outcome worse than using memory.
   *
   * If the whole window is locked (an active broad attack), evict the oldest anyway —
   * the alternative is refusing to track the newest attacker at all.
   */
  private evictOne(): void {
    let checked = 0;
    let oldest: string | undefined;
    const now = Date.now();

    for (const [key, c] of this.fallback) {
      if (oldest === undefined) oldest = key;
      if (c.blockedUntil <= now) {
        this.fallback.delete(key);
        return;
      }
      if (++checked >= EVICTION_SCAN_LIMIT) break;
    }
    if (oldest) this.fallback.delete(oldest);
  }

  // ── outage reporting ───────────────────────────────────────────────────────

  /**
   * Log at ERROR, once per outage — this is a security control running degraded, not a
   * cache miss. Once per outage rather than once per request, or a brute-force attempt
   * during an outage would bury its own evidence.
   */
  private enterDegraded(operation: string, err: unknown): void {
    if (this.degraded) return;
    this.degraded = true;
    this.logger.error(
      `Account lockout DEGRADED: ${operation} could not reach Redis ` +
        `(${(err as Error).message}). Falling back to in-process counters — these are ` +
        'per-instance and lost on restart, so brute-force protection is weaker until ' +
        'Redis returns.',
    );
  }

  private recovered(): void {
    if (!this.degraded) return;
    this.degraded = false;
    this.logger.log('Account lockout recovered: Redis is answering again.');
  }
}
