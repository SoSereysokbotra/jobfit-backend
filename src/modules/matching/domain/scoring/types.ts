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
  experienceCount: number; // # of experience entries we know about
}

export interface JobContext {
  remoteType: string; // "REMOTE" | "HYBRID" | "ON_SITE"
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
}
