// src/modules/matching/presentation/dtos/recommended-job.mapper.ts
//
// Row -> RecommendedJobDto. Extracted from RecommendationsQueryService so the delta-sync
// route (GET /sync/recommendations) serves the SAME shape as GET /recommendations. If the
// two drifted, a PWA would have to keep two mappers for one cached collection and the
// cache would disagree with itself depending on which route last wrote it.

import { RecommendedJobDto } from './recommended-job.dto';

/** The row shape both callers query: a recommendation with its job, company name and skill ids. */
export interface RecommendationWithJob {
  score: number;
  reasonExplanation: string | null;
  breakdown: unknown;
  job: {
    id: string;
    companyId: string;
    company?: { name: string } | null;
    title: string;
    description: string;
    status: string;
    remoteType: string;
    location: string | null;
    minSalary: number | null;
    maxSalary: number | null;
    skills: { skillId: string }[];
    createdAt: Date;
    updatedAt: Date;
  };
}

/** Prisma `include` shared by both callers, so the row always has what the mapper needs. */
export const RECOMMENDATION_JOB_INCLUDE = {
  job: {
    include: {
      company: { select: { name: true } },
      skills: { select: { skillId: true } },
    },
  },
} as const;

export function toRecommendedJobDto(r: RecommendationWithJob): RecommendedJobDto {
  const job = r.job;
  const hasSalary = job.minSalary != null || job.maxSalary != null;

  return {
    id: job.id,
    companyId: job.companyId,
    companyName: job.company?.name,
    title: job.title,
    description: job.description,
    status: job.status,
    remoteType: job.remoteType,
    location: job.location ?? undefined,
    salaryRange: hasSalary
      ? { min: job.minSalary ?? 0, max: job.maxSalary ?? 0, currency: 'USD' }
      : undefined,
    skillIds: job.skills.map((s) => s.skillId),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    match: Math.round(r.score),
    reason: r.reasonExplanation ?? undefined,
    breakdown: (r.breakdown as Record<string, number> | null) ?? undefined,
  };
}
