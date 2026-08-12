// src/modules/match-report/domain/keyword-scan.ts
//
// Counting keywords in a job description, and the soft-skills table.
//
// WHY SOFT SKILLS ARE SCANNED HERE RATHER THAN EXTRACTED: the AI extractor is told to
// SKIP generic filler — "team player", "excellent communication skills" — because a
// requirement list padded with things that match every candidate helps nobody choose
// what to fix. That is the right call for the gap list, and it means the extractor can
// never produce a soft-skills table. So the two halves come from two places on purpose:
// hard skills are the model reading requirements out of prose (the part that needs a
// model), soft skills are a deterministic scan of a fixed vocabulary (the part that does
// not). Neither is invented — both are counted in the posting's own words.

/**
 * Whole-word, case-insensitive occurrences of `term` in `text`.
 *
 * Word boundaries matter for the same reason they do in the skill-gap matcher: a plain
 * substring count makes "Go" match "Google" and reports a keyword the posting never
 * used. `\b` is meaningless next to a non-word character (the "+" in "C++"), so only the
 * ends that actually start/end with a word character are anchored.
 */
export function mentionCount(term: string, text: string): number {
  const trimmed = term.trim();
  if (!trimmed) return 0;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const left = /^\w/.test(trimmed) ? '\\b' : '';
  const right = /\w$/.test(trimmed) ? '\\b' : '';
  const matches = text.match(new RegExp(`${left}${escaped}${right}`, 'gi'));
  return matches?.length ?? 0;
}

/** True if the term appears at all. */
export function mentions(term: string, text: string): boolean {
  return mentionCount(term, text) > 0;
}

/**
 * Words too common in postings to say anything about a requirement's subject. Kept
 * deliberately short — domain words ("automotive", "management") are the signal we want
 * to count, and filtering them would flatten every requirement to a count of 1.
 */
const GENERIC_WORDS = new Set([
  'and', 'the', 'for', 'with', 'you', 'our', 'are', 'will', 'have', 'has', 'this',
  'that', 'from', 'your', 'their', 'not', 'but', 'all', 'any', 'who', 'can', 'years',
  'year', 'experience', 'experienced', 'strong', 'using', 'use', 'work', 'working',
  'ability', 'abilities', 'knowledge', 'skill', 'skills', 'including', 'such', 'other',
  'excellent', 'good', 'proven', 'relevant', 'related', 'plus', 'must', 'should',
]);

/** Meaningful lowercase words of a requirement, generic filler removed. */
function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#./]+/)
    .map((w) => w.replace(/^[./]+|[./]+$/g, ''))
    .filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w));
}

/**
 * How prominently a requirement's subject appears in the posting.
 *
 * A requirement is a whole phrase ("3+ years building production React applications")
 * and occurs exactly once, so counting the phrase itself would print "1" on every row
 * and tell the reader nothing. What Jobscan's count actually communicates is emphasis —
 * a posting that says "React" six times is telling you what the job is about — so this
 * counts the requirement's most-repeated content word instead. Never below 1: the
 * requirement was extracted FROM this description, so it is present by construction.
 */
export function requirementCount(requirement: string, description: string): number {
  const counts = contentWords(requirement).map((w) => mentionCount(w, description));
  return Math.max(1, ...counts, 0);
}

/**
 * The soft-skills vocabulary, each label with the wordings a posting might use for it.
 *
 * Synonyms exist because the label is what the reader should see ("Communication"), not
 * what the posting happened to write ("communicate clearly in writing"). Matching only
 * the label would report a posting that stresses collaboration throughout as asking for
 * no soft skills at all.
 */
const SOFT_SKILLS: ReadonlyArray<{ label: string; terms: string[] }> = [
  { label: 'Communication', terms: ['communication', 'communicate', 'communicating', 'verbal', 'articulate'] },
  { label: 'Teamwork', terms: ['teamwork', 'team player', 'collaborate', 'collaboration', 'collaborative', 'cross-functional'] },
  { label: 'Leadership', terms: ['leadership', 'mentor', 'mentoring', 'coaching', 'supervise', 'supervising'] },
  { label: 'Problem Solving', terms: ['problem solving', 'problem-solving', 'troubleshoot', 'troubleshooting', 'analytical'] },
  { label: 'Adaptability', terms: ['adaptability', 'adaptable', 'flexible', 'flexibility', 'fast-paced'] },
  { label: 'Time Management', terms: ['time management', 'prioritize', 'prioritise', 'prioritization', 'deadlines', 'deadline'] },
  { label: 'Attention to Detail', terms: ['attention to detail', 'detail-oriented', 'detail oriented', 'meticulous', 'accuracy'] },
  { label: 'Organization', terms: ['organized', 'organised', 'organizational', 'organisational', 'planning'] },
  { label: 'Creativity', terms: ['creativity', 'creative', 'innovative', 'innovation'] },
  { label: 'Critical Thinking', terms: ['critical thinking', 'decision making', 'decision-making', 'judgement', 'judgment'] },
  { label: 'Customer Service', terms: ['customer service', 'client-facing', 'customer-facing', 'stakeholder', 'stakeholders'] },
  { label: 'Initiative', terms: ['self-motivated', 'self motivated', 'proactive', 'initiative', 'independently', 'autonomy'] },
  { label: 'Presentation', terms: ['presentation', 'presenting', 'public speaking'] },
  { label: 'Negotiation', terms: ['negotiation', 'negotiate', 'negotiating'] },
  { label: 'Work Ethic', terms: ['work ethic', 'reliable', 'dependable', 'accountability', 'ownership'] },
];

export interface SoftSkillHit {
  skill: string;
  /** Total mentions across every wording of this soft skill. */
  count: number;
  /** True when the résumé uses any of the same wordings. */
  inResume: boolean;
}

/**
 * Soft skills the posting actually asks for, with whether the résumé shows them.
 *
 * Only labels the posting mentions are returned — listing the whole vocabulary would
 * report fifteen "missing" soft skills for a job that asked for two, and the missing
 * count is the number the user is meant to act on.
 */
export function scanSoftSkills(
  description: string,
  resumeEvidence: string,
): SoftSkillHit[] {
  const hits: SoftSkillHit[] = [];
  for (const { label, terms } of SOFT_SKILLS) {
    const count = terms.reduce((n, term) => n + mentionCount(term, description), 0);
    if (count === 0) continue;
    hits.push({
      skill: label,
      count,
      inResume: terms.some((term) => mentions(term, resumeEvidence)),
    });
  }
  return hits.sort((a, b) => b.count - a.count);
}
