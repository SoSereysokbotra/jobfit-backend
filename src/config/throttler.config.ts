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

// The throttler tracks by IP. In local development the browser and any test/curl
// traffic all share 127.0.0.1, so the production-grade limits below get exhausted in
// minutes — and a throttled silent refresh (POST /auth/refresh-token) then looks like
// a logout. So outside production we scale the limits up massively (effectively off).
// Production MUST set NODE_ENV=production to get the real limits.
const IS_PROD = process.env.NODE_ENV === 'production';
const SCALE = IS_PROD ? 1 : 1000;

// Single source of truth: name + limits per limiter.
export const THROTTLERS = {
    register: { name: 'registerRateLimiter', ttl: 60 * MIN, limit: 5 * SCALE },
    verifyCode: { name: 'verifyCodeRateLimiter', ttl: 15 * MIN, limit: 10 * SCALE },
    resend: { name: 'resendRateLimiter', ttl: 15 * MIN, limit: 3 * SCALE },
    passwordReset: { name: 'passwordResetRateLimiter', ttl: 60 * MIN, limit: 5 * SCALE },
    login: { name: 'loginRateLimiter', ttl: 15 * MIN, limit: 10 * SCALE },
    refreshToken: { name: 'refreshTokenRateLimiter', ttl: 15 * MIN, limit: 30 * SCALE },
    logout: { name: 'logoutRateLimiter', ttl: 15 * MIN, limit: 20 * SCALE },
} as const;

export const authThrottlers: ThrottlerOptions[] = Object.values(THROTTLERS).map(
    (t) => ({ name: t.name, ttl: t.ttl, limit: t.limit }),
);
