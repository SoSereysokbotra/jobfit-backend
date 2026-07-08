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
