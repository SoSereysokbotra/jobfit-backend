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

/**
 * "Other" (weight 10%): industry alignment between candidate and job.
 *
 * `job.industry` is the RESOLVED INDUSTRY NAME, never the raw `companies.industry`
 * column — that column stores an Industry **id**, and `Profile.desiredIndustries` stores
 * **names**. Comparing them directly is what this used to do, and the two sides could
 * never be equal: measured across the whole database, **0 of 35 companies** had an
 * industry value appearing in any profile's desired list, so `return 100` was unreachable
 * and this sub-score could only ever be 40 or 50.
 *
 * That was not merely useless, it was BACKWARDS. Jobs that have an industry recorded got
 * the mismatch score (40) while jobs missing the data got the neutral one (50) — and in
 * the labelled set the jobs with industry data are disproportionately the GOOD ones
 * (12 of 18 GREAT vs 2 of 76 BAD). Calibration measured **ρ = −0.667** against human
 * grades: the one sub-score actively arguing against the right answer.
 *
 * Comparison is case-insensitive because the two sides are authored independently — the
 * industries table says "Technology", a profile could carry "technology".
 */
export function scoreOther(
  candidate: CandidateContext,
  job: JobContext,
): number {
  const desired = candidate.desiredIndustries
    .filter((i) => typeof i === 'string' && i.trim().length > 0)
    .map((i) => i.trim().toLowerCase());
  const jobIndustry = job.industry?.trim().toLowerCase();

  if (jobIndustry && desired.includes(jobIndustry)) return 100;
  // Nothing to compare on one side or the other — neutral, not a penalty.
  if (desired.length === 0 || !jobIndustry) return 50;
  return 40;
}

/**
 * Weighted average over the sub-scores that were actually MEASURED.
 *
 * A null component is dropped and the remaining weights rescaled to sum to 1, so the
 * total stays on the same 0-100 scale instead of being silently deflated by a missing
 * part. With every component present this is arithmetically identical to the old
 * fixed-weight sum.
 *
 * WHY RESCALE RATHER THAN SUBSTITUTE: `location` is null whenever neither side resolved
 * to a known place. Feeding a "neutral" 50 into the sum would assert that a comparison
 * happened and came out middling — the precise failure the location rewrite exists to
 * remove. Dropping it says the honest thing: this total is the average of what could be
 * measured.
 */
export function blendMeasured(parts: Array<[number | null, number]>): number | null {
  let weighted = 0;
  let weight = 0;
  for (const [value, componentWeight] of parts) {
    if (value === null) continue;
    weighted += value * componentWeight;
    weight += componentWeight;
  }
  // Nothing measurable at all — there is no honest number to print.
  if (weight === 0) return null;
  return Math.round(weighted / weight);
}

export function weightedMatch(scores: SubScores): number {
  return (
    blendMeasured([
      [scores.skills, MATCH_WEIGHTS.skills],
      [scores.experience, MATCH_WEIGHTS.experience],
      [scores.location, MATCH_WEIGHTS.location],
      [scores.salary, MATCH_WEIGHTS.salary],
      [scores.other, MATCH_WEIGHTS.other],
    ]) ?? 0 // unreachable: only `location` is nullable, so the weight is never 0
  );
}
