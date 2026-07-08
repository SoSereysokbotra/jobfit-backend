// src/modules/auth/domain/entities/refresh-token.entity.ts
//
// Refresh token record. We NEVER store the raw token — only its SHA-256 hash — so a
// DB leak can't be replayed. Supports Flow 4 (rotation) and Flow 5 (logout).
//
// NOTE: maps to the prisma `RefreshToken` model; `tokenHash` is stored in the existing
// `token` column (which is unique). The infra repository handles that name mapping.

import { createHash } from 'crypto';

export interface RefreshTokenProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt?: Date;
}

export interface CreateRefreshTokenProps {
  id: string;
  userId: string;
  rawToken: string;
  expiresAt: Date;
}

export class RefreshTokenEntity {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;

  private constructor(props: Required<RefreshTokenProps>) {
    this.id = props.id;
    this.userId = props.userId;
    this.tokenHash = props.tokenHash;
    this.expiresAt = props.expiresAt;
    this.createdAt = props.createdAt;
  }

  /** SHA-256 hex digest of a raw token — the only form we persist/compare. */
  static hash(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  /** Create from a freshly issued raw token (hashes it for storage). */
  static create(props: CreateRefreshTokenProps): RefreshTokenEntity {
    return new RefreshTokenEntity({
      id: props.id,
      userId: props.userId,
      tokenHash: RefreshTokenEntity.hash(props.rawToken),
      expiresAt: props.expiresAt,
      createdAt: new Date(),
    });
  }

  static fromPersistence(raw: RefreshTokenProps): RefreshTokenEntity {
    return new RefreshTokenEntity({
      ...raw,
      createdAt: raw.createdAt ?? new Date(),
    });
  }

  toPersistence(): Required<RefreshTokenProps> {
    return {
      id: this.id,
      userId: this.userId,
      tokenHash: this.tokenHash,
      expiresAt: this.expiresAt,
      createdAt: this.createdAt,
    };
  }

  /** True once the token is past its expiry. */
  isExpired(now: Date = new Date()): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }

  /** Compare a raw token against the stored hash. */
  matches(rawToken: string): boolean {
    return RefreshTokenEntity.hash(rawToken) === this.tokenHash;
  }
}
