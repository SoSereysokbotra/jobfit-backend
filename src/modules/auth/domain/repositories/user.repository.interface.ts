// src/modules/auth/domain/repositories/user.repository.interface.ts
//
// Domain port for user persistence. Infrastructure (Prisma) implements it.
// Lookups by verification/reset code support Flows 2 and 6.

import { UserEntity } from '../entities/user.entity';

export interface IUserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findByVerificationCode(code: string): Promise<UserEntity | null>;
  findByPasswordResetCode(code: string): Promise<UserEntity | null>;
  existsByEmail(email: string): Promise<boolean>;
  /** Upsert (create or update) the user aggregate. */
  save(user: UserEntity): Promise<void>;
  /**
   * Flow 3/6 — atomically persist the user's new password (+ cleared reset code) AND
   * delete all of their refresh tokens, in a single DB transaction. Revokes every
   * session on password reset.
   */
  resetPassword(user: UserEntity): Promise<void>;
}

export const USER_REPOSITORY = Symbol('IUserRepository');
