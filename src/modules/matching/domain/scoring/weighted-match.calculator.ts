// Combines the sub-scores into a single 0-100 total:
//   skills 40% + experience 25% + location 15% + salary 10% + other 10%.

import {
  CandidateContext,
  JobContext,
  MatchFlags,
  SubScores,
  TwoDimensionalScoreResult,
} from './types';
import { isRemoteOnly } from './location-scorer';
import { SeniorityLevel, seniorityFromJobLevel } from './experience-scorer';

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

// ─────────────────────────────────────────────────────────────────────────────
// TWO-DIMENSIONAL MATCHING (Approach C)
//
// THE PROBLEM THIS REPLACES. `weightedMatch` above is one linear sum over five parts, and
// skills + experience are 65% of it. So a résumé that reads well against a posting earns
// ~60 points before anything the candidate actually ASKED FOR is considered — and the
// remaining 35% cannot pull the total below "Strong Match". A job that was on-site in
// another country, full-time when the user wanted contract, and paid under their floor
// still finished above 70%. Worse, `desiredEmploymentTypes` and `desiredJobLevels` were
// collected on the profile form and read by NOTHING, and a missing sub-score rescaled the
// remaining weights UPWARD, so a posting that stated less about itself scored higher.
//
// THE FIX IS NOT REWEIGHTING. Any single weighted sum has the same shape: capability can
// always buy back a logistical no. So capability and logistics are scored SEPARATELY —
// they answer different questions and averaging them destroys both answers — and the
// ranking key is a composite in which a low preference score DAMPS the role score
// multiplicatively rather than being outvoted by it.
//
// Everything here is a pure function of two already-resolved contexts, like the rest of
// this directory. No Prisma, no IO, no network.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Role fit = capability only. Skills lead because they are the measured signal (a real
 * embedding cosine); seniority is a coarse ladder comparison and takes the smaller share.
 *
 * These are RELATIVE weights within the role dimension, not slices of a 100% total any
 * more — which is the point of splitting the dimensions. When `experience` is null (the
 * posting states no seniority — two jobs in three) `blendMeasured` rescales skills to
 * 100%, which is honest here in a way it was not in the old single sum: rescaling inside
 * a dimension keeps that dimension's meaning, while rescaling across dimensions let a
 * missing logistical fact inflate a capability claim.
 */
export const ROLE_WEIGHTS = {
  skills: 0.6,
  experience: 0.4,
} as const;

/**
 * Preference fit = the candidate's explicit statements, weighted by how costly getting
 * each one wrong is.
 *
 * Work arrangement and location lead because they are the constraint people actually
 * cannot bend — a job in the wrong country is not a job you can take, whatever it pays.
 * Salary sits level with job level because a stated floor is negotiable in a way a
 * relocation is not.
 *
 * NOT CALIBRATED AGAINST LABELLED DATA, and saying so matters here: these are the spec's
 * numbers, chosen for their ordering, not read off a distribution the way match-band.ts's
 * thresholds were. The eval set has 2 candidates.
 */
export const PREFERENCE_WEIGHTS = {
  workArrangement: 0.35,
  employmentType: 0.25,
  jobLevel: 0.2,
  salary: 0.2,
} as const;

/**
 * The gate.
 *
 * `alpha` is the floor: the share of the role score that survives even when EVERY stated
 * preference is violated. At 0.30 a 95% capability match with zero preference fit lands
 * at 29 — visibly weak, still present in the list rather than deleted, because "you could
 * do this job but it is in the wrong country" is information, not noise.
 *
 * `gamma` shapes the curve between. At 1.0 the damping is linear in P, which is the
 * conservative choice: any other exponent asserts a shape about how users trade
 * capability against logistics, and nothing here has measured that.
 */
export const GATING = {
  alpha: 0.3,
  gamma: 1.0,
} as const;

/** Neutral values — "the posting does not say", never "the posting says no". */
export const PREFERENCE_NEUTRAL = {
  /** Arrangement or location unstated: cannot be compared, must not be punished. */
  workArrangement: 70,
  /** Employment type unstated. Below full marks: it is an unknown, not a match. */
  employmentType: 80,
  /** Job level unstated — the common case (67% of the corpus states no level). */
  jobLevel: 80,
} as const;

/** One preference component: its score plus whatever it is entitled to claim about itself. */
export interface PreferenceComponent {
  /** 0-100, or NULL when the component could not be evaluated and must be excluded. */
  score: number | null;
  warning?: string;
  highlight?: string;
}

/** `EmploymentType` enum value -> something a user can read. */
const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  TEMPORARY: 'Temporary',
  FREELANCE: 'Freelance',
};

/** `JobLevel` enum value -> something a user can read. */
const JOB_LEVEL_LABELS: Record<string, string> = {
  INTERN: 'Intern',
  ENTRY: 'Entry-level',
  MID: 'Mid-level',
  SENIOR: 'Senior',
  LEAD: 'Lead',
  MANAGER: 'Manager',
  DIRECTOR: 'Director',
  C_LEVEL: 'C-level',
};

/**
 * Enum value -> label, falling back to the raw value.
 *
 * Warnings are shown to a user, so what they read is "Full-time role (differs from
 * preferred)", not "FULL_TIME role (differs from preferred)". The fallback keeps an enum
 * value this map has not caught up with visible rather than swallowed.
 */
function label(value: string, labels: Record<string, string>): string {
  return labels[value.trim().toUpperCase()] ?? value;
}

/** Trim + upper-case an enum-ish string; null for anything blank. */
function normalizeEnum(value: string | null | undefined): string | null {
  const v = value?.trim().toUpperCase();
  return v ? v : null;
}

/** Non-empty, normalised preference list. Empty/absent means "never stated". */
function statedPreferences(values: string[] | undefined | null): string[] {
  return (values ?? [])
    .map((v) => normalizeEnum(v))
    .filter((v): v is string => v !== null);
}

/**
 * A. Work arrangement & location (35%).
 *
 * Two questions in one component because they are one question to the user: "can I
 * actually be where this job needs me to be?". Splitting them would let a remote-only
 * candidate's on-site conflict be diluted by a geographic score that means nothing for a
 * job they cannot take at all.
 *
 * The remote-only branch is the reported bug. `desiredRemoteTypes: ["REMOTE"]` is an
 * explicit, exclusive statement — someone open to hybrid ticks hybrid — so an on-site or
 * hybrid posting scores 0 here. Not a low number: zero, because the gate below is what
 * turns that into a visible demotion rather than a few lost points.
 */
export function scoreWorkArrangement(
  candidate: Pick<CandidateContext, 'place' | 'desiredRemoteTypes'>,
  job: Pick<JobContext, 'remoteType' | 'place'>,
): PreferenceComponent {
  const arrangement = normalizeEnum(job.remoteType);

  // The posting does not say how the work happens. Nothing to compare — neutral, and
  // deliberately silent: warning here would be inventing a conflict out of a gap in the
  // data, which is the failure the location rewrite already removed once.
  if (!arrangement) return { score: PREFERENCE_NEUTRAL.workArrangement };

  if (arrangement === 'REMOTE') return { score: 100, highlight: 'Fully remote' };

  // On-site or hybrid, and the candidate ticked REMOTE and nothing else.
  if (isRemoteOnly(candidate.desiredRemoteTypes)) {
    return { score: 0, warning: 'Requires on-site / hybrid presence' };
  }

  const here = candidate.place;
  const there = job.place;
  // One side names a place we cannot resolve. Same contract as `scoreLocation`: no
  // comparison happened, so no verdict — but this component carries the arrangement
  // question too, so it stays in the average at the neutral value rather than dropping out.
  if (!here || !there) return { score: PREFERENCE_NEUTRAL.workArrangement };

  if (here.geonameId === there.geonameId) {
    return { score: 100, highlight: `On-site in ${there.name}, where you are` };
  }
  if (here.countryCode === there.countryCode) {
    return { score: 50, warning: `Located in ${there.name} (different city)` };
  }
  return {
    score: 0,
    warning: `Located in ${there.countryName} (relocation required)`,
  };
}

/**
 * B. Employment type (25%).
 *
 * `desiredEmploymentTypes` has been on the profile form since the beginning and was read
 * by nothing, so a candidate who asked for contract work was shown full-time roles with
 * no acknowledgement anywhere that they had said otherwise.
 */
export function scoreEmploymentType(
  candidate: Pick<CandidateContext, 'desiredEmploymentTypes'>,
  job: Pick<JobContext, 'employmentType'>,
): PreferenceComponent {
  const desired = statedPreferences(candidate.desiredEmploymentTypes);
  if (desired.length === 0) return { score: 100 }; // no preference — nothing to violate

  const actual = normalizeEnum(job.employmentType);
  if (!actual) return { score: PREFERENCE_NEUTRAL.employmentType };

  if (desired.includes(actual)) {
    return {
      score: 100,
      highlight: `${label(actual, EMPLOYMENT_TYPE_LABELS)} role, as you asked`,
    };
  }
  return {
    score: 0,
    warning: `${label(actual, EMPLOYMENT_TYPE_LABELS)} role (differs from preferred)`,
  };
}

/**
 * C. Job level (20%).
 *
 * Graded by DISTANCE on the shared seniority ladder rather than by equality: a candidate
 * who asked for SENIOR is not equally badly served by a MID posting and an INTERN one,
 * and collapsing both to "mismatch" is the same flattening that made the old location
 * scorer useless.
 *
 * The comparison uses `job.jobLevel` — the employer's structured statement — not the
 * title-derived `requiredLevel`. Preference compliance is about what was STATED; guessing
 * a level from a title and then warning the user the job "is" that level would put our
 * inference in front of them as the employer's fact.
 */
export function scoreJobLevel(
  candidate: Pick<CandidateContext, 'desiredJobLevels'>,
  job: Pick<JobContext, 'jobLevel'>,
): PreferenceComponent {
  const desired = statedPreferences(candidate.desiredJobLevels);
  if (desired.length === 0) return { score: 100 };

  const actual = normalizeEnum(job.jobLevel);
  if (!actual) return { score: PREFERENCE_NEUTRAL.jobLevel };

  const actualRung = seniorityFromJobLevel(actual);
  const rungs = desired
    .map((d) => seniorityFromJobLevel(d))
    .filter((r): r is SeniorityLevel => r !== null);

  // An unknown value on either side — the ladder cannot measure it. Fall back to exact
  // string equality, which is all that is left, rather than asserting a distance.
  if (actualRung === null || rungs.length === 0) {
    return desired.includes(actual)
      ? { score: 100, highlight: `${label(actual, JOB_LEVEL_LABELS)} role, as you asked` }
      : { score: 20, warning: `Role level is ${label(actual, JOB_LEVEL_LABELS)}` };
  }

  // Best of the levels they said yes to: asking for SENIOR *or* LEAD means a LEAD posting
  // is an exact match, not the average of two comparisons.
  const distance = Math.min(...rungs.map((r) => Math.abs(r - actualRung)));
  if (distance === 0) {
    return {
      score: 100,
      highlight: `${label(actual, JOB_LEVEL_LABELS)} role, as you asked`,
    };
  }
  // One rung away — a real difference, not a dealbreaker, and people move a rung in both
  // directions all the time. Scored down, deliberately not warned about.
  if (distance === 1) return { score: 60 };
  return { score: 20, warning: `Role level is ${label(actual, JOB_LEVEL_LABELS)}` };
}

/**
 * D. Salary (20%), or NULL when there is nothing to compare.
 *
 * NULL, NOT NEUTRAL. An undisclosed salary is the most common gap in this corpus, and a
 * neutral number for it would assert a measurement that never happened — so the component
 * is dropped and the other three preference weights rescale (`blendMeasured`). Same
 * contract `location` has carried since the location rewrite.
 *
 * Compared against the candidate's FLOOR only. A ceiling is a wish; a floor is the number
 * below which they said they cannot take the job, and it is the only side of their stated
 * range a posting can violate.
 */
export function scoreSalaryPreference(
  candidate: Pick<CandidateContext, 'minSalary'>,
  job: Pick<JobContext, 'minSalary' | 'maxSalary'>,
): PreferenceComponent {
  const floor = candidate.minSalary;
  if (floor == null || floor <= 0) return { score: null }; // no stated floor

  // A posting that states only a minimum still states something: that minimum is what it
  // commits to, so it stands in for the unknown top of the band. Both absent is silence.
  const offered = job.maxSalary ?? job.minSalary;
  if (offered == null) return { score: null };

  if (offered >= floor) return { score: 100, highlight: 'Salary matches target' };

  const ratio = offered / floor;
  if (ratio >= 0.85) {
    return { score: 60, warning: 'Salary slightly below requested range' };
  }
  return { score: 0, warning: 'Salary below requested range' };
}

/** The four preference components, in the order they are reported. */
export interface PreferenceBreakdown {
  workArrangement: PreferenceComponent;
  employmentType: PreferenceComponent;
  jobLevel: PreferenceComponent;
  salary: PreferenceComponent;
}

export function evaluatePreferences(
  candidate: CandidateContext,
  job: JobContext,
): PreferenceBreakdown {
  return {
    workArrangement: scoreWorkArrangement(candidate, job),
    employmentType: scoreEmploymentType(candidate, job),
    jobLevel: scoreJobLevel(candidate, job),
    salary: scoreSalaryPreference(candidate, job),
  };
}

/**
 * The most a job can score on preferences once it has broken one outright.
 *
 * WHY A CEILING EXISTS AT ALL — and this is a deliberate departure from a plain weighted
 * average, so it is worth being explicit. Take the reported bug exactly as filed: a
 * remote-only candidate, a 95% résumé match, an on-site job in another country. The
 * candidate stated ONE preference, so the other components have nothing to measure and
 * sit at their "no preference" 100, and the average comes out
 *
 *   (0×0.35 + 100×0.25 + 100×0.20) / 0.80 = 56   ->   C = 95 × (0.3 + 0.7×0.56) = 66
 *
 * — POSSIBLE. The bug survives the rewrite. A weighted average cannot express a
 * dealbreaker, because averaging is exactly the operation that lets four things the user
 * never mentioned outvote the one thing they did.
 *
 * A DEALBREAKER IS CATEGORICAL, NOT QUANTITATIVE. "I cannot work on-site" is not 35% of
 * an opinion, and matching on employment type does not partially undo it. So a component
 * scoring 0 — which happens ONLY on a preference the candidate actually stated and the
 * job actually violates, never on missing data — caps the whole dimension here. 25 keeps
 * the ordering underneath the cap intact (a job breaking one preference still scores
 * above one breaking three) while putting anything that breaks one at C = 45 or below for
 * even a perfect résumé: WEAK, which is the honest label.
 *
 * This is the one place the implementation departs from §2.2 of the spec, and it does so
 * because §2.2 and the spec's own acceptance test contradict each other: Test Case 1
 * requires preferenceFitScore ≤ 30 and an overall score below 50 for precisely the case
 * the average puts at 56 and 66.
 */
export const DEALBREAKER_CEILING = 25;

/**
 * Preference fit, 0-100. Weighted over the components that could be evaluated, then
 * capped if any of them was broken outright.
 *
 * Falls back to 100 only when NOTHING could be evaluated — which, salary being the sole
 * nullable component, cannot happen today. A candidate who has stated no preferences has
 * nothing to be incompatible with, and damping their matches for that would punish an
 * empty form rather than a bad job.
 */
export function preferenceFit(breakdown: PreferenceBreakdown): number {
  const average =
    blendMeasured([
      [breakdown.workArrangement.score, PREFERENCE_WEIGHTS.workArrangement],
      [breakdown.employmentType.score, PREFERENCE_WEIGHTS.employmentType],
      [breakdown.jobLevel.score, PREFERENCE_WEIGHTS.jobLevel],
      [breakdown.salary.score, PREFERENCE_WEIGHTS.salary],
    ]) ?? 100;

  const broken = [
    breakdown.workArrangement,
    breakdown.employmentType,
    breakdown.jobLevel,
    breakdown.salary,
  ].some((c) => c.score === 0);

  return broken ? Math.min(average, DEALBREAKER_CEILING) : average;
}

/**
 * Role fit, 0-100. Skills, plus seniority when the posting states one.
 *
 * `experience` null rescales skills to 100% — see ROLE_WEIGHTS. Skills is never null (a
 * missing embedding arrives as cosine 0, which is a measured zero rather than an
 * absence), so the `?? 0` fallback is unreachable.
 */
export function roleFit(skills: number, experience: number | null): number {
  return (
    blendMeasured([
      [skills, ROLE_WEIGHTS.skills],
      [experience, ROLE_WEIGHTS.experience],
    ]) ?? 0
  );
}

/**
 * The gated composite: `C = R × (α + (1 − α) × (P/100)^γ)`.
 *
 * MULTIPLICATIVE, NOT ADDITIVE, and that is the whole design. In a weighted sum a
 * preference score of 0 costs a fixed number of points and capability simply outvotes it;
 * here it multiplies the capability score down to its floor. Worked through at α = 0.30:
 *
 *   R 95, P 100 -> 95 × (0.30 + 0.70×1.00) = 95   (nothing to damp)
 *   R 95, P  60 -> 95 × (0.30 + 0.70×0.60) = 68   (POSSIBLE, with the warning shown)
 *   R 95, P   0 -> 95 × (0.30 + 0)         = 29   (WEAK — it can no longer mislead)
 *
 * The score stays MONOTONIC IN BOTH INPUTS, which is what keeps it usable as a sort key:
 * at equal preference fit the better-qualified job still ranks higher.
 */
export function compositeScore(role: number, preference: number): number {
  const p = Math.max(0, Math.min(100, preference)) / 100;
  const damping = GATING.alpha + (1 - GATING.alpha) * Math.pow(p, GATING.gamma);
  return Math.round(role * damping);
}

/**
 * Band for a two-dimensional composite.
 *
 * DIFFERENT THRESHOLDS FROM `matchBand`, on purpose. That function's 57/51 cut points
 * were read off the observed distribution of the OLD linear score, whose entire range was
 * 41–69; they describe that number and would be meaningless applied to this one, which
 * uses much more of the 0–100 scale because the gate pushes preference-violating jobs
 * down into the twenties. 70/50 are the spec's round numbers and are honestly
 * provisional: like the preference weights they were chosen for their ordering, not
 * derived from human grades. Re-derive both when the label set can support it.
 */
export function twoDimensionalBand(
  score: number,
): TwoDimensionalScoreResult['band'] {
  if (!Number.isFinite(score)) return 'WEAK';
  if (score >= 70) return 'STRONG';
  if (score >= 50) return 'POSSIBLE';
  return 'WEAK';
}

/** How the skills number is described in prose. */
function skillsPhrase(skills: number): string {
  if (skills >= 70) return `Strong skills match (${skills}%)`;
  if (skills >= 45) return `Partial skills match (${skills}%)`;
  return `Limited skills overlap (${skills}%)`;
}

/**
 * One line carrying BOTH sides.
 *
 * The format is fixed — `"{title}: {highlights} — Note: {warnings}."` — because the
 * warning half is the part that was missing, and letting each caller shape it differently
 * is how it goes missing again. With nothing to warn about, the sentence simply ends.
 */
export function buildExplanation(
  title: string | null | undefined,
  flags: MatchFlags,
  lead?: string | null,
): string {
  const head = title ? `${title}: ` : '';
  const bits = [...(lead ? [lead] : []), ...flags.highlights];
  const body = bits.length > 0 ? bits.join(', ') : 'no measured strengths';
  if (flags.warnings.length === 0) return `${head}${body}.`;
  return `${head}${body} — Note: ${flags.warnings.join('; ')}.`;
}

/**
 * Score one job on both dimensions.
 *
 * `skills` and `experience` are passed in rather than computed here because they already
 * exist upstream: skills is the embedding cosine mapped to 0-100, experience is
 * `scoreExperience`. This function is the part that was missing — the preference pass and
 * the gate — not a replacement for the capability scorers.
 */
export function computeTwoDimensionalMatch(params: {
  candidate: CandidateContext;
  job: JobContext;
  /** 0-100 skills score (`scoreSkills(cosineSim)`). */
  skills: number;
  /** 0-100 seniority score, or null when the posting states no level. */
  experience: number | null;
  /** Job title, for the explanation. Omitted -> the sentence starts with the highlights. */
  title?: string | null;
}): TwoDimensionalScoreResult {
  const preferences = evaluatePreferences(params.candidate, params.job);
  const components = [
    preferences.workArrangement,
    preferences.employmentType,
    preferences.jobLevel,
    preferences.salary,
  ];

  const warnings = components
    .map((c) => c.warning)
    .filter((w): w is string => !!w);
  const highlights = components
    .map((c) => c.highlight)
    .filter((h): h is string => !!h);

  // A component that scored ZERO is a preference the candidate stated and this job
  // violates outright — the components never return 0 for missing data, only for a
  // measured conflict. That distinction is the flag's entire meaning.
  const hasDealbreakerMismatch = components.some((c) => c.score === 0);

  const phrase = skillsPhrase(params.skills);
  // A weak skills score is not a highlight, but it still has to lead the sentence — the
  // explanation would otherwise open with the salary and leave the user to infer the rest.
  const skillsIsPositive = params.skills >= 45;
  const flags: MatchFlags = {
    hasDealbreakerMismatch,
    warnings,
    highlights: skillsIsPositive ? [phrase, ...highlights] : highlights,
  };

  const role = roleFit(params.skills, params.experience);
  const preference = preferenceFit(preferences);
  const overallScore = compositeScore(role, preference);

  return {
    overallScore,
    roleFitScore: role,
    preferenceFitScore: preference,
    band: twoDimensionalBand(overallScore),
    flags,
    explanation: buildExplanation(
      params.title,
      flags,
      skillsIsPositive ? null : phrase,
    ),
  };
}
