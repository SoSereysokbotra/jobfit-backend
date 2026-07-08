// src/config/throttler.config.ts
//
// Named @nestjs/throttler configs for the auth endpoints. Registered globally via
// ThrottlerModule.forRoot(authThrottlers) in app.module.ts. No global ThrottlerGuard
// is applied — each route opts in with the relevant named limiter in the controller
// prompt later, e.g. @Throttle({ [THROTTLERS.login.name]: {} }) + @UseGuards(ThrottlerGuard).
//
// ⚠️ VALUES ARE PLACEHOLDERS. The "Authentication System — coorad-backend" doc was not
// provided, so these ttl/limit numbers are sensible defaults, NOT the doc's exact
// figures. Reconcile the numbers against the doc before relying on them — the NAMES
// match the spec and are the stable part.

import { ThrottlerOptions } from '@nestjs/throttler';

const MIN = 60 * 1000; // one minute in ms (throttler v6 ttl is milliseconds)

// Single source of truth: name + limits per limiter.
export const THROTTLERS = {
    register: { name: 'registerRateLimiter', ttl: 60 * MIN, limit: 5 },
    verifyCode: { name: 'verifyCodeRateLimiter', ttl: 15 * MIN, limit: 10 },
    resend: { name: 'resendRateLimiter', ttl: 15 * MIN, limit: 3 },
    passwordReset: { name: 'passwordResetRateLimiter', ttl: 60 * MIN, limit: 5 },
    login: { name: 'loginRateLimiter', ttl: 15 * MIN, limit: 10 },
    refreshToken: { name: 'refreshTokenRateLimiter', ttl: 15 * MIN, limit: 30 },
    logout: { name: 'logoutRateLimiter', ttl: 15 * MIN, limit: 20 },
} as const;

export const authThrottlers: ThrottlerOptions[] = Object.values(THROTTLERS).map(
    (t) => ({ name: t.name, ttl: t.ttl, limit: t.limit }),
);
