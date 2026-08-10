// src/modules/user/infrastructure/repositories/education.repository.ts
//
// Prisma-backed persistence for the Education entity. Maps rows to domain entities.
// Soft delete via deletedAt. The DegreeLevel enum is cast at the boundary between the
// shared-kernel enum and Prisma's generated enum.

import { Injectable } from '@nestjs/common';
import { $Enums, Education as PrismaEducation } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { Education } from '../../domain/entities/education.entity';
import { DegreeLevel } from '@shared/kernel/enums/degree-level.enum';
import {
  DELTA_ORDER_BY,
  DeltaOptions,
  DeltaPage,
  deltaWhere,
  splitDelta,
} from '@modules/sync/delta';

@Injectable()
export class EducationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(education: Education): Promise<void> {
    const fields = {
      institution: education.institution,
      degreeLevel: education.degreeLevel as $Enums.DegreeLevel,
      fieldOfStudy: education.fieldOfStudy,
      description: education.description ?? null,
      startDate: education.startDate,
      endDate: education.endDate ?? null,
      gpa: education.gpa ?? null,
      updatedAt: education.updatedAt,
    };
    await this.prisma.education.upsert({
      where: { id: education.id },
      update: fields,
      create: {
        id: education.id,
        userId: education.userId,
        createdAt: education.createdAt,
        ...fields,
      },
    });
  }

  async findById(id: string): Promise<Education | null> {
    const row = await this.prisma.education.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /** All non-deleted education records for a user, most recently finished first. */
  async findByUserId(userId: string): Promise<Education[]> {
    const rows = await this.prisma.education.findMany({
      where: { userId, deletedAt: null },
      orderBy: { endDate: 'desc' },
    });
    return rows.map((row) => this.mapToDomain(row));
  }

  /** Soft delete — sets deletedAt. */
  async delete(id: string): Promise<void> {
    await this.prisma.education.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Delta sync (PWA offline, Phase 2). Includes soft-deleted rows as tombstones. */
  async findChangedSince(
    userId: string,
    options: DeltaOptions,
  ): Promise<DeltaPage<Education>> {
    const rows = await this.prisma.education.findMany({
      where: deltaWhere(userId, options),
      orderBy: DELTA_ORDER_BY,
      take: options.limit + 1,
    });
    return splitDelta(rows, options.limit, (row) => this.mapToDomain(row));
  }

  private mapToDomain(raw: PrismaEducation): Education {
    return new Education(
      {
        userId: raw.userId,
        institution: raw.institution,
        degreeLevel: raw.degreeLevel as DegreeLevel,
        fieldOfStudy: raw.fieldOfStudy,
        description: raw.description ?? undefined,
        startDate: raw.startDate,
        endDate: raw.endDate ?? undefined,
        gpa: raw.gpa ?? undefined,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      raw.id,
    );
  }
}
