// src/modules/auth/application/errors/auth.errors.ts
//
// Domain-specific auth errors. Each carries a stable `code` string; a later exception
// filter maps `code` -> HTTP status. Handlers throw these instead of HttpExceptions so
// the application layer stays transport-agnostic.

export abstract class AuthError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Wrong email/password. Deliberately vague to avoid revealing which was wrong. */
export class InvalidCredentialsError extends AuthError {
  readonly code = 'INVALID_CREDENTIALS';
  constructor(message = 'Invalid email or password') {
    super(message);
  }
}

/** Account or IP is temporarily locked out after too many failed logins. */
export class LoginBlockedError extends AuthError {
  readonly code = 'LOGIN_BLOCKED';
  constructor(message = 'Too many failed attempts. Please try again later.') {
    super(message);
  }
}

/** Login attempted on an account whose email has not been verified. */
export class EmailNotVerifiedError extends AuthError {
  readonly code = 'EMAIL_NOT_VERIFIED';
  constructor(message = 'Email address has not been verified') {
    super(message);
  }
}

/** Registration attempted for an email that already exists and is verified. */
export class EmailAlreadyRegisteredError extends AuthError {
  readonly code = 'EMAIL_ALREADY_REGISTERED';
  constructor(message = 'An account with this email already exists') {
    super(message);
  }
}

/** The email is already verified (e.g. verifying twice). */
export class EmailAlreadyVerifiedError extends AuthError {
  readonly code = 'EMAIL_ALREADY_VERIFIED';
  constructor(message = 'Email address is already verified') {
    super(message);
  }
}

/** Provided verification/reset code does not match. */
export class InvalidCodeError extends AuthError {
  readonly code = 'INVALID_CODE';
  constructor(message = 'Invalid or incorrect code') {
    super(message);
  }
}

/** Code matched but has expired (TTL passed). */
export class CodeExpiredError extends AuthError {
  readonly code = 'CODE_EXPIRED';
  constructor(message = 'The code has expired. Please request a new one.') {
    super(message);
  }
}

/** New password fails the password policy. Carries the individual violations. */
export class WeakPasswordError extends AuthError {
  readonly code = 'WEAK_PASSWORD';
  constructor(public readonly violations: string[]) {
    super(`Password does not meet policy: ${violations.join('; ')}`);
  }
}

/** Refresh token is missing, malformed, unknown, or naturally expired. */
export class InvalidRefreshTokenError extends AuthError {
  readonly code = 'INVALID_REFRESH_TOKEN';
  constructor(message = 'Invalid or expired refresh token') {
    super(message);
  }
}

/**
 * An already-rotated (spent) refresh token was replayed — likely token theft. All of
 * the user's sessions are revoked as a response. Distinct from InvalidRefreshTokenError
 * so the exception filter can log/alert on it as a security event, not routine noise.
 */
export class RefreshTokenReuseDetectedError extends AuthError {
  readonly code = 'REFRESH_TOKEN_REUSE_DETECTED';
  constructor(
    message = 'Refresh token reuse detected — all sessions have been revoked',
  ) {
    super(message);
  }
}

/** Expected user not found (e.g. reset-password session references a missing account). */
export class UserNotFoundError extends AuthError {
  readonly code = 'USER_NOT_FOUND';
  constructor(message = 'User not found') {
    super(message);
  }
}
