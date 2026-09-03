// Types for location resolution. See docs/LOCATION_MATCHING_B_IMPLEMENTATION.md.

/** The minimum a `locations` row needs to expose for resolution and scoring. */
export interface LocationRecord {
  geonameId: number;
  name: string;
  asciiName: string;
  alternateNames: string[];
  countryCode: string;
  countryName: string;
  /** NULL for city-states (verified: Singapore). Never the empty string. */
  admin1Code: string | null;
  admin1Name: string | null;
  population: number;
}

/**
 * A place both sides of a comparison have been resolved to.
 *
 * `admin1Code` stays nullable on purpose. Two places with an unknown province are NOT
 * in the same province, so every consumer must require both sides non-null before
 * claiming a province match — 25 of the 34,129 imported rows are city-states with no
 * admin1 at all, and treating null == null as a match would make every one of them
 * "the same province" as all the others.
 */
export interface ResolvedPlace {
  geonameId: number;
  name: string;
  countryCode: string;
  countryName: string;
  admin1Code: string | null;
  admin1Name: string | null;
}

/** One entry of the country list served to the onboarding/profile pickers. */
export interface CountryOption {
  /** ISO-3166 alpha-2. */
  code: string;
  name: string;
}

/** One city suggestion. `admin1Name` disambiguates the many Springfields. */
export interface CitySuggestion {
  geonameId: number;
  name: string;
  admin1Name: string | null;
  countryCode: string;
  countryName: string;
  population: number;
}
