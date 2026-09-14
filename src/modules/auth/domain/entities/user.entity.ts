// src/modules/auth/domain/entities/user.entity.ts
//
// Auth aggregate root. Holds the state needed by Flows 1–6 (register, verify email,
// login, refresh, logout, password reset). Business rules that are *pure predicates*
// (code-expiry, password policy) live in AuthDomainService; this entity owns state
// transitions (mark verified, set/clear codes, change password).
//
// ⚠️ SCHEMA GAP: the current prisma/schema.prisma `User` model has none of
// `role`, `verificationCode`, `verificationCodeExpiry`, `passwordResetCode`,
// `passwordResetCodeExpiry`. The repository (infra) will need a migration adding these
// columns before it can persist this entity. `isVerified` maps to the existing
// `emailVerified` column.

import { SafeUser } from './safe-user.entity';

export type UserRole = 'JOB_SEEKER' | 'EMPLOYER' | 'ADMIN';

/**
 * Account lifecycle. Mirrors the Prisma UserStatus enum.
 *
 * SUPERSEDES `isActive`, which could not tell a reversible suspension from a permanent
 * close. `isActive` is still written alongside it so nothing reading the old column goes
 * stale, but `status` is what the login gate consults.
 */
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface UserProps {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  isVerified: boolean;
  verificationCode?: string | null;
  verificationCodeExpiry?: Date | null;
  passwordResetCode?: string | null;
  passwordResetCodeExpiry?: Date | null;
  isActive: boolean;
  /** See UserStatus. Optional so older callers constructing props still compile. */
  status?: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date | null;
  deletedAt?: Date | null;
  /**
   * Terms-of-service consent, as three facts that only mean something together: WHEN they
   * accepted, WHICH published version was in force, and the IP the act came from.
   *
   * All optional, and null is a real state — every account created before the audit trail
   * existed has no record, and that must read as "not known" rather than being quietly
   * back-filled. See the `users.termsAcceptedAt` column comment.
   */
  termsAcceptedAt?: Date | null;
  termsVersion?: string | null;
  termsAcceptedIp?: string | null;
}

export interface CreateUserProps {
  id: string;
  email: string;
  name?: string;
  passwordHash: string;
  role?: UserRole;
  /** Version of the Terms presented at registration, recorded as proof of consent. */
  termsVersion?: string | null;
  /** Originating IP of the registration request. */
  termsAcceptedIp?: string | null;
}

export class UserEntity {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  isVerified: boolean;
  verificationCode?: string | null;
  verificationCodeExpiry?: Date | null;
  passwordResetCode?: string | null;
  passwordResetCodeExpiry?: Date | null;
  isActive: boolean;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date | null;
  deletedAt?: Date | null;
  termsAcceptedAt?: Date | null;
  termsVersion?: string | null;
  termsAcceptedIp?: string | null;

  private constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email;
    this.name = props.name;
    this.passwordHash = props.passwordHash;
    this.role = props.role;
    this.isVerified = props.isVerified;
    this.verificationCode = props.verificationCode ?? null;
    this.verificationCodeExpiry = props.verificationCodeExpiry ?? null;
    this.passwordResetCode = props.passwordResetCode ?? null;
    this.passwordResetCodeExpiry = props.passwordResetCodeExpiry ?? null;
    this.isActive = props.isActive;
    // Falls back to isActive for any caller that predates the column, so an entity built
    // from a partial shape is never silently ACTIVE when the flag says otherwise.
    this.status = props.status ?? (props.isActive ? 'ACTIVE' : 'SUSPENDED');
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
    this.lastLogin = props.lastLogin ?? null;
    this.deletedAt = props.deletedAt ?? null;
    this.termsAcceptedAt = props.termsAcceptedAt ?? null;
    this.termsVersion = props.termsVersion ?? null;
    this.termsAcceptedIp = props.termsAcceptedIp ?? null;
  }

  /** New, unverified user (Flow 1 — Register). */
  static create(props: CreateUserProps): UserEntity {
    const now = new Date();
    return new UserEntity({
      id: props.id,
      email: props.email.toLowerCase().trim(),
      name: props.name ?? '',
      passwordHash: props.passwordHash,
      role: props.role ?? 'JOB_SEEKER',
      isVerified: false,
      verificationCode: null,
      verificationCodeExpiry: null,
      passwordResetCode: null,
      passwordResetCodeExpiry: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
      lastLogin: null,
      deletedAt: null,
      // Stamped only when a version was actually presented. A caller that supplies none
      // records no consent rather than a consent to nothing.
      termsAcceptedAt: props.termsVersion ? now : null,
      termsVersion: props.termsVersion ?? null,
      termsAcceptedIp: props.termsVersion ? (props.termsAcceptedIp ?? null) : null,
    });
  }

  static fromPersistence(raw: UserProps): UserEntity {
    return new UserEntity(raw);
  }

  toPersistence(): UserProps {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      passwordHash: this.passwordHash,
      role: this.role,
      isVerified: this.isVerified,
      verificationCode: this.verificationCode ?? null,
      verificationCodeExpiry: this.verificationCodeExpiry ?? null,
      passwordResetCode: this.passwordResetCode ?? null,
      passwordResetCodeExpiry: this.passwordResetCodeExpiry ?? null,
      isActive: this.isActive,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastLogin: this.lastLogin ?? null,
      deletedAt: this.deletedAt ?? null,
      termsAcceptedAt: this.termsAcceptedAt ?? null,
      termsVersion: this.termsVersion ?? null,
      termsAcceptedIp: this.termsAcceptedIp ?? null,
    };
  }

  /**
   * Record acceptance of a published Terms version.
   *
   * Called on re-registration too, because that path reuses an existing unverified row and
   * the person is agreeing again, now — to whatever version is in force now. Leaving the
   * old stamp would record consent to a document they may never have seen.
   */
  acceptTerms(version: string, ip?: string | null): void {
    this.termsAcceptedAt = new Date();
    this.termsVersion = version;
    this.termsAcceptedIp = ip ?? null;
  }

  // ----- State transitions (Flows 1–6) -----

  /** Flow 1/6b — attach a freshly generated verification/verification-resend code. */
  setVerificationCode(code: string, expiry: Date): void {
    this.verificationCode = code;
    this.verificationCodeExpiry = expiry;
    this.touch();
  }

  /** Flow 2 — email verified: mark verified and discard the code. */
  markVerified(): void {
    this.isVerified = true;
    this.verificationCode = null;
    this.verificationCodeExpiry = null;
    this.touch();
  }

  /** Flow 6a — request password reset: store the reset code. */
  setPasswordResetCode(code: string, expiry: Date): void {
    this.passwordResetCode = code;
    this.passwordResetCodeExpiry = expiry;
    this.touch();
  }

  clearPasswordResetCode(): void {
    this.passwordResetCode = null;
    this.passwordResetCodeExpiry = null;
    this.touch();
  }

  /** Flow 6b — reset password: set new hash and invalidate the reset code. */
  changePassword(newPasswordHash: string): void {
    this.passwordHash = newPasswordHash;
    this.clearPasswordResetCode();
    this.touch();
  }

  /** Flow 3 — successful login. */
  recordLogin(at: Date = new Date()): void {
    this.lastLogin = at;
    this.touch();
  }

  /**
   * Public projection with all secret fields stripped. Use this before caching under
   * `cache:user:entity:{userId}` or returning a user from a controller.
   */
  toSafe(): SafeUser {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      role: this.role,
      isVerified: this.isVerified,
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastLogin: this.lastLogin ?? null,
      deletedAt: this.deletedAt ?? null,
    };
  }

  private touch(): void {
    this.updatedAt = new Date();
  }
}
