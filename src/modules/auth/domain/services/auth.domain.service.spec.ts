// src/modules/auth/domain/services/auth.domain.service.spec.ts

import { AuthDomainService } from './auth.domain.service';
import { UserEntity } from '../entities/user.entity';

describe('AuthDomainService', () => {
  let service: AuthDomainService;

  beforeEach(() => {
    service = new AuthDomainService();
  });

  const makeUser = (): UserEntity =>
    UserEntity.create({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hashed',
    });

  // ---------------------------------------------------------------------------
  // Code expiry logic
  // ---------------------------------------------------------------------------
  describe('isCodeExpired', () => {
    const now = new Date('2026-01-01T12:00:00Z');

    it('treats a null/undefined expiry as expired', () => {
      expect(service.isCodeExpired(null, now)).toBe(true);
      expect(service.isCodeExpired(undefined, now)).toBe(true);
    });

    it('returns true for a past expiry', () => {
      const past = new Date(now.getTime() - 60 * 1000);
      expect(service.isCodeExpired(past, now)).toBe(true);
    });

    it('returns false for a future expiry', () => {
      const future = new Date(now.getTime() + 60 * 1000);
      expect(service.isCodeExpired(future, now)).toBe(false);
    });

    it('treats an expiry exactly at "now" as expired (inclusive boundary)', () => {
      expect(service.isCodeExpired(new Date(now.getTime()), now)).toBe(true);
    });
  });

  describe('isCodeValid', () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const future = new Date(now.getTime() + 5 * 60 * 1000);
    const past = new Date(now.getTime() - 5 * 60 * 1000);

    it('is valid when code matches and is not expired', () => {
      expect(service.isCodeValid('123456', future, '123456', now)).toBe(true);
    });

    it('is invalid when the code does not match', () => {
      expect(service.isCodeValid('123456', future, '000000', now)).toBe(false);
    });

    it('is invalid when the matching code is expired', () => {
      expect(service.isCodeValid('123456', past, '123456', now)).toBe(false);
    });

    it('is invalid when no code is stored', () => {
      expect(service.isCodeValid(null, future, '123456', now)).toBe(false);
    });

    it('is invalid when no code is provided', () => {
      expect(service.isCodeValid('123456', future, '', now)).toBe(false);
    });
  });

  describe('isVerificationCodeValid / isPasswordResetCodeValid', () => {
    const now = new Date('2026-01-01T12:00:00Z');

    it('validates a verification code against the user state', () => {
      const user = makeUser();
      user.setVerificationCode('654321', new Date(now.getTime() + 60_000));

      expect(service.isVerificationCodeValid(user, '654321', now)).toBe(true);
      expect(service.isVerificationCodeValid(user, '111111', now)).toBe(false);
    });

    it('rejects an expired verification code', () => {
      const user = makeUser();
      user.setVerificationCode('654321', new Date(now.getTime() - 1));
      expect(service.isVerificationCodeValid(user, '654321', now)).toBe(false);
    });

    it('validates a password-reset code against the user state', () => {
      const user = makeUser();
      user.setPasswordResetCode('999000', new Date(now.getTime() + 60_000));

      expect(service.isPasswordResetCodeValid(user, '999000', now)).toBe(true);
      expect(service.isPasswordResetCodeValid(user, '999001', now)).toBe(false);
    });
  });

  describe('computeExpiry', () => {
    it('adds the given minutes to the base time', () => {
      const from = new Date('2026-01-01T12:00:00Z');
      const expiry = service.computeExpiry(15, from);
      expect(expiry.getTime()).toBe(from.getTime() + 15 * 60 * 1000);
    });
  });

  // ---------------------------------------------------------------------------
  // Password policy validation
  // ---------------------------------------------------------------------------
  describe('validatePasswordPolicy', () => {
    it('accepts a strong password', () => {
      const result = service.validatePasswordPolicy('Str0ngPass');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(service.isPasswordValid('Str0ngPass')).toBe(true);
    });

    it('rejects a password that is too short', () => {
      const result = service.validatePasswordPolicy('Ab1');
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('at least 8')]),
      );
    });

    it('rejects a password with no uppercase letter', () => {
      const result = service.validatePasswordPolicy('lowercase1');
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('uppercase')]),
      );
    });

    it('rejects a password with no lowercase letter', () => {
      const result = service.validatePasswordPolicy('UPPERCASE1');
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('lowercase')]),
      );
    });

    it('rejects a password with no number', () => {
      const result = service.validatePasswordPolicy('NoNumbersHere');
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('number')]),
      );
    });

    it('rejects a password longer than 72 characters (bcrypt limit)', () => {
      const result = service.validatePasswordPolicy('A1' + 'a'.repeat(80));
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining('at most 72')]),
      );
    });

    it('collects multiple violations at once', () => {
      const result = service.validatePasswordPolicy('abc');
      expect(result.valid).toBe(false);
      // too short + no uppercase + no number
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Code generation
  // ---------------------------------------------------------------------------
  describe('generateNumericCode', () => {
    it('generates a zero-padded numeric code of the requested length', () => {
      for (let i = 0; i < 50; i++) {
        const code = service.generateNumericCode(6);
        expect(code).toMatch(/^\d{6}$/);
      }
    });
  });
});
