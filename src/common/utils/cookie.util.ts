// src/common/utils/cookie.util.ts
//
// Reusable cookie options for auth cookies (access/refresh tokens). Reading of cookies
// is enabled by cookie-parser in main.ts; SETTING cookies with these options happens in
// the auth presentation layer later. Cookies are always httpOnly; `sameSite` and `secure`
// are derived from NODE_ENV (see buildAuthCookieOptions).

import { CookieOptions } from 'express';

export function isProduction(nodeEnv?: string): boolean {
    return nodeEnv === 'production';
}

/**
 * Build hardened cookie options.
 * @param nodeEnv value of NODE_ENV (read from ConfigService by the caller)
 * @param maxAgeMs optional cookie lifetime in milliseconds
 */
export function buildAuthCookieOptions(
    nodeEnv?: string,
    maxAgeMs?: number,
): CookieOptions {
    // In production the frontend (Vercel) and API (Cloud Run) are different sites, so
    // 'strict' would stop the browser storing/sending these cookies at all — refresh
    // would silently fail and sessions would drop on reload. 'none' is required there,
    // and it only works alongside `secure`. Locally both run on localhost (different
    // ports are still same-site), so dev keeps the stricter setting.
    const options: CookieOptions = {
        httpOnly: true,
        sameSite: isProduction(nodeEnv) ? 'none' : 'strict',
        secure: isProduction(nodeEnv),
        path: '/',
    };
    if (maxAgeMs && maxAgeMs > 0) {
        options.maxAge = maxAgeMs;
    }
    return options;
}
