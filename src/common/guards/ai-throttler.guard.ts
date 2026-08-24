// src/common/guards/ai-throttler.guard.ts
//
// A ThrottlerGuard that counts per ACCOUNT instead of per IP.
//
// WHY. MENTOR_REVIEW_2026-08-18 §11 asks "what is the most money one signed-up user can
// cost you in an hour?" — a question about an account, not an address. The stock guard
// keys on IP, which answers a different question badly in both directions:
//
//   - a shared office or campus NAT is ONE ip and fifty honest users, who would throttle
//     each other while doing nothing wrong;
//   - one abusive account rotating through a phone hotspot, a VPN and a coffee shop is
//     a dozen IPs and gets a dozen fresh budgets.
//
// Every route this guards is behind JwtAuthGuard, so there is always an account to key
// on. That is what makes per-user tracking possible here and NOT on the auth routes,
// where the caller has no account yet — those keep the stock per-IP guard on purpose.
//
// ORDERING. JwtAuthGuard is registered as an APP_GUARD, and Nest runs global guards
// before controller- and route-scoped ones, so `request.user` is already populated by
// the time getTracker runs. If this guard is ever applied globally, or to a @Public()
// route, that stops being true — hence the IP fallback below rather than a throw.

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

interface TrackableRequest {
  user?: { id?: unknown };
  ips?: string[];
  ip?: string;
}

@Injectable()
export class AiThrottlerGuard extends ThrottlerGuard {
  /**
   * The counting key for one request.
   *
   * Prefixed `user:` / `ip:` so the two namespaces can never collide — without it a
   * user id that happened to look like an address would share a bucket with it.
   */
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as TrackableRequest;
    const userId = request.user?.id;

    if (typeof userId === 'string' && userId.length > 0) {
      return Promise.resolve(`user:${userId}`);
    }

    // Unauthenticated fallback. Mirrors the stock guard: behind a proxy, `ips` holds
    // the X-Forwarded-For chain and its first entry is the client. Reaching this at all
    // means the route is not what this guard was built for — better to rate-limit by a
    // weak key than to let it through unlimited.
    const forwarded = request.ips?.length ? request.ips[0] : undefined;
    return Promise.resolve(`ip:${forwarded ?? request.ip ?? 'unknown'}`);
  }
}
