// In-memory place index + the resolution algorithm.
//
// PURE ON PURPOSE. This file knows nothing about Nest or Prisma: it takes plain rows and
// answers questions about them. That is what lets the algorithm be unit-tested against
// fixtures without a database, which matters because resolution rules are exactly the
// kind of thing that breaks silently.
//
// WHY IN MEMORY: `GET /recommendations/by-job` runs once per job page the extension sees.
// A database round-trip per lookup would put a query on that hot path for data that
// changes about once a year.

import { normalizePlace, splitLocationParts } from './location-normalize';
import { LocationRecord, ResolvedPlace } from './location.types';

/**
 * Scoring weights for picking between candidates.
 *
 * THE ORDERING IS THE WHOLE DESIGN, and it exists to defuse one specific trap: a
 * two-letter token is ambiguous between a US-style state code and an ISO country code.
 * "San Francisco, CA" means California, but "CA" is also the ISO code for Canada; the old
 * regex scorer's equivalent confusion is documented in location-scorer.ts (a profile with
 * country "CA" matched every job in Cambodia).
 *
 * So an admin1 hit outweighs a bare ISO-code hit by 5×: "CA" beside "San Francisco"
 * resolves to California, never to Canada. A spelled-out country NAME is treated as
 * authoritative instead — nobody writes "Canada" when they mean California.
 */
const SCORE = {
  /** A part matched this row's province, by code ("IL") or name ("Illinois"). */
  admin1Match: 500,
  /** A part looked like an ISO-2 country code and matched. Weak — see above. */
  isoCodeMatch: 100,
  /** Population tie-break, capped so a big city can never outweigh a real signal. */
  maxPopulationBonus: 50,
};

/**
 * What the index retains per place — everything `ResolvedPlace` needs and nothing else.
 *
 * Deliberately NOT the input row: `alternateNames` is consumed while building the key
 * map and never read again, and holding those 350,340 strings alive afterwards measured
 * 12.7 MB for no benefit. Copying into a compact record lets the loaded rows be
 * collected.
 */
type IndexedPlace = Omit<LocationRecord, 'alternateNames' | 'asciiName'>;

interface Candidate {
  row: IndexedPlace;
  score: number;
}

export class LocationIndex {
  /** normalized place name (incl. every alternate) → row indices */
  private readonly byName = new Map<string, number[]>();
  /** normalized country name → ISO-2 */
  private readonly countryCodeByName = new Map<string, string>();
  /** ISO-2 (lowercased) → itself, for cheap membership tests */
  private readonly isoCodes = new Set<string>();
  private readonly rows: IndexedPlace[];

  constructor(rows: LocationRecord[]) {
    this.rows = rows.map((row) => ({
      geonameId: row.geonameId,
      name: row.name,
      countryCode: row.countryCode,
      countryName: row.countryName,
      admin1Code: row.admin1Code,
      admin1Name: row.admin1Name,
      population: row.population,
    }));

    rows.forEach((row, index) => {
      // Index the display name, the ASCII form, and every alternate GeoNames knows.
      // The alternates are what make "ភ្នំពេញ", "Phnom Penh" and "PNH" one place.
      this.addKey(normalizePlace(row.name), index);
      this.addKey(normalizePlace(row.asciiName), index);
      for (const alternate of row.alternateNames) {
        this.addKey(normalizePlace(alternate), index);
      }

      const countryKey = normalizePlace(row.countryName);
      if (countryKey) this.countryCodeByName.set(countryKey, row.countryCode);
      this.isoCodes.add(row.countryCode.toLowerCase());
    });
  }

  private addKey(key: string, index: number): void {
    if (!key) return;
    const existing = this.byName.get(key);
    if (existing) {
      // Alternates repeat the display name constantly; don't store the same row twice.
      if (existing[existing.length - 1] !== index) existing.push(index);
    } else {
      this.byName.set(key, [index]);
    }
  }

  get size(): number {
    return this.rows.length;
  }

  /** How many distinct lookup keys the index holds — reported for memory accounting. */
  get keyCount(): number {
    return this.byName.size;
  }

  /**
   * Resolve a free-text location string, as written on a job page.
   *
   * Handles "Phnom Penh", "Toul Kork, Phnom Penh, Cambodia", "Chicago, IL",
   * "Bangkok, Thailand". Returns null for anything it cannot place — including
   * "Remote", which is not a location and is verified absent from the dataset.
   * A null is the honest answer and callers must exclude location from the score
   * rather than substituting a neutral number.
   */
  resolveText(raw: string | null | undefined): ResolvedPlace | null {
    const parts = splitLocationParts(raw);
    if (parts.length === 0) return null;

    // A spelled-out country name is authoritative: it filters candidates rather than
    // merely favouring them.
    let countryFilter: string | null = null;
    for (const part of parts) {
      const code = this.countryCodeByName.get(part);
      if (code) {
        countryFilter = code;
        break;
      }
    }

    // A bare two-letter token could be a province code or an ISO country code. Both
    // readings are kept and weighted; see SCORE.
    const isoHints = new Set<string>();
    for (const part of parts) {
      if (part.length === 2 && this.isoCodes.has(part)) isoHints.add(part);
    }

    const best = this.bestCandidate(parts, countryFilter, isoHints);
    return best ? toResolvedPlace(best.row) : null;
  }

  /**
   * Resolve a profile's structured city + country.
   *
   * The country is a filter when we recognise it. When we don't (a typo, or a country
   * name spelled unusually) the city is still resolved on its own rather than failing —
   * a wrong-but-plausible country string should not erase a perfectly good city.
   */
  resolveStructured(
    city: string | null | undefined,
    country: string | null | undefined,
  ): ResolvedPlace | null {
    const cityKey = normalizePlace(city);
    if (!cityKey) return null;

    const countryKey = normalizePlace(country);
    const countryFilter =
      this.countryCodeByName.get(countryKey) ??
      (countryKey.length === 2 && this.isoCodes.has(countryKey) ? countryKey.toUpperCase() : null);

    const best = this.bestCandidate([cityKey], countryFilter, new Set());
    return best ? toResolvedPlace(best.row) : null;
  }

  /** Look up every part, score the candidates, return the winner. */
  private bestCandidate(
    parts: string[],
    countryFilter: string | null,
    isoHints: Set<string>,
  ): Candidate | null {
    let best: Candidate | null = null;

    for (const part of parts) {
      const indices = this.byName.get(part);
      if (!indices) continue;

      for (const index of indices) {
        const row = this.rows[index];

        // A named country is authoritative — a candidate elsewhere is simply wrong.
        if (countryFilter && row.countryCode !== countryFilter) continue;

        let score = 0;

        // Does any OTHER part name this row's province? "Chicago" + "IL"/"Illinois".
        const admin1Code = row.admin1Code?.toLowerCase();
        const admin1Name = normalizePlace(row.admin1Name);
        for (const other of parts) {
          if (other === part) continue;
          if ((admin1Code && other === admin1Code) || (admin1Name && other === admin1Name)) {
            score += SCORE.admin1Match;
            break;
          }
        }

        if (isoHints.has(row.countryCode.toLowerCase())) score += SCORE.isoCodeMatch;
        if (countryFilter) score += SCORE.admin1Match; // survived an authoritative filter

        // Tie-break only. Capped so "London, Canada" cannot be beaten by London GB
        // being twenty times larger.
        score += Math.min(row.population / 200_000, SCORE.maxPopulationBonus);

        if (!best || score > best.score) best = { row, score };
      }
    }

    return best;
  }
}

function toResolvedPlace(row: IndexedPlace): ResolvedPlace {
  return {
    geonameId: row.geonameId,
    name: row.name,
    countryCode: row.countryCode,
    countryName: row.countryName,
    admin1Code: row.admin1Code,
    admin1Name: row.admin1Name,
  };
}
