// src/modules/match-report/domain/script-detection.ts
//
// Which writing system is this posting in? Enough to know when our text analysis cannot
// work — not a language identifier.
//
// THE PROBLEM (MENTOR_REVIEW_2026-08-18 §19). Every text matcher in this codebase splits
// on Latin character classes, and Khmer is written WITHOUT SPACES between words. So word
// matching does not degrade on a Khmer posting, it is inapplicable:
//
//   /\w/.test('ក')                                    → false   (no \b boundary applies)
//   'ការងារគ្រូបង្រៀន'.split(/[^a-zA-Z0-9+#]+/)        → []      (zero tokens)
//   /\bExcel\b/i.test('ចេះប្រើ Excel និង Word')        → TRUE    (Latin brands still hit)
//
// That last line is the whole bug. The skills table was not empty on a Khmer posting — it
// was built from whichever English brand names happened to appear in the text, then
// presented with a confident `missingCount`. "You're missing 11 skills" meant nothing.
//
// WHAT STILL WORKS, and must keep working: the match score. It comes from bge-m3
// embeddings, which are cross-lingual — measured at cosine 0.82 between a Khmer and an
// English title for the same role, versus 0.45 for different roles (MULTI_SITE_PLAN §5).
// So the number stays and only the word-level analysis is withheld.
//
// WHY A RATIO AND NOT ICU. Detection needs to answer "is this posting Khmer", which a
// Unicode-range count answers exactly. SEGMENTING Khmer into words — the thing that would
// let the matchers actually work — is the hard problem, and it is not attempted here.
// Honest refusal is a day's work; segmentation is a project.

/** Any letter, in any script — the denominator. Digits and punctuation are neutral. */
const LETTER = /\p{L}/u;

/**
 * A Khmer LETTER, specifically.
 *
 * Not a Unicode block range. Khmer writes vowels and the subscript COENG as COMBINING
 * MARKS (`\p{M}`), which live in the same block but are not letters — so counting the
 * block against a `\p{L}` denominator produced ratios above 1 (measured: 1.5 for the word
 * "ការងារ", which is 4 letters and 2 marks). Both sides now count letters, so the ratio
 * is a ratio.
 */
const KHMER_LETTER = /\p{Script=Khmer}/u;

/**
 * The share of a text's letters that are Khmer, 0–1. Returns 0 for text with no letters
 * at all, so a numeric or empty posting is never mistaken for Khmer.
 */
export function khmerRatio(text: string): number {
  if (!text) return 0;

  let khmer = 0;
  let letters = 0;
  // Iterated by code point rather than matched twice, so a character is classified once
  // and the two counts cannot disagree about what a letter is.
  for (const char of text) {
    if (!LETTER.test(char)) continue;
    letters += 1;
    if (KHMER_LETTER.test(char)) khmer += 1;
  }

  return letters === 0 ? 0 : khmer / letters;
}

/**
 * The point past which our word-level analysis is not trustworthy.
 *
 * IT SITS IN A GAP IN THE REAL DATA, which is a measured claim rather than a hope.
 * Across all 367 postings (2026-08-20), by the ratio computed above:
 *
 *   0% Khmer .......... 335 jobs
 *   5–15% .............   1     ← 0.113, an English posting with a Khmer address block
 *   15–50% ............   6
 *   80–100% ...........  25
 *
 * The nonzero ratios begin 0.113, 0.189, 0.265, … so **no posting falls between 0.113 and
 * 0.189**, and 0.15 sits in the middle of that gap: 31 postings are Khmer, 336 are not,
 * and nudging the threshold anywhere inside the gap changes nothing.
 *
 * The one posting at 0.113 is the case the threshold exists to get right — an English job
 * ad that quotes an address in Khmer. It keeps its skills table, correctly.
 *
 * ⚠️ These numbers were first measured with a Unicode-BLOCK count, which said 32 postings
 * and no gap below 20%. That count was wrong — it included combining marks (see
 * KHMER_LETTER) and produced ratios above 1. The figures above are from the corrected
 * letter-based ratio. If you re-derive them, use this function, not a block range.
 */
export const KHMER_THRESHOLD = 0.15;

/**
 * Is this posting Khmer enough that Latin word matching cannot describe it?
 *
 * Deliberately asks about the WHOLE text rather than per-sentence. A posting that is
 * mostly Khmer with an English requirements block still defeats the matchers on the parts
 * that matter, and per-section detection would produce a table that is right about some
 * rows and silently wrong about others — worse than declining.
 */
export function isKhmerScript(text: string): boolean {
  return khmerRatio(text) >= KHMER_THRESHOLD;
}
