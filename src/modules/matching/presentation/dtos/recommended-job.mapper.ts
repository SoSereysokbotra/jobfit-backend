// src/modules/matching/presentation/dtos/recommended-job.mapper.ts
//
// Row -> RecommendedJobDto. Extracted from RecommendationsQueryService so the delta-sync
// route (GET /sync/recommendations) serves the SAME shape as GET /recommendations. If the
// two drifted, a PWA would have to keep two mappers for one cached collection and the
// cache would disagree with itself depending on which route last wrote it.

import { MatchFlagsDto, RecommendedJobDto } from './recommended-job.dto';
import { matchBand } from '../../domain/scoring/match-band';
import { twoDimensionalBand } from '../../domain/scoring/weighted-match.calculator';
import { SalaryPeriodValue } from '@shared-kernel/value-objects/salary-range.vo';

/** The row shape both callers query: a recommendation with its job, company name and skill ids. */
export interface RecommendationWithJob {
  score: number;
  /**
   * The two dimensions behind `score`. NULL on rows written before the two-dimensional
   * rewrite — see the `recommendations.roleFitScore` column comment. A reader tells the
   * two generations of row apart by this null and nothing else.
   */
  roleFitScore?: number | null;
  preferenceFitScore?: number | null;
  /** `MatchFlags` as stored: warnings, highlights, and the dealbreaker flag. */
  matchFlags?: unknown;
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

  // Both dimensions are written in the same upsert, so either is enough to identify a
  // two-dimensionally scored row; requiring both would silently drop the pair if one ever
  // failed to write.
  const twoDimensional =
    r.roleFitScore != null && r.preferenceFitScore != null;
  const flags = twoDimensional ? readMatchFlags(r.matchFlags) : undefined;

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
    // The band travels with the score so every client makes the same claim.
    //
    // WHICH BAND FUNCTION IS ITSELF DECIDED BY THE ROW. A two-dimensionally scored row
    // carries a gated composite that uses the whole 0-100 range, and `twoDimensionalBand`
    // reads it at 70/50. A pre-rewrite row carries the old linear total, whose observed
    // range was 41–69 and whose thresholds were read off that distribution. Applying
    // either function to the other's number would misreport the confidence — 70/50 would
    // call almost every legacy row WEAK — so the row's own generation picks.
    band: twoDimensional ? twoDimensionalBand(r.score) : matchBand(r.score),
    roleFitScore: twoDimensional ? Math.round(r.roleFitScore as number) : undefined,
    preferenceFitScore: twoDimensional
      ? Math.round(r.preferenceFitScore as number)
      : undefined,
    // Absent, not empty, on a legacy row. An empty `warnings: []` is a claim that nothing
    // conflicts; a row scored before preferences were evaluated has made no such check,
    // and the two must not look the same to a client.
    flags,
    reason: r.reasonExplanation ?? undefined,
    breakdown: (r.breakdown as Record<string, number> | null) ?? undefined,
    // Freshness travels WITH the score, for the same reason `band` does: a client that
    // shows a number without saying how old it is asserts a currency the data may not
    // have. Both columns existed already and simply never reached the response.
    computedAt: r.computedAt.toISOString(),
    stale: r.staleAt !== null,
  };
}

/**
 * `matchFlags` (a Json column, so `unknown` at the type level) -> MatchFlagsDto.
 *
 * DEFENSIVE BY DESIGN. Prisma hands back whatever is in the column, and the column has
 * outlived at least one shape change already elsewhere in this schema. Anything that is
 * not the expected shape degrades to "no flags recorded" rather than reaching a client as
 * a half-built object or throwing on a list endpoint that would otherwise have served
 * fifty good rows.
 */
function readMatchFlags(value: unknown): MatchFlagsDto | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    hasDealbreakerMismatch: raw.hasDealbreakerMismatch === true,
    warnings: strings(raw.warnings),
    highlights: strings(raw.highlights),
  };
}
