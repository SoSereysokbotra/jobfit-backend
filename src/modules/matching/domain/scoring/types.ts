// Plain inputs the pure scoring functions operate on. The use-case assembles
// these from Profile/Job/Company rows; the scorers stay free of Prisma/IO.

import { ResolvedPlace } from '../../../location/location.types';

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
}

export interface JobContext {
  remoteType: string; // "REMOTE" | "HYBRID" | "ON_SITE"
  /** The job's location, resolved. Null when unknown or unrecognised. */
  place: ResolvedPlace | null;
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
}

export interface SubScores {
  skills: number;
  experience: number;
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
