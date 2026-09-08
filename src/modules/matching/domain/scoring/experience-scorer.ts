// Experience match (weight 25%). Compares how senior the CANDIDATE is against how senior
// the JOB is, on a shared ladder. Deterministic, no GPU, no network.
//
// WHAT THIS REPLACED, and why it had to go: the previous version took only the candidate
// — `scoreExperience(candidate)` — and mapped their number of recorded roles to a number.
// It never looked at the job. So for one user it returned the SAME value for every job in
// their pool, which means a quarter of the total weight could not reorder anything;
// measured against the live cache, 1 distinct value across all 50 of a user's rows. It
// was not a match score at all, just a constant offset that compressed every total toward
// the middle while reporting itself as "experience match" for each individual job.
//
// WHAT THE JOB SIDE ACTUALLY HAS (measured on the live corpus, 368 published jobs):
//
//   jobs.experienceLevel (structured)   1  (0.3%)
//   seniority keyword in the title    106  (29%)
//   "N years of experience" in body    32  (9%)
//   title keyword OR years phrase     123  (33%)
//
// So a purely structured comparison would be measurable for ONE job in the corpus. The
// title is where the signal actually is, which is why this reads it — the same reasoning
// that already puts job text in front of the dense and BM25 retrievers.
//
// THE DESCRIPTION IS DELIBERATELY NOT PARSED. Adding the "N years" phrases takes coverage
// from 29% to 33% — 17 jobs — and costs loading 50 full descriptions on the scoring path,
// which is a request-path cost for under five points of coverage. The lever worth pulling
// is ingestion populating `experienceLevel`, not more regex here. When it does, the
// structured branch below already takes precedence and this file needs no change.
//
// NULL WHEN THE JOB SAYS NOTHING. Two jobs in three state no seniority anywhere, and the
// honest answer for those is "not measured" — dropped from the weighted average and
// rescaled by `blendMeasured`, exactly as `location` already is. Returning a number for
// them is what the old scorer did, and it is what made the sub-score meaningless.

import { CandidateContext, JobContext } from './types';

/**
 * Seniority as a small ordinal. Only the ORDER and the distance between two rungs are
 * used, never the numbers themselves.
 */
export enum SeniorityLevel {
  Intern = 0,
  Entry = 1,
  Mid = 2,
  Senior = 3,
  Lead = 4,
  Executive = 5,
}

/** `JobLevel` (Prisma enum) -> ladder. The structured value, when a job carries one. */
const LEVEL_BY_JOB_LEVEL: Record<string, SeniorityLevel> = {
  INTERN: SeniorityLevel.Intern,
  ENTRY: SeniorityLevel.Entry,
  MID: SeniorityLevel.Mid,
  SENIOR: SeniorityLevel.Senior,
  LEAD: SeniorityLevel.Lead,
  MANAGER: SeniorityLevel.Lead,
  DIRECTOR: SeniorityLevel.Executive,
  C_LEVEL: SeniorityLevel.Executive,
};

/**
 * The ladder rung a raw `JobLevel` value names, or null when it names nothing we know.
 *
 * Exported so the PREFERENCE dimension measures seniority distance on the same ladder the
 * capability dimension does. Two ladders would be two answers to "is MID next to SENIOR?",
 * and they would drift.
 */
export function seniorityFromJobLevel(
  level: string | null | undefined,
): SeniorityLevel | null {
  if (!level) return null;
  return LEVEL_BY_JOB_LEVEL[level.trim().toUpperCase()] ?? null;
}

/**
 * Title patterns, most specific first — the first hit wins.
 *
 * ORDER MATTERS because ingested titles concatenate roles ("Admin and Operations Manager,
 * Head of School"). "Director" before "Manager" before "Senior" means the most senior
 * claim in a compound title decides, which is the right reading of a posting that lists
 * several.
 *
 * Word-bounded on purpose: an unanchored /lead/ matches "Leadership", and /sr/ matches
 * "Personal Assistant". These are heuristics over free text and will occasionally be
 * wrong — which is the argument for `experienceLevel` being populated at ingest, not for
 * a longer list here.
 */
const TITLE_PATTERNS: [RegExp, SeniorityLevel][] = [
  [/\b(c[-\s]?level|chief|cto|ceo|cfo|coo|vp|vice\s+president|director)\b/i, SeniorityLevel.Executive],
  [/\b(head\s+of|manager|supervisor|principal|staff\s+engineer|lead)\b/i, SeniorityLevel.Lead],
  [/\b(senior|sr\.?)\b/i, SeniorityLevel.Senior],
  [/\b(junior|jr\.?|entry[-\s]level|graduate|fresher)\b/i, SeniorityLevel.Entry],
  [/\b(intern|internship|trainee)\b/i, SeniorityLevel.Intern],
];

/**
 * How senior is this posting? Null when it does not say — the common case (67%).
 *
 * Structured first: `experienceLevel` is a field someone set, the title is an inference
 * from prose. When both exist the field wins.
 */
export function deriveJobLevel(job: {
  experienceLevel?: string | null;
  title?: string | null;
}): SeniorityLevel | null {
  const structured = job.experienceLevel
    ? LEVEL_BY_JOB_LEVEL[job.experienceLevel]
    : undefined;
  if (structured !== undefined) return structured;

  const title = job.title ?? '';
  for (const [pattern, level] of TITLE_PATTERNS) {
    if (pattern.test(title)) return level;
  }
  return null;
}

/**
 * How senior is the CANDIDATE, from the number of roles on record.
 *
 * AN APPROXIMATION, AND THE DATA FORCES IT: `experienceCount` counts roles, not years,
 * and four six-month contracts are not a senior engineer. It is the only seniority signal
 * plumbed through for the candidate today, and it is the same signal the old scorer used
 * — this change is about giving it something to compare AGAINST, not about improving it.
 * Caps at Senior: nothing in a role count distinguishes a lead from an executive.
 */
export function candidateLevel(experienceCount: number): SeniorityLevel {
  if (experienceCount <= 0) return SeniorityLevel.Entry;
  if (experienceCount === 1) return SeniorityLevel.Mid;
  if (experienceCount === 2) return SeniorityLevel.Mid;
  return SeniorityLevel.Senior;
}

/**
 * The rungs, and why they are asymmetric.
 *
 * UNDER-QUALIFIED IS THE HARDER NO. A senior engineer can take a mid-level role; a
 * graduate cannot take a director role, and showing it to them is the more damaging
 * mistake. So the gaps below the requirement fall faster than the gaps above it.
 *
 * These are rungs on a ladder, not tuned constants — the same shape as LOCATION_SCORES.
 * The 25% WEIGHT they feed is untouched: re-calibrating it needs labelled data the eval
 * set does not have (2 candidates, documented in recompute-user-matches.use-case.ts), and
 * guessing at it would be exactly the unmeasured change this project keeps refusing.
 */
export const EXPERIENCE_SCORES = {
  /** Candidate sits at the level the posting asks for. */
  exact: 100,
  /** One rung over — comfortably able to do it. */
  slightlyOver: 85,
  /** Two or more rungs over — can do the work; may not want it. */
  farOver: 70,
  /** One rung under — a stretch, and people are hired into these. */
  slightlyUnder: 55,
  /** Two or more rungs under — not a realistic match. */
  farUnder: 25,
} as const;

/**
 * Score the seniority fit, or NULL when the posting states no seniority at all.
 *
 * NULL IS NOT A LOW SCORE. It means no comparison happened, and `blendMeasured` drops it
 * and rescales the remaining weights — the same contract `location` has. Substituting a
 * neutral number would reintroduce the constant this scorer was rewritten to remove.
 */
export function scoreExperience(
  candidate: Pick<CandidateContext, 'experienceCount'>,
  job: Pick<JobContext, 'requiredLevel'>,
): number | null {
  if (job.requiredLevel === null) return null;

  const gap = candidateLevel(candidate.experienceCount) - job.requiredLevel;
  if (gap === 0) return EXPERIENCE_SCORES.exact;
  if (gap === 1) return EXPERIENCE_SCORES.slightlyOver;
  if (gap > 1) return EXPERIENCE_SCORES.farOver;
  if (gap === -1) return EXPERIENCE_SCORES.slightlyUnder;
  return EXPERIENCE_SCORES.farUnder;
}
