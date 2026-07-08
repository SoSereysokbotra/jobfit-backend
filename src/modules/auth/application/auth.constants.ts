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
