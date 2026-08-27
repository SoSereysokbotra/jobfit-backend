// src/modules/auth/application/auth.constants.ts
//
// ⚠️ The "Authentication System" doc doesn't specify exact code TTLs / token lifetimes,
// so these are sensible defaults — reconcile with the doc when available.

export const VERIFICATION_CODE_LENGTH = 6;

/** Email verification code validity window. */
export const VERIFICATION_CODE_TTL_MINUTES = 15;

/** Password reset code validity window. */
export const PASSWORD_RESET_CODE_TTL_MINUTES = 15;

/** Short-lived access token. */
export const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Long-lived refresh token. */
export const REFRESH_TOKEN_TTL_DAYS = 30;
export const REFRESH_TOKEN_TTL_SECONDS = REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

/**
 * Rotation grace window.
 *
 * Refresh tokens are single-use, so replaying a spent one is normally theft. But two
 * HONEST refreshes can hit the same cookie at once — two open tabs, or a request the
 * browser retried — and exactly one of them wins the rotation. Without a grace window
 * the loser is indistinguishable from an attacker, and the theft response (revoke every
 * session) logs the user out of everything for doing nothing wrong.
 *
 * So a replay this soon after the rotation, while the user still holds a live token, is
 * read as a race rather than theft. It grants NO session — the loser is refused and
 * retries with the cookie the winner just set. A replay after this window, or against a
 * chain with no live token left, is still treated as theft.
 *
 * Kept short deliberately: genuine races resolve in milliseconds; this only has to
 * absorb network jitter.
 */
export const REFRESH_ROTATION_GRACE_SECONDS = 15;
