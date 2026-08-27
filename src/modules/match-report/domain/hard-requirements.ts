// src/modules/match-report/domain/hard-requirements.ts
//
// The requirements a candidate either has or doesn't: a degree, and languages.
//
// WHY THESE TWO AND NOT A GENERAL "KNOCKOUT" ENGINE. Most requirements are matters of
// degree — "strong background in concurrency" is arguable, and the skills table already
// says whether the CV evidences it. A qualification and a language are different: they
// are binary, they are stated explicitly, and a candidate who lacks one usually cannot
// acquire it before the closing date. Those are worth calling out; nothing else here is.
//
// WARN, NEVER PENALISE (product decision, 2026-08-25). An unmet requirement produces a
// clearly-worded flag and does NOT move the match score. Two reasons: employers hire
// under their stated bar routinely, so a capped score would be wrong more often than the
// bar is; and a score that silently absorbs a penalty stops being interpretable — the
// reader cannot tell a genuinely poor fit from a good one that tripped a filter.
//
// EVERYTHING HERE IS READ OUT OF PROSE, so it is a reading and not a fact, and the
// guards below exist because the failure modes were measured on real adverts.

/** What kind of hard requirement this is. */
export type HardRequirementKind = 'DEGREE' | 'LANGUAGE';

export interface HardRequirement {
  kind: HardRequirementKind;
  /** What the posting asks for, in the reader's words: "Bachelor's degree", "English". */
  label: string;
  /**
   * Whether the CV shows it. NULL when we cannot tell — an unparsed CV or an unreadable
   * script — which must never be rendered as "you don't have this".
   */
  met: boolean | null;
  /** The posting's own sentence, so the reader can judge our reading of it. */
  quote: string;
}

/**
 * A requirement stated only to WITHDRAW it.
 *
 * Measured on a live TELUS advert: "You don't need a technical degree or previous
 * experience in AI to succeed here." A degree rule without this guard reports
 * "Bachelor's degree required" on a posting whose whole pitch is that none is needed.
 */
const NEGATED =
  /\b(?:no|not|don'?t|doesn'?t|without)\b[^.]{0,40}\b(?:need|needed|require[ds]?|necessary|mandatory)\b|\bnot required\b|\bមិន\s*ទាមទារ/i;

/**
 * A requirement being HEDGED — wanted, but not a bar.
 *
 * This, and NOT "does the sentence contain the word required", is what separates a bar
 * from a nicety. MEASURED 2026-08-25 on a live JobNet advert (DHL Express, Procurement
 * Officer), which states its bar as a bare bullet:
 *
 *   ● Bachelor's degree in Accounting, Finance, Business, or a related field
 *
 * There is no "required" anywhere near it — the "Requirements:" HEADING above carries
 * that, and headings are not in the bullet. An earlier version demanded a requirement
 * word in the same sentence and therefore found NOTHING on this posting, which is how
 * most postings are written. Postings name a degree when they want one; the useful
 * distinction is whether they hedged it.
 */
export const HEDGED =
  /\b(?:a plus|plus)\b|\bpreferred\b|\bpreferable\b|\bdesirable\b|\badvantage\b|\bnice to have\b|\bbonus\b|\ban asset\b/i;

const DEGREE_TERMS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(?:phd|ph\.d|doctorate|doctoral)\b/i, label: 'Doctorate' },
  { pattern: /\bmaster'?s?\b(?:\s+degree)?/i, label: "Master's degree" },
  { pattern: /\bbachelor'?s?\b(?:\s+degree)?|\bundergraduate degree\b/i, label: "Bachelor's degree" },
  { pattern: /\b(?:associate'?s?|diploma)\b/i, label: 'Diploma' },
];

/**
 * Languages a Cambodian job hunt actually encounters. A fixed list rather than a
 * detector: "English" is a word that appears for many reasons, and a bounded vocabulary
 * with a proficiency test beside it is far less likely to invent a requirement.
 */
const LANGUAGES = [
  'English', 'Khmer', 'Cambodian', 'Mandarin', 'Chinese', 'Cantonese', 'Japanese',
  'Korean', 'Thai', 'Vietnamese', 'Indonesian', 'Malay', 'Tagalog', 'Filipino',
  'French', 'Spanish', 'German', 'Hindi', 'Arabic', 'Portuguese', 'Russian',
];

/**
 * Words that turn a language MENTION into a language REQUIREMENT.
 *
 * Without this, "English-language guidelines" or "our English website" would each add a
 * language requirement that the posting never made.
 */
const PROFICIENCY =
  /\bprofici|fluen|native|speaker|spoken|written|bilingual|\blevel\b|\b[abc][12]\b|\brequired?\b|\bmust\b/i;

/** How far around a match to look for the context words above. */
const WINDOW = 90;

/**
 * Split prose into sentence-ish chunks so a quote is readable and a window is bounded.
 *
 * BULLET MARKERS split too. Job adverts run a whole requirement list into one line —
 * "● Bachelor's degree in Accounting … ● Proven experience in procurement …" — and
 * treating that as a single chunk both produces an unreadable quote and lets a hedge in
 * one bullet veto the bar stated in another.
 */
function sentencesOf(texts: string[]): string[] {
  return texts
    .flatMap((t) => (t ?? '').split(/(?<=[.!?])\s+|\n+|[●•‣▪]|(?:^|\s)[-*]\s+/))
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0 && s.length < 400);
}

/** The window of text around an index, for context tests. */
function around(text: string, at: number, length: number): string {
  return text.slice(Math.max(0, at - WINDOW), at + length + WINDOW);
}

/**
 * Degree and language requirements the posting states.
 *
 * Deduplicated by label — a posting naming English three times asks for it once.
 */
export function findHardRequirements(texts: string[]): Omit<HardRequirement, 'met'>[] {
  const found = new Map<string, Omit<HardRequirement, 'met'>>();

  for (const sentence of sentencesOf(texts)) {
    if (NEGATED.test(sentence)) continue;

    for (const { pattern, label } of DEGREE_TERMS) {
      const match = sentence.match(pattern);
      if (!match) continue;
      // "A degree is a plus" is not a bar; reporting it as one makes every flag
      // untrustworthy. Anything neither hedged nor negated is taken as stated.
      if (HEDGED.test(sentence)) continue;
      if (!found.has(label)) {
        found.set(label, { kind: 'DEGREE', label, quote: sentence });
      }
      break; // Highest listed level wins; one degree bar per sentence.
    }

    for (const language of LANGUAGES) {
      const at = sentence.toLowerCase().indexOf(language.toLowerCase());
      if (at === -1) continue;
      if (!PROFICIENCY.test(around(sentence, at, language.length))) continue;
      if (HEDGED.test(sentence)) continue;
      if (!found.has(language)) {
        found.set(language, { kind: 'LANGUAGE', label: language, quote: sentence });
      }
    }
  }

  return [...found.values()];
}

/** What the CV can be checked against. */
export interface CvEvidence {
  /** Free text of the résumé; null when there is no parse. */
  rawText: string | null;
  /** Parsed education entries, as JSON-ish objects. */
  educations: unknown[];
  /** Skills and other short evidence strings. */
  skills: string[];
}

/**
 * Decide whether the CV satisfies each requirement.
 *
 * `met: null` is used liberally and on purpose: with no parsed CV we know nothing, and
 * "we couldn't check" must not be displayed as "you don't have it".
 */
export function checkHardRequirements(
  requirements: Omit<HardRequirement, 'met'>[],
  cv: CvEvidence,
): HardRequirement[] {
  // Emptiness is decided from the INPUTS, not the joined string: `JSON.stringify([])`
  // is "[]", which is non-empty text, so a CV-less user looked parsed and every
  // requirement came back "not met" instead of "cannot tell".
  const hasParse =
    Boolean(cv.rawText?.trim()) || cv.educations.length > 0 || cv.skills.length > 0;
  const haystack = [cv.rawText ?? '', cv.skills.join(' '), JSON.stringify(cv.educations)]
    .join(' ')
    .toLowerCase();

  return requirements.map((requirement) => {
    if (!hasParse) return { ...requirement, met: null };

    if (requirement.kind === 'LANGUAGE') {
      return { ...requirement, met: haystack.includes(requirement.label.toLowerCase()) };
    }

    // DEGREE: the CV must show a qualification of some kind. Level comparison is
    // deliberately NOT attempted — parsed degree strings are free text ("BSc", "Bachelor
    // of Engineering", "វិទ្យាសាស្ត្របណ្ឌិត"), and ranking them would be guesswork
    // dressed as a verdict. If the posting wants a Master's and the CV shows a
    // Bachelor's, this reports met and the quote lets the reader see the difference.
    const hasEducation =
      cv.educations.length > 0 || /\b(bachelor|master|phd|doctorate|degree|diploma|bsc|ba|ma|msc)\b/i.test(haystack);
    return { ...requirement, met: hasEducation };
  });
}
