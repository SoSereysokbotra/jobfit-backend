// src/modules/matching/domain/scoring/match-band.ts
//
// What the match score is allowed to CLAIM to a user.
//
// THE PROBLEM (MENTOR_REVIEW_2026-08-18 §13). This project rejected the LLM `fitScore` on
// strong evidence — Spearman ρ of 0.137 / −0.065 against 150 hand-graded pairs, with BAD
// scoring above GREAT — and made "no percentage may be shown to a user" a rule. Then it
// shipped `Recommendation.score` as a 0–100 percentage on every job card and in the
// extension badge, and never ran the same test on it. The standard that disqualified one
// number was never applied to the other.
//
// THE MEASUREMENT, run 2026-08-20 via `scripts/eval-score-calibration.ts`:
//
//   ρ (total vs human grade) = 0.662     ← ordering is REAL, and far above the rejected
//                                          fitScore's 0.137
//   observed range           = 41–69     ← on a scale presented as 0–100
//
//   | grade | n  | scored range | mean |
//   |-------|----|--------------|------|
//   | GREAT |  9 | 51–69        | 60.7 |
//   | OK    |  3 | 46–51        | 48.7 |
//   | BAD   | 38 | 41–56        | 46.1 |
//
// TWO CONCLUSIONS, and they point opposite ways:
//
//  1. The ORDERING is evidenced. ρ 0.662 is a real correlation with human judgement.
//     Sorting a user's recommendations by this score is defensible.
//  2. The MAGNITUDE is not. The scorer never emits below 41 or above 69, so "41%" reads
//     as a catastrophic match when it is merely the bottom of the range, and no job can
//     ever be shown as a 90% fit. Worse, the grades OVERLAP: a job graded BAD reached 56
//     while one graded GREAT scored 51. At 54 the number tells the user nothing.
//
// So the score keeps doing what it is good at (ordering) and stops doing what it cannot
// support (claiming a precise percentage). These bands are the honest middle.
//
// ⚠️ THE THRESHOLDS ARE PROVISIONAL, and the reason is n. All 50 pairs come from ONE
// candidate, who has no résumé — which is also why `experience` (25% of the weight) is a
// constant 40 and contributes nothing. This measures whether the scorer agrees with one
// person about one profile. `MIN_CANDIDATES` in the calibration script is the gate; when
// it passes, re-derive these numbers from the new distribution rather than keeping them.

/**
 * How much confidence the evidence supports for one score.
 *
 * Deliberately three coarse values rather than five: the sample cannot support finer
 * distinctions, and inventing them would repeat the false precision this replaces.
 */
export type MatchBand = 'STRONG' | 'POSSIBLE' | 'WEAK';

/**
 * No job scoring at or above this was graded BAD by a human (BAD topped out at 56).
 * So "strong" here means a measured absence of bad outcomes, not a predicted good one.
 */
const STRONG_AT_OR_ABOVE = 57;

/**
 * No job scoring below this was graded GREAT (GREAT bottomed out at 51). Below it we
 * have never seen a job the human wanted.
 */
const POSSIBLE_AT_OR_ABOVE = 51;

/**
 * The band a score falls in.
 *
 * Both thresholds are read off the observed distribution above rather than chosen for
 * roundness — each one is the edge of a region where one human grade never appeared.
 * Between them (51–56) both GREAT and BAD occur, which is exactly what POSSIBLE means:
 * the scorer genuinely cannot separate them there, and the UI should not pretend it can.
 */
export function matchBand(score: number): MatchBand {
  if (!Number.isFinite(score)) return 'WEAK';
  if (score >= STRONG_AT_OR_ABOVE) return 'STRONG';
  if (score >= POSSIBLE_AT_OR_ABOVE) return 'POSSIBLE';
  return 'WEAK';
}

/**
 * One line a client can show verbatim instead of a percentage.
 *
 * Phrased as what we OBSERVED, not as a prediction about this job. "Similar to jobs you
 * rated highly" is a claim we can defend from the label set; "87% match" is not.
 */
export const MATCH_BAND_LABEL: Record<MatchBand, string> = {
  STRONG: 'Strong match',
  POSSIBLE: 'Possible match',
  WEAK: 'Weak match',
};
