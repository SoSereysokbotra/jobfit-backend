// src/modules/employer/infrastructure/repositories/employer-job.repository.ts
//
// Employer-specific Prisma access for jobs: stamping the poster, resolving a job's owning
// company (authorization boundary), listing an employer's own postings, and computing
// per-job analytics. The heavy job lifecycle (create/update/publish) is delegated to the
// job module's JobService; this repository only covers what that service doesn't.

import { Injectable } from '@nestjs/common';
import { ApplicationStatus, Job, JobSkill } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { matchBand } from '@modules/matching/domain/scoring/match-band';

export type JobWithSkills = Job & { skills: JobSkill[] };

export interface JobAnalytics {
  applicationsCount: number;
  applicationsByStatus: Record<string, number>;
  /**
   * How the matched candidate pool splits across the evidence-backed bands.
   *
   * REPLACES `averageMatchScore`, which was never once a number: it was an AVG over
   * `match_scores`, a table with no rows and no writer, so the employer's "Avg Match"
   * card has always rendered "—" (MENTOR_REVIEW_2026-08-18 §15).
   *
   * It is counts rather than a restored average for a second reason. §13 calibrated the
   * score at ρ 0.662 — the ORDERING is evidenced — but its observed range is 41–69 on a
   * scale presented as 0–100, and the human grades overlap inside it. A mean of numbers
   * like that is a magnitude claim the evidence does not support, so shipping
   * "Avg Match 54%" would have replaced a blank with a wrong answer. "12 strong
   * candidates" is both more useful to an employer and defensible.
   */
  candidateBands: { strong: number; possible: number; weak: number };
}

@Injectable()
export class EmployerJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Record which employer posted a job (called right after JobService.create). */
  async setPostedBy(jobId: string, employerUserId: string): Promise<void> {
    await this.prisma.job.update({
      where: { id: jobId },
      data: { postedByEmployerId: employerUserId },
    });
  }

  /** The company that owns a job (used for ownership checks). Null if the job is gone. */
  async getCompanyId(jobId: string): Promise<string | null> {
    const row = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { companyId: true },
    });
    return row?.companyId ?? null;
  }

  findByCompany(
    companyId: string,
    skip: number,
    take: number,
  ): Promise<JobWithSkills[]> {
    return this.prisma.job.findMany({
      where: { companyId },
      include: { skills: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async analytics(jobId: string): Promise<JobAnalytics> {
    const [total, byStatus, matchRows] = await Promise.all([
      this.prisma.application.count({
        where: { jobId, deletedAt: null },
      }),
      this.prisma.application.groupBy({
        by: ['status'],
        where: { jobId, deletedAt: null },
        _count: { _all: true },
      }),
      // `recommendations` is THE match table — 749 rows, written by the pipeline, keyed
      // by the user identity the whole matching domain uses. Dismissed rows are excluded:
      // a candidate who rejected this job is not part of its matched pool.
      this.prisma.recommendation.findMany({
        where: { jobId, dismissedAt: null },
        select: { score: true },
      }),
    ]);

    const applicationsByStatus: Record<string, number> = {};
    for (const row of byStatus) {
      applicationsByStatus[row.status as ApplicationStatus] = row._count._all;
    }

    const candidateBands = { strong: 0, possible: 0, weak: 0 };
    for (const { score } of matchRows) {
      const band = matchBand(score);
      if (band === 'STRONG') candidateBands.strong += 1;
      else if (band === 'POSSIBLE') candidateBands.possible += 1;
      else candidateBands.weak += 1;
    }

    return {
      applicationsCount: total,
      applicationsByStatus,
      candidateBands,
    };
  }
}
