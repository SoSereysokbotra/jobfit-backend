// TEST SUPPORT ONLY — not referenced by any production code path.
//
// A LocationResolverService backed by the fixture rows instead of the database, so specs
// that need scoring can resolve real places (Phnom Penh, Chicago, Bangkok…) without a
// Prisma connection or a 34,129-row load.
//
// Deliberately the REAL LocationIndex rather than a hand-written fake: a stub that
// returned canned answers would let the scorer's callers pass while actual resolution was
// broken, which is the failure mode these tests exist to catch.

import { LocationIndex } from './location-index';
import { LOCATION_FIXTURES } from './location-fixtures';
import { LocationResolverService } from './location-resolver.service';
import { ResolvedPlace } from './location.types';

/** A resolver over the fixtures. Cast at the call site; it satisfies the public surface. */
export function stubLocationResolver(): LocationResolverService {
  const index = new LocationIndex(LOCATION_FIXTURES);
  return {
    isReady: true,
    resolveText: (raw: string | null | undefined): ResolvedPlace | null =>
      index.resolveText(raw),
    resolveStructured: (
      city: string | null | undefined,
      country: string | null | undefined,
    ): ResolvedPlace | null => index.resolveStructured(city, country),
  } as unknown as LocationResolverService;
}

/**
 * A resolver that knows nothing — every lookup returns null.
 *
 * For asserting the degraded path: an empty `locations` table, or a place the dataset
 * does not contain. Location must then be reported as NOT MEASURED and dropped from the
 * total, never scored as a neutral number.
 */
export function emptyLocationResolver(): LocationResolverService {
  return {
    isReady: false,
    resolveText: () => null,
    resolveStructured: () => null,
  } as unknown as LocationResolverService;
}
