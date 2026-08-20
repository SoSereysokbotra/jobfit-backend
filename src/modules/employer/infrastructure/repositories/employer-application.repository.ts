// src/modules/employer/infrastructure/repositories/employer-application.repository.ts
//
// Employer-facing Prisma access to applications: listing the pipeline for the employer's
// company jobs, updating status (with stage-history), and attaching employer notes.

import { Injectable } from '@nestjs/common';
import { Application, ApplicationStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

// The unread count rides along with the list so the board can badge a card without a
// second request per candidate. A state badge cannot tell message 1 from message 5, which
// is the whole reason later messages went unnoticed.
const OFFER_UNREAD = {
  select: {
    _count: { select: { messages: { where: { authorRole: 'CANDIDATE', readAt: null } } } },
  },
} as const;

// The résumé the candidate ACTUALLY SUBMITTED — `Application.resumeId`, fixed at
// submission (MENTOR_REVIEW_2026-08-18 §5), not whichever CV is their default today.
// Metadata only: enough for the board to say "CV.pdf, 240 KB" without minting a download
// credential for every card on every page load. The URL is a separate, deliberate request.
const SUBMITTED_RESUME = {
  select: {
    id: true,
    userId: true,
    fileName: true,
    fileType: true,
    fileSize: true,
    deletedAt: true,
  },
} as const;

export type PipelineApplicationRow = Prisma.ApplicationGetPayload<{
  include: {
    user: { select: { id: true; name: true; email: true } };
    job: { select: { id: true; title: true; companyId: true } };
    offer: typeof OFFER_UNREAD;
    resume: typeof SUBMITTED_RESUME;
  };
}>;

export type ApplicationWithJob = Prisma.ApplicationGetPayload<{
  include: { job: { select: { companyId: true } } };
}>;

/** An application plus the résumé it was submitted with, for the download route. */
export type ApplicationWithResume = Prisma.ApplicationGetPayload<{
  include: {
    job: { select: { companyId: true } };
    resume: typeof SUBMITTED_RESUME;
  };
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

  /** Same, plus the submitted résumé — for minting a download URL. */
  findByIdWithResume(id: string): Promise<ApplicationWithResume | null> {
    return this.prisma.application.findFirst({
      where: { id, deletedAt: null },
      include: {
        job: { select: { companyId: true } },
        resume: SUBMITTED_RESUME,
      },
    });
  }

  /** Applications for jobs owned by `companyId`, optionally filtered by job / status. */
  findForCompany(params: {
    companyId: string;
    jobId?: string;
    status?: ApplicationStatus;
    includeArchived?: boolean;
    skip: number;
    take: number;
  }): Promise<PipelineApplicationRow[]> {
    const where: Prisma.ApplicationWhereInput = {
      deletedAt: null,
      job: { companyId: params.companyId },
    };
    if (params.jobId) where.jobId = params.jobId;
    if (params.status) where.status = params.status;
    // The EMPLOYER's own archive flag. The candidate's is a different column and does not
    // reach this query — a candidate tidying their list must never remove a hire from
    // this board, which is exactly what the old shared ARCHIVED status did.
    if (!params.includeArchived) where.archivedByEmployerAt = null;

    return this.prisma.application.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        job: { select: { id: true, title: true, companyId: true } },
        offer: OFFER_UNREAD,
        resume: SUBMITTED_RESUME,
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

  /** Hide (or restore) an application on the EMPLOYER's board only. */
  setArchivedByEmployer(
    applicationId: string,
    employerUserId: string,
    archived: boolean,
  ): Promise<Application> {
    return this.prisma.application.update({
      where: { id: applicationId },
      data: {
        archivedByEmployerAt: archived ? new Date() : null,
        reviewedByEmployerId: employerUserId,
      },
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

}
