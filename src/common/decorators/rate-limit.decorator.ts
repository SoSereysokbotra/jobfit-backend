// src/common/decorators/rate-limit.decorator.ts
//
// Activates exactly ONE of the globally-registered named throttlers for a route by
// skipping all the others. The active throttler enforces the ttl/limit from
// throttler.config.ts (registered in ThrottlerModule.forRoot). Requires the route (or
// controller) to also apply @UseGuards(ThrottlerGuard).
//
//   @RateLimit(THROTTLERS.login.name)

import { SkipThrottle } from '@nestjs/throttler';
import { THROTTLERS } from '../../config/throttler.config';

const ALL_THROTTLER_NAMES = Object.values(THROTTLERS).map((t) => t.name);

export function RateLimit(activeName: string) {
    const skip: Record<string, boolean> = {};
    for (const name of ALL_THROTTLER_NAMES) {
        if (name !== activeName) skip[name] = true;
    }
    // Names not present in `skip` (i.e. activeName) remain enforced.
    return SkipThrottle(skip);
}

/**
 * Exempt a route from EVERY named throttler.
 *
 * ⚠️ USE THIS, NEVER A BARE `@SkipThrottle()`. That decorator's signature is
 * `SkipThrottle(skip = { default: true })`, so calling it with no arguments skips
 * exactly one throttler — the one *named* `"default"`. Every throttler in
 * throttler.config.ts has an explicit name and none is called "default", so a bare
 * call skips NOTHING and the guard then charges the route against all of them.
 *
 * That was a live production bug on `GET /auth/me`: the route inherited the
 * controller's ThrottlerGuard and hit every limiter at once, so the tightest —
 * `resend`, 3 per 15 min per IP — threw ThrottlerException on the 4th call. The
 * extension calls /auth/me on every popup open, so three opens locked the user out
 * for 15 minutes (blockDuration defaults to ttl, and retrying while blocked just
 * returns the same 429).
 */
export function NoRateLimit() {
    const skip: Record<string, boolean> = {};
    for (const name of ALL_THROTTLER_NAMES) skip[name] = true;
    return SkipThrottle(skip);
}
