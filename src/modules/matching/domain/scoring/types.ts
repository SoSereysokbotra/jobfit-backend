// Plain inputs the pure scoring functions operate on. The use-case assembles
// these from Profile/Job/Company rows; the scorers stay free of Prisma/IO.

import { ResolvedPlace } from '../../../location/location.types';
import { SeniorityLevel } from './experience-scorer';

export interface CandidateContext {
  /**
   * Where the candidate is, RESOLVED to a real place — not the raw city/country
   * strings this used to carry.
   *
   * The profile still stores strings; turning them into a place is the application
   * layer's job (LocationResolverService), so the scorers stay pure. Null when the
   * profile has no location, or names somewhere the place table does not know.
   */
  place: ResolvedPlace | null;
  desiredRemoteTypes: string[]; // RemoteType[] e.g. ["REMOTE","HYBRID"]
  minSalary: number | null;
  maxSalary: number | null;
  desiredIndustries: string[]; // Industry ids
  experienceCount: number; // # of experience entries we know about
  /**
   * `JobLevel[]` the candidate asked for, e.g. ["SENIOR","LEAD"]. Raw enum strings, as
   * stored on the profile.
   *
   * COLLECTED SINCE THE FIRST PROFILE FORM AND READ BY NOTHING until the preference
   * dimension existed. An EMPTY OR ABSENT list is "never stated", which scores as full
   * marks — not as a mismatch. Only a non-empty list is a statement.
   */
  desiredJobLevels?: string[];
  /**
   * `EmploymentType[]` the candidate asked for, e.g. ["FULL_TIME","CONTRACT"]. Same
   * empty-means-no-preference contract as `desiredJobLevels`.
   */
  desiredEmploymentTypes?: string[];
}

export interface JobContext {
  /**
   * "REMOTE" | "HYBRID" | "ON_SITE", or NULL/absent when the posting does not say.
   *
   * Nullable because the preference dimension has to tell "on-site" apart from "unstated":
   * the first is a fact to score against a remote-only candidate, the second is nothing to
   * score at all (see `scoreWorkArrangement`, which returns a neutral 70 for it rather
   * than a penalty).
   */
  remoteType?: string | null;
  /** The job's location, resolved. Null when unknown or unrecognised. */
  place: ResolvedPlace | null;
  /**
   * How senior the posting is, resolved to the shared ladder. Null when it says nothing —
   * two jobs in three on the live corpus.
   *
   * Derived in the application layer (`deriveJobLevel`) for the same reason `place` is:
   * the scorers stay a pure comparison of two already-resolved values, and the messy part
   * — a structured column when it exists, the title when it does not — is testable on its
   * own.
   */
  requiredLevel: SeniorityLevel | null;
  /**
   * The location as originally written ("Toul Kork, Phnom Penh"). DISPLAY ONLY — it is
   * what the reason lines quote back to the user. It is never compared against
   * anything: comparing location strings is precisely what `place` replaced.
   */
  locationLabel: string | null;
  minSalary: number | null;
  maxSalary: number | null;
  /**
   * The company's industry NAME, already resolved from the `companies.industry` id.
   *
   * Passing the raw column here is a bug: it holds an Industry id while
   * `CandidateContext.desiredIndustries` holds names, so the two can never match. See
   * scoreOther.
   */
  industry: string | null;
  /**
   * `EmploymentType` as the posting states it ("FULL_TIME", "CONTRACT", ...). Null when
   * the employer did not say — nullable on the `jobs` column for exactly that reason, and
   * null must not read as FULL_TIME.
   *
   * PREFERENCE-DIMENSION INPUT ONLY. It is compared against `desiredEmploymentTypes`; it
   * never feeds the role/capability score.
   */
  employmentType?: string | null;
  /**
   * `JobLevel` as the posting states it ("SENIOR", "MID", ...) — the raw structured
   * column, NOT the resolved `requiredLevel` above.
   *
   * The two are deliberately separate. `requiredLevel` answers "how senior is this work?"
   * and falls back to the title, because capability matching needs an answer for the two
   * jobs in three that carry no structured level. This one answers "did the employer
   * state a level the candidate asked for?", and an inference from a title is not a
   * statement by the employer — so it stays null and scores as unstated (80).
   */
  jobLevel?: string | null;
}

export interface SubScores {
  skills: number;
  /**
   * NULL when the posting states no seniority — no structured `experienceLevel` and no
   * recognisable signal in the title.
   *
   * Same contract as `location` below: a number here claims two seniorities were actually
   * compared. This used to be a function of the CANDIDATE ALONE, so it returned the same
   * value for every job in a pool and a quarter of the weight did no ranking work at all.
   */
  experience: number | null;
  /**
   * NULL when location could not be measured — neither side resolved to a known place.
   *
   * A number here is a claim that two places were actually compared. Substituting a
   * "neutral" value is the exact bug this rewrite removes: the old scorer returned 50 or
   * 55 for anything it could not match, which read as a measurement and moved every
   * total. Consumers must EXCLUDE a null from the weighted average (see `weightedMatch`)
   * and render it as "not computed", the way `semantic: false` already excludes skills.
   */
  location: number | null;
  salary: number;
  other: number;
}

/**
 * The two-way honest summary that travels with a score.
 *
 * WHY WARNINGS EXIST AT ALL: the previous explanation emitted positive bits only — it
 * could say "strong skills match, salary in range" about a job that was on-site in
 * another country for someone who had asked for remote, because nothing in the pipeline
 * had anywhere to put that fact. A user reading "Strong Match" then discovered the
 * conflict on the posting itself. Highlights and warnings are produced by the SAME pass,
 * so a conflict cannot be silently dropped while the compliments survive.
 */
export interface MatchFlags {
  /**
   * At least one preference the candidate stated is violated outright (a preference
   * sub-score of 0), rather than merely stretched.
   */
  hasDealbreakerMismatch: boolean;
  /** Logistical conflicts, phrased for a user. Empty when there are none. */
  warnings: string[];
  /** What genuinely fits. Empty when there is nothing to claim. */
  highlights: string[];
}

/**
 * One job scored on both dimensions.
 *
 * `roleFitScore` and `preferenceFitScore` are ORTHOGONAL on purpose: capability and
 * logistics answer different questions, and averaging them into one number is what let a
 * 95% capability match carry a job that violated every stated preference to "70% — Strong
 * Match". Both are published so a client can show why the composite landed where it did.
 */
export interface TwoDimensionalScoreResult {
  /** 0-100 integer. Gated composite — the ranking key. See `compositeScore`. */
  overallScore: number;
  /** 0-100 integer. Capability: skills + seniority against the posting. */
  roleFitScore: number;
  /** 0-100 integer. Logistics: arrangement, location, employment type, level, salary. */
  preferenceFitScore: number;
  band: 'STRONG' | 'POSSIBLE' | 'WEAK';
  flags: MatchFlags;
  /** Human-readable, highlights and warnings in one line. */
  explanation: string;
}
