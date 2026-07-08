// src/modules/auth/domain/services/auth.domain.service.ts
//
// PURE domain rules for auth. No Redis, no repositories, no I/O — every method is a
// deterministic function of its inputs (except generateNumericCode, which draws secure
// randomness). This keeps the business rules trivially unit-testable. Infrastructure
// concerns (blacklist, lockout) are accessed by the *application* layer through the
// ports in this folder, not from here.

import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { UserEntity } from '../entities/user.entity';

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
}

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

// ⚠️ PLACEHOLDER POLICY: the "Authentication System" doc wasn't provided, so these are
// sensible defaults. maxLength is 72 because bcrypt silently truncates beyond 72 bytes.
export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  maxLength: 72,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
};

@Injectable()
export class AuthDomainService {
  // Field default (not a constructor param) so NestJS DI has nothing to resolve here —
  // AuthDomainService stays a zero-dependency, purely functional provider.
  private readonly passwordPolicy: PasswordPolicy = DEFAULT_PASSWORD_POLICY;

  // ----- Code expiry -----

  /**
   * True if a code is expired or has no expiry set. A null/undefined expiry is treated
   * as "not valid" (expired) — there is nothing to trust.
   */
  isCodeExpired(
    expiry: Date | null | undefined,
    now: Date = new Date(),
  ): boolean {
    if (!expiry) return true;
    return expiry.getTime() <= now.getTime();
  }

  /** A code is valid iff it matches the stored code AND is not expired. */
  isCodeValid(
    storedCode: string | null | undefined,
    expiry: Date | null | undefined,
    providedCode: string,
    now: Date = new Date(),
  ): boolean {
    if (!storedCode || !providedCode) return false;
    if (storedCode !== providedCode) return false;
    return !this.isCodeExpired(expiry, now);
  }

  /** Flow 2 — is the supplied email-verification code valid for this user? */
  isVerificationCodeValid(
    user: UserEntity,
    providedCode: string,
    now: Date = new Date(),
  ): boolean {
    return this.isCodeValid(
      user.verificationCode,
      user.verificationCodeExpiry,
      providedCode,
      now,
    );
  }

  /** Flow 6 — is the supplied password-reset code valid for this user? */
  isPasswordResetCodeValid(
    user: UserEntity,
    providedCode: string,
    now: Date = new Date(),
  ): boolean {
    return this.isCodeValid(
      user.passwordResetCode,
      user.passwordResetCodeExpiry,
      providedCode,
      now,
    );
  }

  /** Compute an expiry `ttlMinutes` from a base time (default now). */
  computeExpiry(ttlMinutes: number, from: Date = new Date()): Date {
    return new Date(from.getTime() + ttlMinutes * 60 * 1000);
  }

  // ----- Password policy -----

  validatePasswordPolicy(plain: string): PasswordPolicyResult {
    const errors: string[] = [];
    const policy = this.passwordPolicy;

    if (typeof plain !== 'string' || plain.length < policy.minLength) {
      errors.push(
        `Password must be at least ${policy.minLength} characters long`,
      );
    }
    if (typeof plain === 'string' && plain.length > policy.maxLength) {
      errors.push(
        `Password must be at most ${policy.maxLength} characters long`,
      );
    }
    if (policy.requireUppercase && !/[A-Z]/.test(plain)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (policy.requireLowercase && !/[a-z]/.test(plain)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (policy.requireNumber && !/[0-9]/.test(plain)) {
      errors.push('Password must contain at least one number');
    }

    return { valid: errors.length === 0, errors };
  }

  isPasswordValid(plain: string): boolean {
    return this.validatePasswordPolicy(plain).valid;
  }

  // ----- Code generation -----

  /** Secure zero-padded numeric code (default 6 digits) for verification/reset. */
  generateNumericCode(length = 6): string {
    const max = 10 ** length;
    return randomInt(0, max)
      .toString()
      .padStart(length, '0');
  }
}
