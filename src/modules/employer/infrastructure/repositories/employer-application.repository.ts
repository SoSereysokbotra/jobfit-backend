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
      // Best-first: most requirements evidenced, then match score, then recency.
      //
      // Ordered in the DATABASE, not after fetching — sorting a page in memory would only
      // reorder within that page and silently bury the strongest candidate on page 2.
      //
      // Coverage leads because it is what actually discriminates. Measured on four seeded
      // candidates it separated them 6/7 · 3/7 · 1/7 · 0/7, while the match score gave
      // 50% · 46% · 46% · 46% — a 4-point spread between a senior full-stack engineer and
      // a graphic designer. Score is a tiebreak, not the ranking.
      //
      // `nulls: 'last'` matters: Postgres sorts NULLs FIRST on DESC, which would float
      // every unscreened application above every assessed one.
      orderBy: [
        { screenRequirementsCovered: { sort: 'desc', nulls: 'last' } },
        { screenMatchScore: { sort: 'desc', nulls: 'last' } },
        { appliedAt: 'desc' },
      ],
      skip: params.skip,
      take: params.take,
    });
  }

  // transitionStatus lived here. It was one of only two status writes that validated
  // anything, and it still re-stated the lifecycle rather than sharing it — so the offer
  // module could skip stages this path refused. ApplicationTransitionService owns it now.

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

}
