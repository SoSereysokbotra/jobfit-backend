// Resolution rules, tested against REAL GeoNames rows (see location-fixtures.ts).
//
// These are the phase-1 acceptance criteria from
// docs/LOCATION_MATCHING_B_IMPLEMENTATION.md, written as tests so "it works" is
// checkable rather than asserted.

import { LocationIndex } from './location-index';
import { LOCATION_FIXTURES } from './location-fixtures';
import { normalizePlace, splitLocationParts } from './location-normalize';

const index = new LocationIndex(LOCATION_FIXTURES);

const PHNOM_PENH = 1821306;
const SIEM_REAP = 1822214;
const CHICAGO = 4887398;
const SAN_FRANCISCO = 5391959;
const BANGKOK = 1609350;
const SINGAPORE = 1880252;
const LONDON_GB = 2643743;
const LONDON_CA = 6058560;

/** The Khmer spelling of Phnom Penh, taken from the fixture's own alternate names. */
const KHMER_PHNOM_PENH = LOCATION_FIXTURES[0].alternateNames.find((a) =>
  /[ក-៿]/.test(a),
)!;

describe('normalizePlace', () => {
  it('folds case and whitespace', () => {
    expect(normalizePlace('  PHNOM   PENH ')).toBe('phnom penh');
  });

  it('folds Latin diacritics, so "Bogotá" and "Bogota" are one key', () => {
    expect(normalizePlace('Bogotá')).toBe(normalizePlace('Bogota'));
  });

  it('leaves non-Latin script intact — stripping marks would corrupt Khmer', () => {
    expect(normalizePlace(KHMER_PHNOM_PENH)).toBe(KHMER_PHNOM_PENH.toLowerCase());
  });

  it('splits on commas, slashes and semicolons', () => {
    expect(splitLocationParts('Toul Kork, Phnom Penh, Cambodia')).toEqual([
      'toul kork',
      'phnom penh',
      'cambodia',
    ]);
    expect(splitLocationParts('Phnom Penh / Remote')).toEqual(['phnom penh', 'remote']);
  });
});

describe('LocationIndex.resolveText', () => {
  it('resolves a plain city name', () => {
    expect(index.resolveText('Phnom Penh')?.geonameId).toBe(PHNOM_PENH);
  });

  it('is case- and spacing-insensitive', () => {
    expect(index.resolveText('  phnom   penh ')?.geonameId).toBe(PHNOM_PENH);
  });

  it('resolves Khmer script to the SAME place as the ASCII spelling', () => {
    const khmer = index.resolveText(KHMER_PHNOM_PENH);
    const ascii = index.resolveText('Phnom Penh');
    expect(khmer?.geonameId).toBe(PHNOM_PENH);
    expect(khmer?.geonameId).toBe(ascii?.geonameId);
  });

  it('resolves the "PNH" abbreviation to Phnom Penh', () => {
    expect(index.resolveText('PNH')?.geonameId).toBe(PHNOM_PENH);
  });

  it('ignores a district it does not know and resolves the city beside it', () => {
    expect(index.resolveText('Toul Kork, Phnom Penh, Cambodia')?.geonameId).toBe(PHNOM_PENH);
  });

  it('resolves a city + spelled-out country', () => {
    expect(index.resolveText('Bangkok, Thailand')?.geonameId).toBe(BANGKOK);
    expect(index.resolveText('Siem Reap, Cambodia')?.geonameId).toBe(SIEM_REAP);
  });

  // The trap that motivated the whole scoring rewrite: a two-letter token is ambiguous
  // between a US state code and an ISO country code.
  it('treats "IL" as Illinois, never as Israel', () => {
    const resolved = index.resolveText('Chicago, IL');
    expect(resolved?.geonameId).toBe(CHICAGO);
    expect(resolved?.countryCode).toBe('US');
    expect(resolved?.admin1Name).toBe('Illinois');
  });

  it('treats "CA" as California, never as Canada', () => {
    const resolved = index.resolveText('San Francisco, CA');
    expect(resolved?.geonameId).toBe(SAN_FRANCISCO);
    expect(resolved?.countryCode).toBe('US');
    expect(resolved?.admin1Name).toBe('California');
  });

  it('resolves a state spelled out in full', () => {
    expect(index.resolveText('Chicago, Illinois')?.geonameId).toBe(CHICAGO);
  });

  it('picks the larger city when a name is ambiguous across countries', () => {
    expect(index.resolveText('London')?.geonameId).toBe(LONDON_GB);
  });

  it('a named country overrides population — "London, Canada" is not London GB', () => {
    const resolved = index.resolveText('London, Canada');
    expect(resolved?.geonameId).toBe(LONDON_CA);
    expect(resolved?.countryCode).toBe('CA');
  });

  it('disambiguates a name repeated inside ONE country by province', () => {
    const mo = index.resolveText('Springfield, Missouri');
    const ma = index.resolveText('Springfield, MA');
    expect(mo?.admin1Name).toBe('Missouri');
    expect(ma?.admin1Name).toBe('Massachusetts');
    expect(mo?.geonameId).not.toBe(ma?.geonameId);
  });

  it('resolves a city-state, whose admin1 is legitimately null', () => {
    const resolved = index.resolveText('Singapore');
    expect(resolved?.geonameId).toBe(SINGAPORE);
    expect(resolved?.admin1Code).toBeNull();
  });

  it('resolves an alternate name that looks like a state code ("NY")', () => {
    expect(index.resolveText('New York, NY')?.countryCode).toBe('US');
  });

  // Returning null is the honest answer; callers must exclude location from the score
  // rather than substituting a neutral number.
  it.each([
    ['Remote', 'not a place — verified absent from the dataset'],
    ['', 'empty string'],
    ['   ', 'whitespace only'],
    ['asdfgh', 'nonsense'],
    ['12345', 'a postcode'],
  ])('returns null for %s (%s)', (input) => {
    expect(index.resolveText(input)).toBeNull();
  });

  it('returns null for null/undefined input', () => {
    expect(index.resolveText(null)).toBeNull();
    expect(index.resolveText(undefined)).toBeNull();
  });
});

describe('LocationIndex.resolveStructured', () => {
  it('resolves a profile city + country', () => {
    expect(index.resolveStructured('Phnom Penh', 'Cambodia')?.geonameId).toBe(PHNOM_PENH);
    expect(index.resolveStructured('Chicago', 'United States')?.geonameId).toBe(CHICAGO);
  });

  it('accepts an ISO-2 country code', () => {
    expect(index.resolveStructured('Phnom Penh', 'KH')?.geonameId).toBe(PHNOM_PENH);
  });

  it('uses the country to pick between same-named cities', () => {
    expect(index.resolveStructured('London', 'Canada')?.geonameId).toBe(LONDON_CA);
    expect(index.resolveStructured('London', 'United Kingdom')?.geonameId).toBe(LONDON_GB);
  });

  it('still resolves the city when the country is unrecognisable', () => {
    // A bad country string should not erase a perfectly good city.
    expect(index.resolveStructured('Phnom Penh', 'Kambodia')?.geonameId).toBe(PHNOM_PENH);
  });

  it('returns null without a city', () => {
    expect(index.resolveStructured(null, 'Cambodia')).toBeNull();
    expect(index.resolveStructured('', 'Cambodia')).toBeNull();
  });
});

describe('performance', () => {
  it('resolves 1000 strings in under 50ms', () => {
    const inputs = [
      'Phnom Penh',
      'Toul Kork, Phnom Penh, Cambodia',
      'Chicago, IL',
      'San Francisco, CA',
      'Bangkok, Thailand',
      'London',
      'Singapore',
      'asdfgh',
      KHMER_PHNOM_PENH,
      'Remote',
    ];
    const started = Date.now();
    for (let i = 0; i < 1000; i++) index.resolveText(inputs[i % inputs.length]);
    expect(Date.now() - started).toBeLessThan(50);
  });
});
