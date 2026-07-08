// src/modules/auth/domain/value-objects/password.value-object.ts
//
// Value object wrapping a bcrypt password hash. It ONLY hashes/compares — password
// POLICY (length, character classes) lives in AuthDomainService, kept separate so the
// policy is pure/synchronous and trivially unit-testable without bcrypt.

import * as bcrypt from 'bcryptjs';

export class Password {
  private static readonly SALT_ROUNDS = 12;

  private constructor(private readonly hashed: string) {}

  /** Hash a plaintext password into a Password VO. */
  static async fromPlain(plain: string): Promise<Password> {
    const hash = await bcrypt.hash(plain, Password.SALT_ROUNDS);
    return new Password(hash);
  }

  /** Rehydrate from an already-hashed value (e.g. loaded from the DB). */
  static fromHash(hash: string): Password {
    return new Password(hash);
  }

  /** The bcrypt hash — safe to persist. */
  get value(): string {
    return this.hashed;
  }

  /** Constant-time comparison of a plaintext candidate against this hash. */
  async compare(plain: string): Promise<boolean> {
    return bcrypt.compare(plain, this.hashed);
  }
}
