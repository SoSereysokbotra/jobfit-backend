// src/modules/auth/domain/repositories/refresh-token.repository.interface.ts
//
// Domain port for refresh-token persistence. Infrastructure (Prisma) implements it.
// findByHash + deleteById drive rotation (Flow 4); deleteAllForUser drives logout /
// "log out everywhere" (Flow 5).

import { RefreshTokenEntity } from '../entities/refresh-token.entity';

/**
 * Outcome of an attempted single-use rotation:
 *  - 'rotated'   — a live token was found, soft-revoked, and replaced.
 *  - 'reuse'     — no live token, but the hash exists as an already-revoked (spent)
 *                  row → replay of a rotated token → THEFT. Caller should revoke all
 *                  sessions and surface RefreshTokenReuseDetectedError.
 *  - 'not_found' — the hash isn't present at all (garbage / naturally expired-and-gone)
 *                  → routine invalid refresh.
 */
export type RotateOutcome = 'rotated' | 'reuse' | 'not_found';

export interface IRefreshTokenRepository {
  save(token: RefreshTokenEntity): Promise<void>;
  /** Live tokens only (revokedAt IS NULL). */
  findByHash(tokenHash: string): Promise<RefreshTokenEntity | null>;
  deleteById(id: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
  /**
   * Flow 5 — single-use rotation with theft detection. Looks up the LIVE token by
   * (hash, userId); atomically soft-revokes it (sets revokedAt) and creates the new
   * token. Distinguishes reuse-of-spent-token from never-existed (see RotateOutcome).
   */
  rotate(
    oldTokenHash: string,
    userId: string,
    newToken: RefreshTokenEntity,
  ): Promise<RotateOutcome>;
}

export const REFRESH_TOKEN_REPOSITORY = Symbol('IRefreshTokenRepository');
