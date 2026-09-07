// Location match (weight 15%). Compares two RESOLVED places by how much geography they
// share. Deterministic, no GPU, no network, no geocoding.
//
// WHAT THIS REPLACED, and why it had to go: the previous version compared the job's
// location TEXT against the profile's city/country text with a word-boundary regex. That
// made a user's score depend on how they spelled their own city — "Phnom Penh" matched a
// job listed as "Toul Kork, Phnom Penh" while "PP", Khmer script, or a blank profile
// scored the same 50–55 as a job in Bangkok. Worse, EVERY non-match collapsed to a single
// value, so a job across the city and a job across the world were indistinguishable.
// The measured consequences are in docs/LOCATION_MATCHING_ROOT_PROBLEM.md.
//
// Resolution happens in the application layer (LocationResolverService), so this file
// stays a pure function of two places.
//
// The parameters are `Pick`ed down to what is actually read. Full CandidateContext /
// JobContext values still satisfy them, so scoring calls are unchanged — but retrieval
// can now rank a bare {id, remoteType, place} row through this SAME ladder without
// inventing the salary and industry fields it has no use for. Retrieval and scoring
// agreeing on what "near me" means is the point: a job promoted into the pool because it
// is local must score as local once it gets there.

import { CandidateContext, JobContext } from './types';

/**
 * Would this candidate take a remote job?
 *
 * An EMPTY list is "no preference stated", not "no". Only an explicit list that omits
 * REMOTE is a refusal.
 */
export function acceptsRemote(desiredRemoteTypes: string[]): boolean {
  return desiredRemoteTypes.length === 0 || desiredRemoteTypes.includes('REMOTE');
}

/**
 * Does this candidate work remotely and ONLY remotely?
 *
 * The hard-constraint case: they ticked REMOTE and nothing else on a multi-select, which
 * is an explicit, exclusive statement — someone who would also take hybrid ticks hybrid.
 * Retrieval treats this as a filter rather than a preference; see
 * RecomputeUserMatchesUseCase.
 */
export function isRemoteOnly(desiredRemoteTypes: string[]): boolean {
  return (
    desiredRemoteTypes.length > 0 &&
    desiredRemoteTypes.every((type) => type === 'REMOTE')
  );
}

/**
 * The ladder. Each rung answers "how much geography do these two share?".
 *
 * The gaps between rungs are the point: under the old scorer a Bangkok job and a Siem
 * Reap job both scored 55 for a Phnom Penh candidate, so location contributed nothing to
 * ranking. Here they differ by 40 points.
 */
export const LOCATION_SCORES = {
  /** A remote job suits any candidate, wherever they are. */
  remote: 100,
  sameCity: 100,
  sameProvince: 85,
  sameCountry: 70,
  differentCountry: 30,
} as const;

/**
 * Score the geographic fit, or NULL when it could not be measured.
 *
 * NULL IS NOT A LOW SCORE, and callers must not coerce it into one. It means no
 * comparison happened — the profile has no location, or one side names a place the table
 * does not know. `weightedMatch` drops it and rescales the remaining weights; the UI says
 * "not computed". Returning a neutral number instead would reintroduce exactly the
 * failure this scorer was rewritten to remove.
 */
export function scoreLocation(
  candidate: Pick<CandidateContext, 'place' | 'desiredRemoteTypes'>,
  job: Pick<JobContext, 'remoteType' | 'place'>,
): number | null {
  // A remote job removes the geography problem — but only for someone who is willing to
  // work remotely. This used to be unconditional, which handed a PERFECT location score
  // to every remote posting for every candidate, including the ones who had explicitly
  // asked for on-site work. `desiredRemoteTypes` was collected from those users, stored,
  // and read by nothing: not this scorer, not retrieval. The visible effect was remote
  // postings floating to the top of everybody's list on an unearned 100 — in the
  // location-fix measurement run, "Remote (US)" ranked 4th for a Phnom Penh profile and
  // 4th again for a San Francisco one, identically, because the score had nothing to do
  // with either of them.
  //
  // An empty preference list means the user never said, so the old reading still stands:
  // remote suits a candidate who has expressed no view.
  if (job.remoteType === 'REMOTE' && acceptsRemote(candidate.desiredRemoteTypes)) {
    return LOCATION_SCORES.remote;
  }

  // A remote job for someone who does NOT want remote falls through to the ordinary
  // geographic comparison rather than taking a fabricated penalty. If the posting names a
  // place, that place is compared like any other; if it names none, the answer is null —
  // not measured. Inventing a mismatch number here would be the same error as the
  // neutral-50 this scorer was rewritten to remove: the retrieval filter is where a hard
  // "remote only" preference is enforced, honestly and visibly, not a magic constant.

  const here = candidate.place;
  const there = job.place;
  if (!here || !there) return null;

  if (here.geonameId === there.geonameId) return LOCATION_SCORES.sameCity;

  if (here.countryCode === there.countryCode) {
    // BOTH sides must actually have a province for "same province" to mean anything.
    // 25 of the 34,129 imported places are city-states with no admin1 at all (verified:
    // Singapore), and `null === null` would rank every one of them as being in the same
    // province as all the others.
    if (here.admin1Code && there.admin1Code && here.admin1Code === there.admin1Code) {
      return LOCATION_SCORES.sameProvince;
    }
    return LOCATION_SCORES.sameCountry;
  }

  // Deliberately no "neighbouring country" rung: knowing that Cambodia borders Thailand
  // needs an adjacency table nothing here has, and guessing it would be inventing data.
  return LOCATION_SCORES.differentCountry;
}
