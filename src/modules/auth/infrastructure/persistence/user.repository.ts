// src/modules/auth/infrastructure/persistence/user.repository.ts
//
// Prisma implementation of IUserRepository with cache-aside reads/writes (Redis).
//
// EXPLICIT MAPPINGS (do not rely on field-name coincidence — see toDomain/toPersistence):
//   • domain UserEntity.isVerified  <-> DB column `emailVerified`
//   • domain UserEntity.role        <-> DB column `role` (defaults to 'member' at DB level)
//
// Cache-aside:
//   • read  — check Redis, fall back to DB, populate cache on miss
//   • write — invalidate the relevant keys (entity + email lookup + safe entity)
//   All cache ops FAIL OPEN (Redis down => behave as a cache miss / skip invalidation);
//   the DB is always the source of truth.

import { Injectable, Logger } from '@nestjs/common';
import { Prisma, User as PrismaUser } from '@prisma/client';
import { PrismaService } from '../../../../shared/services/prisma.service';
import { RedisService } from '../../../../shared/services/redis.service';
import { UserEntity, UserProps } from '../../domain/entities/user.entity';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { CACHE_TTL, authCacheKeys } from './auth-cache.keys';

@Injectable()
export class UserRepository implements IUserRepository {
  private readonly logger = new Logger(UserRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async findById(id: string): Promise<UserEntity | null> {
    const cached = await this.cacheGet(authCacheKeys.authUserEntity(id));
    if (cached) {
      return UserEntity.fromPersistence(this.reviveUserProps(JSON.parse(cached)));
    }

    const row = await this.prisma.user.findUnique({ where: { id } });
    if (!row) return null;

    const user = this.toDomain(row);
    await this.populateCache(user);
    return user;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const normEmail = this.normalizeEmail(email);
    const lookupKey = authCacheKeys.authUserEmailLookup(normEmail);

    const cachedId = await this.cacheGet(lookupKey);
    if (cachedId) {
      const byId = await this.findById(cachedId);
      if (byId) return byId;
      // Stale lookup pointing at a missing entity — fall through to DB.
    }

    const row = await this.prisma.user.findUnique({ where: { email: normEmail } });
    if (!row) return null;

    const user = this.toDomain(row);
    await this.populateCache(user);
    await this.cacheSet(lookupKey, user.id, CACHE_TTL.USER_EMAIL_LOOKUP_SECONDS);
    return user;
  }

  // Code lookups are not cached (codes are short-lived and change frequently).
  async findByVerificationCode(code: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findFirst({
      where: { verificationCode: code },
    });
    return row ? this.toDomain(row) : null;
  }

  async findByPasswordResetCode(code: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findFirst({
      where: { passwordResetCode: code },
    });
    return row ? this.toDomain(row) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const row = await this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
      select: { id: true },
    });
    return row !== null;
  }

  async save(user: UserEntity): Promise<void> {
    const data = this.toPersistence(user);
    await this.prisma.user.upsert({
      where: { id: user.id },
      // createdAt only set on insert; updatedAt is managed by Prisma's @updatedAt.
      create: { id: user.id, createdAt: user.createdAt, ...data },
      update: data,
    });
    // Invalidate rather than repopulate — next read re-warms from the fresh DB row.
    await this.invalidate(user.id, this.normalizeEmail(user.email));
  }

  async resetPassword(user: UserEntity): Promise<void> {
    const data = this.toPersistence(user); // includes new passwordHash + cleared reset code
    // Atomic: update the user AND wipe all of their refresh tokens in one transaction.
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data }),
      this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
    ]);
    // Invalidate user caches + every refresh cache key for this user.
    await this.invalidate(user.id, this.normalizeEmail(user.email));
    try {
      await this.redis.deleteByPrefix(authCacheKeys.refreshUserPrefix(user.id));
    } catch (err) {
      this.logger.warn(`refresh cache invalidation failed: ${(err as Error).message}`);
    }
  }

  // ----- Cache helpers (all fail open) -----

  /** Warm the full auth entity + the safe (public) entity caches. */
  private async populateCache(user: UserEntity): Promise<void> {
    await this.cacheSet(
      authCacheKeys.authUserEntity(user.id),
      JSON.stringify(user.toPersistence()),
      CACHE_TTL.USER_ENTITY_SECONDS,
    );
    // Safe projection strips secrets BEFORE caching under cache:user:entity:{userId}.
    await this.cacheSet(
      authCacheKeys.safeUserEntity(user.id),
      JSON.stringify(user.toSafe()),
      CACHE_TTL.SAFE_USER_ENTITY_SECONDS,
    );
  }

  private async invalidate(userId: string, email: string): Promise<void> {
    await this.cacheDel(
      authCacheKeys.authUserEntity(userId),
      authCacheKeys.safeUserEntity(userId),
      authCacheKeys.authUserEmailLookup(email),
    );
  }

  private async cacheGet(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (err) {
      this.logger.warn(`cache get failed (${key}) — treating as miss: ${(err as Error).message}`);
      return null;
    }
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

  // ----- Mappers -----

  private toDomain(row: PrismaUser): UserEntity {
    const props: UserProps = {
      id: row.id,
      email: row.email,
      name: row.name,
      passwordHash: row.passwordHash,
      role: row.role,
      // DB `emailVerified` -> domain `isVerified`
      isVerified: row.emailVerified,
      verificationCode: row.verificationCode,
      verificationCodeExpiry: row.verificationCodeExpiry,
      passwordResetCode: row.passwordResetCode,
      passwordResetCodeExpiry: row.passwordResetCodeExpiry,
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastLogin: row.lastLogin,
      deletedAt: row.deletedAt,
    };
    return UserEntity.fromPersistence(props);
  }

  /** Mutable columns written on both insert and update (excludes id/createdAt/updatedAt). */
  private toPersistence(
    user: UserEntity,
  ): Omit<Prisma.UserUncheckedCreateInput, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      email: this.normalizeEmail(user.email),
      name: user.name,
      passwordHash: user.passwordHash,
      role: user.role,
      // domain `isVerified` -> DB `emailVerified`
      emailVerified: user.isVerified,
      verificationCode: user.verificationCode ?? null,
      verificationCodeExpiry: user.verificationCodeExpiry ?? null,
      passwordResetCode: user.passwordResetCode ?? null,
      passwordResetCodeExpiry: user.passwordResetCodeExpiry ?? null,
      isActive: user.isActive,
      lastLogin: user.lastLogin ?? null,
      deletedAt: user.deletedAt ?? null,
    };
  }

  /** JSON round-trips Dates to ISO strings — revive them back to Date objects. */
  private reviveUserProps(parsed: Record<string, unknown>): UserProps {
    const toDate = (v: unknown): Date | null =>
      v == null ? null : new Date(v as string);
    return {
      ...(parsed as unknown as UserProps),
      verificationCodeExpiry: toDate(parsed.verificationCodeExpiry),
      passwordResetCodeExpiry: toDate(parsed.passwordResetCodeExpiry),
      createdAt: new Date(parsed.createdAt as string),
      updatedAt: new Date(parsed.updatedAt as string),
      lastLogin: toDate(parsed.lastLogin),
      deletedAt: toDate(parsed.deletedAt),
    };
  }

  private normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }
}
