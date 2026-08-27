// src/modules/matching/presentation/dtos/recommended-job.mapper.ts
//
// Row -> RecommendedJobDto. Extracted from RecommendationsQueryService so the delta-sync
// route (GET /sync/recommendations) serves the SAME shape as GET /recommendations. If the
// two drifted, a PWA would have to keep two mappers for one cached collection and the
// cache would disagree with itself depending on which route last wrote it.

import { RecommendedJobDto } from './recommended-job.dto';
import { matchBand } from '../../domain/scoring/match-band';
import { SalaryPeriodValue } from '@shared-kernel/value-objects/salary-range.vo';

/** The row shape both callers query: a recommendation with its job, company name and skill ids. */
export interface RecommendationWithJob {
  score: number;
  reasonExplanation: string | null;
  breakdown: unknown;
  computedAt: Date;
  staleAt: Date | null;
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
    salaryCurrency: string;
    salaryPeriod: SalaryPeriodValue | null;
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
  // BOTH bounds, not either. `?? 0` used to fill the missing half, so a job stating only
  // a minimum was published as "min–0" — an invalid band, and the same class of invented
  // fact as the "$0K – $0K" this DTO's sibling produced (MENTOR_REVIEW_2026-08-18 §12).
  const hasSalary = job.minSalary != null && job.maxSalary != null;

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
      ? {
          min: job.minSalary as number,
          max: job.maxSalary as number,
          // Read off the job, not hardcoded. 'USD' here was a literal on a corpus that
          // is 83% Cambodian; `period` stays undefined when unknown rather than implying
          // per-year.
          currency: job.salaryCurrency,
          period: job.salaryPeriod ?? undefined,
        }
      : undefined,
    skillIds: job.skills.map((s) => s.skillId),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    match: Math.round(r.score),
    // The band travels with the score so every client makes the same claim. A client that
    // renders `match` as a percentage is asserting precision the calibration does not
    // support — see match-band.ts.
    band: matchBand(r.score),
    reason: r.reasonExplanation ?? undefined,
    breakdown: (r.breakdown as Record<string, number> | null) ?? undefined,
    // Freshness travels WITH the score, for the same reason `band` does: a client that
    // shows a number without saying how old it is asserts a currency the data may not
    // have. Both columns existed already and simply never reached the response.
    computedAt: r.computedAt.toISOString(),
    stale: r.staleAt !== null,
  };
}
