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
import {
  DELTA_ORDER_BY,
  DeltaOptions,
  DeltaPage,
  deltaWhere,
  splitDelta,
} from '@modules/sync/delta';

@Injectable()
export class ApplicationRepository implements IRepository<Application> {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persist the aggregate.
   *
   * `status` is deliberately absent from the UPDATE branch. Changing the status of an
   * application that already exists is a transition, and transitions go through
   * ApplicationTransitionService — where they are validated, attributed to an actor, and
   * audited. This method used to write status on update too, which made it a tenth way
   * around the lifecycle: any caller holding an aggregate could save a new status over an
   * old one with nothing checked.
   *
   * On CREATE there is no previous state to transition from, so the opening status is set
   * here. That is the one legitimate status write outside the transition service, and the
   * status-write guard spec allows exactly this file for exactly that reason.
   */
  async save(application: Application): Promise<void> {
    const mutable = {
      resumeId: application.resumeId ?? null,
      notes: application.notes ?? null,
      coverLetter: application.coverLetter ?? null,
      updatedAt: application.updatedAt,
    };
    await this.prisma.application.upsert({
      where: { id: application.id },
      update: mutable,
      create: {
        id: application.id,
        userId: application.userId,
        jobId: application.jobId,
        appliedAt: application.appliedAt,
        createdAt: application.createdAt,
        status: application.status as $Enums.ApplicationStatus,
        ...mutable,
      },
    });
  }

  async findById(id: string): Promise<Application | null> {
    const row = await this.prisma.application.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /**
   * Most recent prior application by this user to the same company + a matching
   * title. Company is matched exactly (case-insensitive); title uses `contains`
   * (v1 — precise, low false-positive). Returns a flat projection for the
   * extension's duplicate detector, or null.
   */
  async findSimilarForUser(
    userId: string,
    jobTitle: string,
    companyName: string,
  ): Promise<{
    applicationId: string;
    jobTitle: string;
    companyName: string | null;
    status: ApplicationStatus;
    appliedAt: string;
  } | null> {
    const row = await this.prisma.application.findFirst({
      where: {
        userId,
        deletedAt: null,
        job: {
          title: { contains: jobTitle, mode: 'insensitive' },
          company: { name: { equals: companyName, mode: 'insensitive' } },
        },
      },
      orderBy: { appliedAt: 'desc' },
      select: {
        id: true,
        status: true,
        appliedAt: true,
        job: { select: { title: true, company: { select: { name: true } } } },
      },
    });
    if (!row) return null;
    return {
      applicationId: row.id,
      jobTitle: row.job.title,
      companyName: row.job.company?.name ?? null,
      status: row.status as unknown as ApplicationStatus,
      appliedAt: row.appliedAt.toISOString(),
    };
  }

  /**
   * A user's applications, newest first, paginated.
   *
   * Hides the ones THEY archived. The employer's own archiving is a different column and
   * has no effect here — that separation is the whole point of the two flags.
   */
  async findByUserId(
    userId: string,
    skip = 0,
    take = 20,
    includeArchived = false,
  ): Promise<Application[]> {
    const rows = await this.prisma.application.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(includeArchived ? {} : { archivedByCandidateAt: null }),
      },
      orderBy: { appliedAt: 'desc' },
      skip,
      take,
    });
    return rows.map((r) => this.mapToDomain(r));
  }

  /** Hide (or restore) an application on the CANDIDATE's list only. */
  async setArchivedByCandidate(id: string, archived: boolean): Promise<void> {
    await this.prisma.application.update({
      where: { id },
      data: { archivedByCandidateAt: archived ? new Date() : null },
    });
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

  /**
   * Delta sync (PWA offline, Phase 2). Applications for this user changed since the
   * watermark, INCLUDING soft-deleted ones, which splitDelta turns into tombstones.
   *
   * Unlike findByUserId this does NOT hide candidate-archived rows: archiving is a view
   * preference the client renders itself, and withholding those rows would make an
   * archive look like a deletion to anything syncing.
   */
  async findChangedSince(
    userId: string,
    options: DeltaOptions,
  ): Promise<DeltaPage<Application>> {
    const rows = await this.prisma.application.findMany({
      where: deltaWhere(userId, options),
      orderBy: DELTA_ORDER_BY,
      take: options.limit + 1,
    });
    return splitDelta(rows, options.limit, (row) => this.mapToDomain(row));
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
        archivedByCandidateAt: raw.archivedByCandidateAt,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      raw.id,
    );
  }
}
