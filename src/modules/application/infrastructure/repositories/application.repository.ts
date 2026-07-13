// src/modules/application/infrastructure/repositories/application.repository.ts
//
// Prisma-backed persistence for the Application aggregate. Soft delete via deletedAt.
// userId/jobId are immutable (create-only); status/resume/notes are mutable.

import { Injectable } from '@nestjs/common';
import { $Enums, Application as PrismaApplication } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { IRepository } from '@common/abstracts/repository';
import { Application } from '../../domain/entities/application.entity';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';

@Injectable()
export class ApplicationRepository implements IRepository<Application> {
  constructor(private readonly prisma: PrismaService) {}

  async save(application: Application): Promise<void> {
    const fields = {
      resumeId: application.resumeId ?? null,
      status: application.status as $Enums.ApplicationStatus,
      notes: application.notes ?? null,
      coverLetter: application.coverLetter ?? null,
      updatedAt: application.updatedAt,
    };
    await this.prisma.application.upsert({
      where: { id: application.id },
      update: fields,
      create: {
        id: application.id,
        userId: application.userId,
        jobId: application.jobId,
        appliedAt: application.appliedAt,
        createdAt: application.createdAt,
        ...fields,
      },
    });
  }

  async findById(id: string): Promise<Application | null> {
    const row = await this.prisma.application.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /** A user's applications, newest first, paginated. */
  async findByUserId(
    userId: string,
    skip = 0,
    take = 20,
  ): Promise<Application[]> {
    const rows = await this.prisma.application.findMany({
      where: { userId, deletedAt: null },
      orderBy: { appliedAt: 'desc' },
      skip,
      take,
    });
    return rows.map((r) => this.mapToDomain(r));
  }

  async findByJobId(jobId: string): Promise<Application[]> {
    const rows = await this.prisma.application.findMany({
      where: { jobId, deletedAt: null },
      orderBy: { appliedAt: 'desc' },
    });
    return rows.map((r) => this.mapToDomain(r));
  }

  async findByUserAndJob(
    userId: string,
    jobId: string,
  ): Promise<Application | null> {
    const row = await this.prisma.application.findFirst({
      where: { userId, jobId, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  async countByUserId(userId: string): Promise<number> {
    return this.prisma.application.count({
      where: { userId, deletedAt: null },
    });
  }

  /** Soft delete — sets deletedAt. */
  async delete(id: string): Promise<void> {
    await this.prisma.application.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private mapToDomain(raw: PrismaApplication): Application {
    return new Application(
      {
        userId: raw.userId,
        jobId: raw.jobId,
        resumeId: raw.resumeId ?? undefined,
        status: raw.status as ApplicationStatus,
        appliedAt: raw.appliedAt,
        notes: raw.notes ?? undefined,
        coverLetter: raw.coverLetter ?? undefined,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      raw.id,
    );
  }
}
