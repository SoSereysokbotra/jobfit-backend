// Combines the sub-scores into a single 0-100 total:
//   skills 40% + experience 25% + location 15% + salary 10%.
//
// THE "INDUSTRY" SUB-SCORE (`other`, 10%) WAS DELETED — 2026-09-02, on measurement, not
// taste. It compared the employer's industry against the candidate's desired industries
// and could not work:
//
//   · `companies.industry` stores an Industry **id**; `Profile.desiredIndustries` stores
//     **names**. The extension's scoring path compared them directly, so the "match"
//     branch was unreachable and the score could only ever be 40 or 50.
//   · Only 8 of 264 companies (3%) have an industry recorded at all.
//   · External postings resolve no company whatsoever (Google, Wise, Grab, Agoda and
//     Microsoft are all absent), so every extension score was a flat neutral 50.
//   · Its calibration against human grades measured **rho = -0.667** — the one sub-score
//     arguing against the right answer.
//
// A dimension that is constant for every job cannot rank anything. The weights below
// keep their existing proportions; `blendMeasured` normalises by the weights actually
// present, so the remaining four re-scale to 100% on their own.

import { SubScores } from './types';

export const MATCH_WEIGHTS = {
  skills: 0.4,
  experience: 0.25,
  location: 0.15,
  salary: 0.1,
} as const;

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
    ]) ?? 0 // unreachable: only `location` is nullable, so the weight is never 0
  );
}
