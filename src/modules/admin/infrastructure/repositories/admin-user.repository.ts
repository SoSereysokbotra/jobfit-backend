// src/modules/admin/infrastructure/repositories/admin-user.repository.ts
//
// Admin-facing read/write access to the `users` table. This is intentionally separate
// from the auth/user domain repositories: the admin dashboard needs a richer projection
// (name, lastLogin, verification/active flags, related counts) than those minimal
// aggregates expose, and only ever touches non-secret columns.

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { RedisService } from '@shared/services/redis.service';
import { authCacheKeys } from '@modules/auth/infrastructure/persistence/auth-cache.keys';

/**
 * The address a deleted account's email is moved to.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, so a tombstone can never
 * collide with a real user's address and can never receive mail. The user id keeps every
 * tombstone unique, which matters because `users.email` is @unique — a fixed placeholder
 * would let exactly one account be deleted.
 */
function tombstoneEmail(userId: string): string {
  return `deleted+${userId}@deleted.invalid`;
}

// Non-secret user columns the admin surface is allowed to read.
const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  emailVerified: true,
  lastLogin: true,
  createdAt: true,
  deletedAt: true,
} satisfies Prisma.UserSelect;

export type AdminUserRow = Prisma.UserGetPayload<{
  select: typeof ADMIN_USER_SELECT;
}>;

@Injectable()
export class AdminUserRepository {
  private readonly logger = new Logger(AdminUserRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Search users by email / name substrings and signup date range. */
  search(params: {
    email?: string;
    name?: string;
    signupFrom?: Date;
    signupTo?: Date;
    skip: number;
    take: number;
  }): Promise<AdminUserRow[]> {
    return this.prisma.user.findMany({
      where: this.buildWhere(params),
      select: ADMIN_USER_SELECT,
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(params: {
    email?: string;
    name?: string;
    signupFrom?: Date;
    signupTo?: Date;
  }): Promise<number> {
    return this.prisma.user.count({ where: this.buildWhere(params) });
  }

  findById(id: string): Promise<AdminUserRow | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: ADMIN_USER_SELECT,
    });
  }

  /** email is needed for the reset-password / unlock flows (both keyed by email). */
  findEmailById(
    id: string,
  ): Promise<{ email: string; deletedAt: Date | null } | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { email: true, deletedAt: true },
    });
  }

  countApplications(userId: string): Promise<number> {
    return this.prisma.application.count({
      where: { userId, deletedAt: null },
    });
  }

  countResumes(userId: string): Promise<number> {
    return this.prisma.resume.count({
      where: { userId, deletedAt: null },
    });
  }

  /** GDPR soft delete: mark deleted and deactivate. Idempotent-safe via updateMany. */
  /**
   * GDPR soft delete — and it RELEASES THE EMAIL.
   *
   * Setting `deletedAt` alone left the address occupied by a row nobody could log into,
   * so the user could never register again (MENTOR_REVIEW_2026-08-18 §14). That dead end
   * is what pushed people to hard-delete through the Supabase console, and a hard delete
   * cascades to `match_labels` — the documented cause of 50 hand-labelled evaluation
   * pairs being lost. Freeing the address here removes the reason to reach for the
   * console.
   *
   * The original goes to `deletedEmail` rather than being discarded, so support can still
   * answer "what happened to my account".
   */
  async softDelete(id: string): Promise<boolean> {
    // Read first: the tombstone must not overwrite an ALREADY-saved original if this
    // somehow runs twice, and `updateMany` cannot copy a column onto another column.
    const existing = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { email: true },
    });
    if (!existing) return false;

    const result = await this.prisma.user.updateMany({
      where: { id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        isActive: false,
        email: tombstoneEmail(id),
        deletedEmail: existing.email,
      },
    });
    if (result.count === 0) return false;

    // The auth repository caches the user entity and an email→id lookup for 300s, and it
    // is a DIFFERENT repository that knows nothing about this write. Without this, a
    // just-deleted user could still log in until those keys expired.
    await this.invalidateAuthCache(id, existing.email);
    return true;
  }

  /** Best-effort: a cache failure must not make the deletion itself fail. */
  private async invalidateAuthCache(userId: string, email: string): Promise<void> {
    try {
      const keys = [
        authCacheKeys.authUserEntity(userId),
        authCacheKeys.safeUserEntity(userId),
        authCacheKeys.authUserEmailLookup(email.toLowerCase().trim()),
      ];
      await Promise.all(keys.map((key) => this.redis.del(key)));
    } catch (err) {
      // Logged loudly: the account IS deleted, but a stale cache means it can still
      // authenticate for up to the TTL, which is a security-relevant window.
      this.logger.error(
        `Auth cache invalidation failed after deleting ${userId} — the account may still ` +
          `authenticate for up to 300s: ${(err as Error).message}`,
      );
    }
  }

  private buildWhere(params: {
    email?: string;
    name?: string;
    signupFrom?: Date;
    signupTo?: Date;
  }): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {};
    if (params.email) {
      where.email = { contains: params.email, mode: 'insensitive' };
    }
    if (params.name) {
      where.name = { contains: params.name, mode: 'insensitive' };
    }
    if (params.signupFrom || params.signupTo) {
      where.createdAt = {};
      if (params.signupFrom) where.createdAt.gte = params.signupFrom;
      if (params.signupTo) where.createdAt.lte = params.signupTo;
    }
    return where;
  }
}
