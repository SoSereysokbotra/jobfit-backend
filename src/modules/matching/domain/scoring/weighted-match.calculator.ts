// Combines the sub-scores into a single 0-100 total:
//   skills 40% + experience 25% + location 15% + salary 10% + other 10%.

import { CandidateContext, JobContext, SubScores } from './types';

export const MATCH_WEIGHTS = {
  skills: 0.4,
  experience: 0.25,
  location: 0.15,
  salary: 0.1,
  other: 0.1,
} as const;

/** "Other" (weight 10%): industry alignment between candidate and job. */
export function scoreOther(
  candidate: CandidateContext,
  job: JobContext,
): number {
  if (job.industry && candidate.desiredIndustries.includes(job.industry)) {
    return 100;
  }
  if (candidate.desiredIndustries.length === 0 || !job.industry) return 50;
  return 40;
}

export function weightedMatch(scores: SubScores): number {
  return Math.round(
    scores.skills * MATCH_WEIGHTS.skills +
      scores.experience * MATCH_WEIGHTS.experience +
      scores.location * MATCH_WEIGHTS.location +
      scores.salary * MATCH_WEIGHTS.salary +
      scores.other * MATCH_WEIGHTS.other,
  );
}
