// src/common/logging/redaction.ts
//
// Phase 1 (monitoring plan) — central redaction of sensitive data BEFORE it reaches
// any log sink (stdout / Cloud Logging / Error Reporting / Sentry).
//
// Two layers:
//  1. Key-based: any object property whose (lowercased) name is a known secret is
//     replaced with `**REDACTED**`, recursively, for nested objects/arrays.
//  2. Pattern-based: string values are scrubbed of credit-card / SSN / Bearer-token
//     shapes that have no telltale key name (guide §12).
//
// `redactValue` is wired into pino's `formatters.log` (see logger.config.ts) so it runs
// on EVERY log object, and is reused by AllExceptionsFilter for the error context.

export const REDACTED = '**REDACTED**';

/**
 * Property names (compared case-insensitively) whose values must never be logged.
 * Matches auth, tokens, reset/verification codes, API keys, and payment/PII fields.
 */
export const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'authorization',
  'cookie',
  'set-cookie',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'idtoken',
  'jwt',
  'jwt_secret',
  'apikey',
  'api_key',
  'secret',
  'clientsecret',
  'client_secret',
  'verificationcode',
  'passwordresetcode',
  'resetcode',
  'otp',
  'ssn',
  'creditcard',
  'cardnumber',
  'cvv',
  'cvc',
  'bankaccount',
]);

const CREDIT_CARD = /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]+=*/gi;

/** Scrub secret-shaped substrings from a free-text string. */
export function redactString(value: string): string {
  return value
    .replace(BEARER, 'Bearer ' + REDACTED)
    .replace(CREDIT_CARD, '**CARD**')
    .replace(SSN, '**SSN**');
}

const MAX_DEPTH = 8;

/**
 * Return a redacted deep copy of `input`. Non-destructive (never mutates the caller's
 * object). Guards against circular references and runaway depth so it is always safe to
 * call inside a logger hook.
 */
export function redactValue<T>(input: T, seen = new WeakSet(), depth = 0): T {
  if (typeof input === 'string') {
    return redactString(input) as unknown as T;
  }

  if (input === null || typeof input !== 'object') {
    return input;
  }

  if (depth >= MAX_DEPTH || seen.has(input as object)) {
    return input;
  }
  seen.add(input as object);

  if (Array.isArray(input)) {
    return input.map((item) => redactValue(item, seen, depth + 1)) as unknown as T;
  }

  // Preserve special objects (Buffers, Dates, etc.) as-is rather than walking them.
  if (
    input instanceof Date ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(input))
  ) {
    return input;
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      out[key] = REDACTED;
    } else {
      out[key] = redactValue(val, seen, depth + 1);
    }
  }
  return out as unknown as T;
}
