// src/modules/user/infrastructure/repositories/user-analytics.repository.ts
//
// Prisma-backed persistence for the UserAnalytics entity (1:1 with User). The derived
// acceptance rates are stored as computed by the domain entity. Soft delete via deletedAt.

import { Injectable } from '@nestjs/common';
import { UserAnalytics as PrismaUserAnalytics } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { UserAnalytics } from '../../domain/entities/user-analytics.entity';

@Injectable()
export class UserAnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(analytics: UserAnalytics): Promise<void> {
    const fields = {
      totalApplications: analytics.totalApplications,
      totalInterviews: analytics.totalInterviews,
      totalOffers: analytics.totalOffers,
      applicationAcceptanceRate: analytics.applicationAcceptanceRate,
      interviewAcceptanceRate: analytics.interviewAcceptanceRate,
      profileViewCount: analytics.profileViewCount,
      lastProfileViewDate: analytics.lastProfileViewDate ?? null,
      updatedAt: analytics.updatedAt,
    };
    await this.prisma.userAnalytics.upsert({
      where: { id: analytics.id },
      update: fields,
      create: {
        id: analytics.id,
        userId: analytics.userId,
        createdAt: analytics.createdAt,
        ...fields,
      },
    });
  }

  async findById(id: string): Promise<UserAnalytics | null> {
    const row = await this.prisma.userAnalytics.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /** The user's analytics (1:1), or null when none exists yet. */
  async findByUserId(userId: string): Promise<UserAnalytics | null> {
    const row = await this.prisma.userAnalytics.findFirst({
      where: { userId, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /** Soft delete — sets deletedAt. */
  async delete(id: string): Promise<void> {
    await this.prisma.userAnalytics.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private mapToDomain(raw: PrismaUserAnalytics): UserAnalytics {
    return new UserAnalytics(
      {
        userId: raw.userId,
        totalApplications: raw.totalApplications,
        totalInterviews: raw.totalInterviews,
        totalOffers: raw.totalOffers,
        applicationAcceptanceRate: raw.applicationAcceptanceRate,
        interviewAcceptanceRate: raw.interviewAcceptanceRate,
        profileViewCount: raw.profileViewCount,
        lastProfileViewDate: raw.lastProfileViewDate ?? undefined,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      raw.id,
    );
  }
}
