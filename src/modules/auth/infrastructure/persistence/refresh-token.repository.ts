// src/modules/auth/infrastructure/persistence/refresh-token.repository.ts
//
// Prisma implementation of IRefreshTokenRepository with cache-aside (Redis).
//
// EXPLICIT MAPPING: domain RefreshTokenEntity.tokenHash <-> DB column `tokenHash`
// (renamed from `token` in migration 20260707193055_auth_strong_flows). The column
// stores a SHA-256 hash only; plaintext is never seen here.
//
// Cache TTL = the token's remaining lifetime. All cache ops FAIL OPEN.
//
// NOTE on findByHash: the spec's refresh caches are userId-scoped
// (`cache:auth:refresh:user:{userId}:lookup:{hash}`), but this interface receives only
// the hash — the userId isn't known until the row is read. So findByHash reads the DB
// (unique-indexed, cheap) and then warms the userId-scoped caches for subsequent
// entity reads / invalidation. Cache-first-by-hash isn't possible without the userId.

import { Injectable, Logger } from '@nestjs/common';
import { RefreshToken as PrismaRefreshToken } from '@prisma/client';
import { PrismaService } from '../../../../shared/services/prisma.service';
import { RedisService } from '../../../../shared/services/redis.service';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import {
  IRefreshTokenRepository,
  RotateOutcome,
} from '../../domain/repositories/refresh-token.repository.interface';
import { authCacheKeys } from './auth-cache.keys';

@Injectable()
export class RefreshTokenRepository implements IRefreshTokenRepository {
  private readonly logger = new Logger(RefreshTokenRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async save(token: RefreshTokenEntity): Promise<void> {
    const data = this.toPersistence(token);
    await this.prisma.refreshToken.upsert({
      where: { id: token.id },
      create: { id: token.id, createdAt: token.createdAt, ...data },
      update: data,
    });
    await this.cacheToken(token);
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenEntity | null> {
    // Live tokens only — a revoked (soft-deleted) row must never be treated as valid.
    const row = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
    });
    if (!row) return null;

    const token = this.toDomain(row);
    await this.cacheToken(token); // warm caches for later entity reads / invalidation
    return token;
  }

  /**
   * Idempotent delete (no throw if the row is already gone — supports rotation races).
   * Reads the row first so the userId-scoped cache keys can be invalidated.
   */
  async deleteById(id: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({ where: { id } });
    await this.prisma.refreshToken.deleteMany({ where: { id } });
    if (row) {
      await this.cacheDel(
        authCacheKeys.refreshEntity(row.userId, row.id),
        authCacheKeys.refreshLookup(row.userId, row.tokenHash),
      );
    }
  }

  async deleteAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    // Prefix-scan invalidation of every refresh cache key for this user.
    await this.cacheDelByPrefix(authCacheKeys.refreshUserPrefix(userId));
  }

  async rotate(
    oldTokenHash: string,
    userId: string,
    newToken: RefreshTokenEntity,
  ): Promise<RotateOutcome> {
    const data = this.toPersistence(newToken);
    let oldTokenId: string | undefined;

    // Atomic soft-revoke-old + create-new, with theft detection on a lookup miss.
    const outcome = await this.prisma.$transaction<RotateOutcome>(async (tx) => {
      const live = await tx.refreshToken.findFirst({
        where: { tokenHash: oldTokenHash, userId, revokedAt: null },
        select: { id: true },
      });

      if (!live) {
        // No LIVE token. Was this hash already spent (revoked)? -> reuse/theft.
        const spent = await tx.refreshToken.findFirst({
          where: { tokenHash: oldTokenHash, userId, revokedAt: { not: null } },
          select: { id: true },
        });
        return spent ? 'reuse' : 'not_found';
      }

      oldTokenId = live.id;
      await tx.refreshToken.update({
        where: { id: live.id },
        data: { revokedAt: new Date() }, // soft-delete (kept for reuse detection)
      });
      await tx.refreshToken.create({
        data: { id: newToken.id, createdAt: newToken.createdAt, ...data },
      });
      return 'rotated';
    });

    if (outcome === 'rotated' && oldTokenId) {
      await this.cacheDel(
        authCacheKeys.refreshEntity(userId, oldTokenId),
        authCacheKeys.refreshLookup(userId, oldTokenHash),
      );
      await this.cacheToken(newToken);
    }
    return outcome;
  }

  // ----- Cache helpers (all fail open) -----

  private async cacheToken(token: RefreshTokenEntity): Promise<void> {
    const ttl = this.secondsUntil(token.expiresAt);
    if (ttl <= 0) return; // already expired — nothing worth caching
    await this.cacheSet(
      authCacheKeys.refreshEntity(token.userId, token.id),
      JSON.stringify(token.toPersistence()),
      ttl,
    );
    await this.cacheSet(
      authCacheKeys.refreshLookup(token.userId, token.tokenHash),
      token.id,
      ttl,
    );
  }

  private secondsUntil(date: Date): number {
    return Math.floor((date.getTime() - Date.now()) / 1000);
  }

  private async cacheSet(key: string, value: string, ttl: number): Promise<void> {
    try {
      await this.redis.set(key, value, ttl);
    } catch (err) {
      this.logger.warn(`cache set failed (${key}): ${(err as Error).message}`);
    }
  }

  private async cacheDel(...keys: string[]): Promise<void> {
    try {
      await Promise.all(keys.map((k) => this.redis.del(k)));
    } catch (err) {
      this.logger.warn(`cache invalidation failed: ${(err as Error).message}`);
    }
  }

  private async cacheDelByPrefix(prefix: string): Promise<void> {
    try {
      await this.redis.deleteByPrefix(prefix);
    } catch (err) {
      this.logger.warn(`prefix cache invalidation failed (${prefix}): ${(err as Error).message}`);
    }
  }

  // ----- Mappers -----

  private toDomain(row: PrismaRefreshToken): RefreshTokenEntity {
    return RefreshTokenEntity.fromPersistence({
      id: row.id,
      userId: row.userId,
      // DB `tokenHash` -> domain `tokenHash` (SHA-256, never plaintext)
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt,
      createdAt: row.createdAt,
    });
  }

  private toPersistence(token: RefreshTokenEntity): {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  } {
    return {
      userId: token.userId,
      // domain `tokenHash` -> DB `tokenHash`
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
    };
  }
}
