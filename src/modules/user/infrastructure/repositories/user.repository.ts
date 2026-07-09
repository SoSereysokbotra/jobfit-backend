// src/modules/user/infrastructure/repositories/user.repository.ts
//
// Prisma-backed persistence for the User aggregate. Implements IRepository<User> and adds
// User-specific finders. Always maps rows back to the domain `User` entity (never returns
// Prisma models). Soft delete: delete() sets deletedAt; findAll() excludes deleted rows.
//
// NOTE: the docs' repository also has `supabaseId` + `findBySupabaseId()` (Supabase Auth).
// This project uses self-managed JWT auth and the `users` table has no `supabaseId`
// column, so both are intentionally omitted here.

import { Injectable } from '@nestjs/common';
import { $Enums, User as PrismaUser } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { IRepository } from '@common/abstracts/repository';
import { User } from '../../domain/entities/user.entity';
import { UserRole } from '@shared/kernel/enums/user-role.enum';
import { SubscriptionTier } from '@shared/kernel/enums/subscription-tier.enum';

@Injectable()
export class UserRepository implements IRepository<User> {
  constructor(private readonly prisma: PrismaService) {}

  /** Insert or update the aggregate (by id). */
  async save(user: User): Promise<void> {
    await this.prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        role: user.role as $Enums.UserRole,
        subscriptionTier: user.subscriptionTier as $Enums.SubscriptionTier,
        updatedAt: user.updatedAt,
      },
      create: {
        id: user.id,
        email: user.email,
        role: user.role as $Enums.UserRole,
        subscriptionTier: user.subscriptionTier as $Enums.SubscriptionTier,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  }

  async findById(id: string): Promise<User | null> {
    const data = await this.prisma.user.findUnique({ where: { id } });
    return data ? this.mapToDomain(data) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const data = await this.prisma.user.findUnique({ where: { email } });
    return data ? this.mapToDomain(data) : null;
  }

  /** List non-deleted users, newest first, paginated. */
  async findAll(skip = 0, take = 20): Promise<User[]> {
    const rows = await this.prisma.user.findMany({
      where: { deletedAt: null },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.mapToDomain(row));
  }

  /** Soft delete — sets deletedAt. */
  async delete(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Map a Prisma row to the domain User entity. */
  private mapToDomain(raw: PrismaUser): User {
    return new User(
      {
        email: raw.email,
        role: raw.role as UserRole,
        subscriptionTier: raw.subscriptionTier as SubscriptionTier,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      raw.id,
    );
  }
}
