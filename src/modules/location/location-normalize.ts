// Text normalisation for location lookup.
//
// The ONE job here: make two spellings of the same place produce the same key, so a
// match score never depends on how a user typed their own city. Deliberately kept
// separate from the index so it can be tested on its own.

/**
 * Fold a place name to its lookup key.
 *
 *   "Phnom Penh"   → "phnom penh"
 *   "PHNOM  PENH"  → "phnom penh"
 *   "Bogotá"       → "bogota"
 *   "ភ្នំពេញ"        → "ភ្នំពេញ"   (unchanged — see below)
 *
 * NFD + combining-mark stripping is what folds accented Latin ("Bogotá" → "bogota"),
 * which matters because job pages and CVs are inconsistent about diacritics.
 *
 * NON-LATIN SCRIPTS ARE LEFT ALONE, and that is correct. Khmer, Thai, Chinese and
 * Cyrillic names arrive from GeoNames' own alternate-name list, so both sides of the
 * comparison are already spelled identically; there is nothing to fold. Stripping marks
 * from Khmer would corrupt the very keys that let "ភ្នំពេញ" resolve to Phnom Penh.
 */
export function normalizePlace(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // combining marks (Latin diacritics only)
    .toLowerCase()
    .replace(/[.]/g, '') // "Washington D.C." → "washington dc"
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

/**
 * Split a free-text location into its comma-separated parts.
 *
 *   "Toul Kork, Phnom Penh, Cambodia" → ["toul kork", "phnom penh", "cambodia"]
 *   "Chicago, IL"                     → ["chicago", "il"]
 *
 * Slashes and semicolons split too: job boards write "Phnom Penh / Remote" and
 * "London; UK". Empty fragments are dropped rather than becoming empty keys.
 */
export function splitLocationParts(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|/\n]/)
    .map((part) => normalizePlace(part))
    .filter((part) => part.length > 0);
}
