// src/modules/employer/infrastructure/repositories/employer-job.repository.ts
//
// Employer-specific Prisma access for jobs: stamping the poster, resolving a job's owning
// company (authorization boundary), listing an employer's own postings, and computing
// per-job analytics. The heavy job lifecycle (create/update/publish) is delegated to the
// job module's JobService; this repository only covers what that service doesn't.

import { Injectable } from '@nestjs/common';
import { ApplicationStatus, Job } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

export interface JobAnalytics {
  applicationsCount: number;
  applicationsByStatus: Record<string, number>;
  averageMatchScore: number | null;
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

  findByCompany(companyId: string, skip: number, take: number): Promise<Job[]> {
    return this.prisma.job.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  async analytics(jobId: string): Promise<JobAnalytics> {
    const [total, byStatus, matchAgg] = await Promise.all([
      this.prisma.application.count({
        where: { jobId, deletedAt: null },
      }),
      this.prisma.application.groupBy({
        by: ['status'],
        where: { jobId, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.matchScore.aggregate({
        where: { jobId },
        _avg: { score: true },
      }),
    ]);

    const applicationsByStatus: Record<string, number> = {};
    for (const row of byStatus) {
      applicationsByStatus[row.status as ApplicationStatus] = row._count._all;
    }

    return {
      applicationsCount: total,
      applicationsByStatus,
      averageMatchScore: matchAgg._avg.score ?? null,
    };
  }
}
