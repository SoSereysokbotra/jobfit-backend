// src/modules/auth/infrastructure/services/token-blacklist.service.ts
//
// Tracks revoked JWTs by their `jti` claim in Redis under `blacklist:{jti}`.
//
// ── THE FAILURE MODE, DECIDED RATHER THAN INHERITED (Redis audit R6) ─────────
//
// It used to swallow every Redis error, return `false` from isBlacklisted(), and no-op in
// blacklist(). A revoked access token was therefore accepted for its remaining lifetime
// during any Redis outage, and a logout performed during one revoked nothing at all.
//
// Naming this precisely matters, because the two words point opposite ways here:
//
//   fail OPEN   = on error, assume NOT revoked -> let the request through.
//                 This was the bug. Exposure is bounded by ACCESS_TOKEN_TTL (15m).
//   fail CLOSED = on error, assume possibly revoked -> reject the request.
//                 Not "treat the token as still valid" — the opposite. Every
//                 authenticated request carries a jti, so this turns a cache outage into
//                 a 401 on every authenticated endpoint. That is a total API outage.
//
// Fail-closed is not deployable here on top of being disproportionate: `cloudbuild.yaml`
// omits Redis entirely, so production has NO reachable Redis today. Fail-closed would
// mean production rejects every authenticated request, permanently. And the harm it
// would prevent is capped at 15 minutes of a revoked token — a worse incident traded for
// a smaller one, which is exactly the trade R1 rejected for account lockout.
//
// So: DEGRADE, the same shape as AccountLockoutService. Redis stays the primary store,
// and every revocation is ALSO mirrored in-process, write-through, from the moment it is
// made. The mirror is honestly weaker:
//
//   * PER INSTANCE. A logout handled by instance A is unknown to instance B while Redis
//     is down. Same caveat as R1.
//   * ONLY WHAT THIS PROCESS REVOKED. Revocations made before this process started, or
//     by another instance, live only in Redis. This is the real asymmetry with R1: there,
//     the security-relevant events (failed logins) HAPPEN during the outage and so are
//     all locally visible; here, the relevant events mostly happened before it.
//   * LOST ON RESTART — but harmlessly. Each mirror entry expires exactly when its token
//     does, so a restart can only drop entries for tokens that are about to die anyway,
//     and Redis holds the durable copy.
//
// What the mirror buys, concretely: (1) a logout during an outage now actually revokes
// the token on the instance that handled it, instead of silently doing nothing; (2) the
// mirror is consulted even when Redis is healthy, so a revocation made during an outage
// is still honoured after Redis returns — recovery must not hand back a clean slate.
//
// Closing the gap properly means a durable revocation store (a `revoked_jti` table) or
// short enough access tokens that revocation is moot. That is a follow-up, not an
// oversight.

import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../shared/services/redis.service';
import { ITokenBlacklistService } from '../../domain/services/itoken-blacklist.service.interface';

/**
 * Ceiling on mirrored revocations. Each entry is one logout with a ≤15-minute life, so a
 * real instance never approaches this; the cap exists so the map cannot be grown without
 * bound. See evictOne() for what goes and why every eviction here costs something.
 */
const MIRROR_MAX_ENTRIES = 10_000;

/** How often the mirror is swept for lapsed entries. Throttled — see prune(). */
const PRUNE_INTERVAL_MS = 60_000;

/** How many candidates evictOne() inspects before taking the oldest-inserted. */
const EVICTION_SCAN_LIMIT = 50;

@Injectable()
export class TokenBlacklistService implements ITokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly keyFor = (jti: string) => `blacklist:${jti}`;

  /** jti -> epoch ms at which the token itself expires. Write-through, always populated. */
  private readonly mirror = new Map<string, number>();
  /** True while Redis is erroring, so the warning is logged once per outage. */
  private degraded = false;
  private lastPrunedAt = 0;
  private capWarned = false;

  constructor(private readonly redis: RedisService) {}

  async isBlacklisted(jti: string): Promise<boolean> {
    if (!jti) return false;

    // The mirror is checked FIRST and unconditionally. It only ever produces a positive,
    // it is the sole record of anything revoked while Redis was unreachable, and it costs
    // a map lookup.
    if (this.mirroredRevoked(jti)) return true;

    try {
      const value = await this.redis.get(this.keyFor(jti));
      this.recovered();
      return value !== null;
    } catch (err) {
      this.enterDegraded('isBlacklisted', err);
      // Degraded, not fail-open-by-default: we answer with everything this process knows,
      // which is every revocation it performed. What it cannot know is what other
      // instances revoked. Rejecting instead would 401 every authenticated request.
      return false;
    }
  }

  async blacklist(jti: string, ttlSeconds: number): Promise<void> {
    if (!jti || ttlSeconds <= 0) return;

    // Mirror BEFORE Redis, and whether or not Redis answers. A revocation that reaches
    // no store at all is a logout that did not log anyone out — which is what happened
    // during every outage before this.
    this.mirrorRevocation(jti, ttlSeconds);

    try {
      await this.redis.set(this.keyFor(jti), '1', ttlSeconds);
      this.recovered();
    } catch (err) {
      this.enterDegraded('blacklist', err);
      // Not rethrown: the caller is a logout, and failing it would leave the user
      // believing they are still signed in while the token is in fact revoked locally.
    }
  }

  // ── in-process mirror ──────────────────────────────────────────────────────

  private mirrorRevocation(jti: string, ttlSeconds: number): void {
    const now = Date.now();
    this.prune(now);
    if (!this.mirror.has(jti) && this.mirror.size >= MIRROR_MAX_ENTRIES) {
      this.evictOne(now);
    }
    this.mirror.set(jti, now + ttlSeconds * 1000);
  }

  private mirroredRevoked(jti: string): boolean {
    const expiresAt = this.mirror.get(jti);
    if (expiresAt === undefined) return false;
    if (expiresAt > Date.now()) return true;
    // Lapsed: the token itself has expired, so the entry has nothing left to protect.
    this.mirror.delete(jti);
    return false;
  }

  /**
   * Drop entries whose tokens have expired.
   *
   * THROTTLED to once a minute because it is O(n) and runs on the revocation path — the
   * same mistake R1's prune() made and had to have measured out of it. Entries live at
   * most ACCESS_TOKEN_TTL, so a once-a-minute sweep keeps the map close to its true size,
   * and the cap covers the gap between sweeps.
   */
  private prune(now: number): void {
    if (now - this.lastPrunedAt < PRUNE_INTERVAL_MS) return;
    this.lastPrunedAt = now;
    for (const [jti, expiresAt] of this.mirror) {
      if (expiresAt <= now) this.mirror.delete(jti);
    }
  }

  /**
   * Make room for one entry, in bounded time.
   *
   * Unlike R1's map there is no "safe" entry to evict — every live entry here is a
   * revocation, so dropping one hands that token back for its remaining life. So: take a
   * lapsed entry if the bounded scan finds one, otherwise take the one expiring SOONEST
   * among the candidates, which is the smallest amount of remaining exposure handed back.
   *
   * A full scan for the true minimum is O(n) on the revocation path, which under a flood
   * is the CPU amplifier R1 had to fix. A bounded scan from the oldest-inserted end is
   * close enough: entries are inserted in roughly expiry order because access tokens all
   * share one TTL.
   */
  private evictOne(now: number): void {
    let checked = 0;
    let soonest: string | undefined;
    let soonestAt = Infinity;

    for (const [jti, expiresAt] of this.mirror) {
      if (expiresAt <= now) {
        this.mirror.delete(jti);
        return;
      }
      if (expiresAt < soonestAt) {
        soonestAt = expiresAt;
        soonest = jti;
      }
      if (++checked >= EVICTION_SCAN_LIMIT) break;
    }

    if (soonest !== undefined) {
      this.mirror.delete(soonest);
      if (!this.capWarned) {
        this.capWarned = true;
        this.logger.warn(
          `Revocation mirror hit its ${MIRROR_MAX_ENTRIES}-entry cap; evicting live ` +
            'entries. Those tokens are honoured again on this instance until Redis ' +
            'answers. Investigate the logout volume.',
        );
      }
    }
  }

  // ── outage reporting ───────────────────────────────────────────────────────

  /**
   * ERROR, once per outage. This is a security control running degraded, not a cache
   * miss — and once per outage rather than per request, so a burst of traffic during an
   * outage cannot bury its own evidence.
   */
  private enterDegraded(operation: string, err: unknown): void {
    if (this.degraded) return;
    this.degraded = true;
    this.logger.error(
      `Token revocation DEGRADED: ${operation} could not reach Redis ` +
        `(${(err as Error).message}). Falling back to the in-process mirror — it knows ` +
        'only revocations this instance made, so a token revoked elsewhere may be ' +
        'accepted for up to its remaining lifetime until Redis returns.',
    );
  }

  private recovered(): void {
    if (!this.degraded) return;
    this.degraded = false;
    this.logger.log('Token revocation recovered: Redis is answering again.');
  }
}
