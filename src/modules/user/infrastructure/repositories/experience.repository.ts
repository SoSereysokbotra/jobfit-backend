// src/modules/user/infrastructure/repositories/experience.repository.ts
//
// Prisma-backed persistence for the Experience entity. Maps rows to domain entities.
// Soft delete via deletedAt. Enum columns are cast at the boundary between the shared
// kernel enums and Prisma's generated enums.

import { Injectable } from '@nestjs/common';
import { $Enums, Experience as PrismaExperience } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { Experience } from '../../domain/entities/experience.entity';
import { JobLevel } from '@shared/kernel/enums/job-level.enum';
import { EmploymentType } from '@shared/kernel/enums/employment-type.enum';
import {
  DELTA_ORDER_BY,
  DeltaOptions,
  DeltaPage,
  deltaWhere,
  splitDelta,
} from '@modules/sync/delta';

@Injectable()
export class ExperienceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(exp: Experience): Promise<void> {
    const fields = {
      company: exp.company,
      title: exp.title,
      jobLevel: exp.jobLevel as $Enums.JobLevel,
      employmentType: exp.employmentType as $Enums.EmploymentType,
      industry: exp.industry,
      description: exp.description ?? null,
      isCurrentJob: exp.isCurrentJob,
      startDate: exp.startDate,
      endDate: exp.endDate ?? null,
      technologies: exp.technologies,
      updatedAt: exp.updatedAt,
    };
    await this.prisma.experience.upsert({
      where: { id: exp.id },
      update: fields,
      create: {
        id: exp.id,
        userId: exp.userId,
        createdAt: exp.createdAt,
        ...fields,
      },
    });
  }

  async findById(id: string): Promise<Experience | null> {
    const row = await this.prisma.experience.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /** All non-deleted experiences for a user, newest first. */
  async findByUserId(userId: string): Promise<Experience[]> {
    const rows = await this.prisma.experience.findMany({
      where: { userId, deletedAt: null },
      orderBy: { startDate: 'desc' },
    });
    return rows.map((row) => this.mapToDomain(row));
  }

  /** Soft delete — sets deletedAt. */
  async delete(id: string): Promise<void> {
    await this.prisma.experience.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /**
   * Delta sync (PWA offline, Phase 2). Experiences for this user changed since the
   * watermark, INCLUDING soft-deleted ones — splitDelta separates the tombstones, which
   * is how the client learns to drop rows it already cached.
   */
  async findChangedSince(
    userId: string,
    options: DeltaOptions,
  ): Promise<DeltaPage<Experience>> {
    const rows = await this.prisma.experience.findMany({
      where: deltaWhere(userId, options),
      orderBy: DELTA_ORDER_BY,
      take: options.limit + 1,
    });
    return splitDelta(rows, options.limit, (row) => this.mapToDomain(row));
  }

  private mapToDomain(raw: PrismaExperience): Experience {
    return new Experience(
      {
        userId: raw.userId,
        company: raw.company,
        title: raw.title,
        jobLevel: raw.jobLevel as JobLevel,
        employmentType: raw.employmentType as EmploymentType,
        industry: raw.industry,
        description: raw.description ?? undefined,
        isCurrentJob: raw.isCurrentJob,
        startDate: raw.startDate,
        endDate: raw.endDate ?? undefined,
        technologies: raw.technologies,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      raw.id,
    );
  }
}
