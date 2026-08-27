// src/modules/match-report/domain/experience-requirement.ts
//
// "Does this candidate meet the years of experience the posting asks for?"
//
// WHY THIS EXISTS. The shared experience scorer counts CV ENTRIES and never sees the job:
// 0 entries → 40, one → 65, two → 80, three or more → 90. It is therefore the SAME number
// for every job a given user looks at. Observed 2026-08-12: a Chemical Engineer posting
// asking for "4+ years of professional chemical engineering experience" scored the
// candidate's experience at 80% — the identical 80% it gave a software role and a Food &
// Beverage role, because the user has two entries on their CV. A per-job match dimension
// that cannot vary per job is not a match dimension.
//
// The report is the one place this is fixable: it has the posting's text, so the stated
// bar can be read out and compared against dates the résumé already carries. The badge
// (identifiers only, no description) keeps the count-based approximation — which is why
// the payload says which basis produced the number.
//
// WHAT THIS DELIBERATELY DOES NOT CLAIM: that the years are in the RIGHT FIELD. Three
// years of software work is not three years of chemical engineering, and nothing here
// pretends otherwise — domain fit is what the skills sub-score and the requirements table
// answer. This answers only "how long have you been working, against how long they asked
// for", which is a fact the user can check.

/** A dated employment entry, as `ParsedResumeData.experiences` stores them. */
export interface DatedExperience {
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Words that make a "N years" mention a REQUIREMENT rather than a number that happens to
 * be next to the word "years" ("15 days of seniority payment per year", "10 years of
 * company growth").
 */
const REQUIREMENT_CONTEXT =
  /experien|background|professional|hands[- ]on|working|minimum|at least|track record|proven|history|recent|បទពិសោធន៍|យ៉ាងតិច/i;

/**
 * An AGE range, which is the single most dangerous false positive in this file.
 *
 * MEASURED 2026-08-25 on a live Khmer24 dental-assistant advert:
 *
 *   អាយុ18 ដល់ 30ឆ្នាំ  -  មិនទាមទារបទពិសោធន៍
 *   "AGE 18 to 30 years"     "does NOT require experience"
 *
 * The Khmer word for experience sits ~30 characters from "30 years" — well inside the
 * context window — so a rule that only asked for "experience near a number" would report
 * **"this role asks for 30+ years"** on an advert that explicitly asks for none.
 * `អាយុ` is Khmer for "age"; the English forms are here for the same reason
 * ("aged 21 to 35 years").
 */
const AGE_CONTEXT = /អាយុ|\bage[ds]?\b/i;

/**
 * A bar stated only in order to REMOVE it — "no experience required". `មិន` is "not"
 * and `ទាមទារ` is "require"; live ads write them joined.
 */
const NEGATED_CONTEXT =
  /មិន\s*ទាមទារ|\bno (prior |previous )?experience\b|\bnot required\b/i;

/**
 * How far BACKWARDS to look for an age marker. Tighter than the context window on
 * purpose: the marker sits ~12 characters before the number in the advert above, while a
 * genuine bar 80 characters earlier in an unrelated clause must not be vetoed by it.
 */
const AGE_LOOKBEHIND = 30;

/**
 * Khmer digits ០–៩ are U+17E0–U+17E9, contiguous — verified by codepoint, not assumed.
 * Mapping them to ASCII one character for one keeps every string index stable, so the
 * context windows below still line up with the original text.
 */
function normaliseDigits(text: string): string {
  return text.replace(/[០-៩]/g, (d) =>
    String((d.codePointAt(0) as number) - 0x17e0),
  );
}

/** How far either side of the number to look for that context. */
const CONTEXT_WINDOW = 80;

/**
 * `ឆ្នាំ` is Khmer for "year(s)". No trailing `\b` on that branch: `\b` is defined against
 * `[A-Za-z0-9_]`, so it can never match after Khmer script and the alternative would
 * simply never fire. The Latin branches keep theirs.
 *
 * Verified on live ads that Khmer postings write the NUMBER in either script — "30ឆ្នាំ"
 * (Latin digits) and "៣ឆ្នាំ" (Khmer digits) both occur.
 */
const YEARS_RE = /(\d{1,2})\s*\+?\s*(?:years?\b|yrs?\b|ឆ្នាំ)/gi;

/**
 * The highest years-of-experience bar the posting states, or null if it states none.
 *
 * Prefer passing the EXTRACTED requirements: they are the posting's requirement sentences
 * already separated from its prose, so a number in the benefits section can't be mistaken
 * for a bar. The raw description is the fallback for when extraction was unavailable.
 *
 * The MAXIMUM is taken because a posting that says "4+ years" once and "2+ years" for a
 * sub-skill is gating on 4. This over-reads the rare posting whose highest number is a
 * nice-to-have; the alternative (taking the minimum) under-reads every posting that lists
 * its main bar first, which is most of them.
 */
export function parseYearsRequired(texts: string[]): number | null {
  let highest: number | null = null;

  for (const original of texts) {
    if (!original) continue;
    const text = normaliseDigits(original);
    for (const match of text.matchAll(YEARS_RE)) {
      const years = Number(match[1]);
      // 40+ "years" is a date range or a typo, not a hiring bar.
      if (!Number.isFinite(years) || years <= 0 || years > 40) continue;

      const at = match.index ?? 0;
      const window = text.slice(
        Math.max(0, at - CONTEXT_WINDOW),
        at + match[0].length + CONTEXT_WINDOW,
      );
      if (!REQUIREMENT_CONTEXT.test(window)) continue;
      // An age range reads exactly like an experience bar to the rule above.
      if (AGE_CONTEXT.test(text.slice(Math.max(0, at - AGE_LOOKBEHIND), at))) continue;
      // "No experience required" mentions a requirement in order to withdraw it.
      if (NEGATED_CONTEXT.test(window)) continue;

      if (highest === null || years > highest) highest = years;
    }
  }
  return highest;
}

/**
 * Total years of employment on the CV, overlapping entries counted once.
 *
 * Merging matters: a one-month internship sitting inside a three-year job is two entries
 * but three years, and summing them would report 3.1. Returns null when no entry carries a
 * usable start date — "we don't know" is a different answer from "zero", and only one of
 * them should ever be shown to someone who simply formatted their dates unusually.
 */
export function totalExperienceYears(
  entries: DatedExperience[],
  now: Date = new Date(),
): number | null {
  const spans: Array<[number, number]> = [];

  for (const entry of entries) {
    const start = parseDate(entry.startDate);
    if (start === null) continue;
    // A missing/"Present" end date means the job is current.
    const end = parseDate(entry.endDate) ?? now.getTime();
    if (end > start) spans.push([start, end]);
  }
  if (spans.length === 0) return null;

  spans.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cursorStart, cursorEnd] = spans[0];
  for (const [start, end] of spans.slice(1)) {
    if (start <= cursorEnd) {
      cursorEnd = Math.max(cursorEnd, end);
    } else {
      total += cursorEnd - cursorStart;
      [cursorStart, cursorEnd] = [start, end];
    }
  }
  total += cursorEnd - cursorStart;

  const years = total / (365.25 * 24 * 60 * 60 * 1000);
  return Math.round(years * 10) / 10;
}

/**
 * "2021-01", "2021", "Jan 2021", "2021-01-15" → epoch ms. Null for anything else,
 * including "Present" — the caller treats a null end as "still there", and a null start
 * as an entry it cannot date.
 */
function parseDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = value.trim();
  if (!text || /^(present|current|now|ongoing)$/i.test(text)) return null;

  // Bare year, the most common résumé form after YYYY-MM.
  if (/^\d{4}$/.test(text)) return Date.UTC(Number(text), 0, 1);
  if (/^\d{4}-\d{1,2}$/.test(text)) {
    const [year, month] = text.split('-').map(Number);
    return Date.UTC(year, month - 1, 1);
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * How well the candidate's years meet the stated bar, 0–100.
 *
 * Linear in the shortfall and capped at 100: meeting the bar is meeting it, and there is
 * no credit for exceeding it — a posting asking for 4 years does not want the 20-year
 * candidate twice as much. Someone with one of four years scores 25, which is the point:
 * it is a number that moves per job.
 */
export function scoreYearsAgainstRequirement(
  candidateYears: number,
  requiredYears: number,
): number {
  if (requiredYears <= 0) return 100;
  const ratio = candidateYears / requiredYears;
  return Math.max(0, Math.min(100, Math.round(ratio * 100)));
}
