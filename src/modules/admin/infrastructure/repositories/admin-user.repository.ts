// src/modules/admin/infrastructure/repositories/admin-user.repository.ts
//
// Admin-facing read/write access to the `users` table. This is intentionally separate
// from the auth/user domain repositories: the admin dashboard needs a richer projection
// (name, lastLogin, verification/active flags, related counts) than those minimal
// aggregates expose, and only ever touches non-secret columns.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
  async softDelete(id: string): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), isActive: false },
    });
    return result.count > 0;
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
