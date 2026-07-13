// src/modules/employer/infrastructure/repositories/employer-application.repository.ts
//
// Employer-facing Prisma access to applications: listing the pipeline for the employer's
// company jobs, updating status (with stage-history), and attaching employer notes.

import { Injectable } from '@nestjs/common';
import { Application, ApplicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

export type PipelineApplicationRow = Prisma.ApplicationGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true } };
    job: { select: { id: true; title: true; companyId: true } };
  };
}>;

export type ApplicationWithJob = Prisma.ApplicationGetPayload<{
  include: { job: { select: { companyId: true } } };
}>;

@Injectable()
export class EmployerApplicationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Load an application with just enough of its job to check company ownership. */
  findByIdWithJob(id: string): Promise<ApplicationWithJob | null> {
    return this.prisma.application.findFirst({
      where: { id, deletedAt: null },
      include: { job: { select: { companyId: true } } },
    });
  }

  /** Applications for jobs owned by `companyId`, optionally filtered by job / status. */
  findForCompany(params: {
    companyId: string;
    jobId?: string;
    status?: ApplicationStatus;
    skip: number;
    take: number;
  }): Promise<PipelineApplicationRow[]> {
    const where: Prisma.ApplicationWhereInput = {
      deletedAt: null,
      job: { companyId: params.companyId },
    };
    if (params.jobId) where.jobId = params.jobId;
    if (params.status) where.status = params.status;

    return this.prisma.application.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        job: { select: { id: true, title: true, companyId: true } },
      },
      orderBy: { appliedAt: 'desc' },
      skip: params.skip,
      take: params.take,
    });
  }

  /**
   * Move an application to a new status and record the transition in one transaction:
   * updates status + reviewedByEmployerId, and appends a stage-history row.
   */
  async transitionStatus(params: {
    applicationId: string;
    previousStatus: ApplicationStatus;
    newStatus: ApplicationStatus;
    employerUserId: string;
    notes?: string;
  }): Promise<Application> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.application.update({
        where: { id: params.applicationId },
        data: {
          status: params.newStatus,
          reviewedByEmployerId: params.employerUserId,
        },
      });
      await tx.applicationStageHistory.create({
        data: {
          applicationId: params.applicationId,
          previousStatus: params.previousStatus,
          newStatus: params.newStatus,
          movedByUserId: params.employerUserId,
          notes: params.notes ?? null,
        },
      });
      return updated;
    });
  }

  setEmployerNotes(
    applicationId: string,
    employerUserId: string,
    notes: string,
  ): Promise<Application> {
    return this.prisma.application.update({
      where: { id: applicationId },
      data: { employerNotes: notes, reviewedByEmployerId: employerUserId },
    });
  }

  /** Best-effort match scores for a single job, keyed by candidate userId. */
  async matchScoresForJob(
    jobId: string,
    userIds: string[],
  ): Promise<Map<string, number>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.matchScore.findMany({
      where: { jobId, jobSeekerProfile: { userId: { in: userIds } } },
      select: { score: true, jobSeekerProfile: { select: { userId: true } } },
    });
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.jobSeekerProfile.userId, row.score);
    return map;
  }
}
