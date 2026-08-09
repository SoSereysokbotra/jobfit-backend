// src/modules/matching/application/services/skill-gap.service.ts
//
// "What does this job ask for that my CV doesn't show?"
//
// WHY THIS SHAPE, AND WHY NO SCORE: Phase C measured /match/reason's fitScore against 150
// hand-graded pairs and got Spearman rho 0.137 (v1) and -0.065 (v2) — uncorrelated with real
// fit, with BAD jobs scoring HIGHER than GREAT ones. So no percentage is produced here. What
// the same run measured as reliable was requirement groundedness (87.7-89.2%): the model can
// read what a job asks for. This feature uses only that.
//
// WHY NO LLM AT ALL ON THIS PATH: `Job.requirements` is already a structured list authored by
// the employer. Comparing it against parsed CV skills is a deterministic string operation. An
// LLM would add latency, cost and hallucination risk to a problem that does not need one. The
// LLM only becomes necessary for jobs whose requirements are buried in free-text description
// (45 of 52 today) — that extension is deliberately NOT built here.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import {
  splitSkillEntry,
  toFieldsOfStudy,
  toProjectTechnologies,
  toSkillList,
} from '../../domain/parsed-resume-json';

/** Why a gap analysis may be empty — the UI must not show "0 gaps" as if it were good news. */
export type SkillGapStatus =
  | 'OK'
  | 'JOB_HAS_NO_REQUIREMENTS'
  | 'NO_PARSED_RESUME';

/**
 * How strongly a requirement was matched.
 *
 * EXACT   — the skill appears verbatim ("Docker" in "3+ years of Docker").
 * PARTIAL — only part of a multi-word skill appears ("Automotive Engineering Technology"
 *           against "…in the Automotive/Manufacturing Industry"). Real evidence, but
 *           weaker, and the UI must not present it as if the CV said the whole thing.
 */
export type MatchQuality = 'EXACT' | 'PARTIAL';

export interface RequirementMatch {
  /** The requirement exactly as the employer wrote it. Never paraphrased. */
  text: string;
  /** CV skills found in this requirement. Empty means it is a gap. */
  matchedSkills: string[];
  /** Absent when nothing matched. */
  matchQuality?: MatchQuality;
}

/**
 * Where the requirements came from. The user is entitled to know whether they are the
 * employer's own words or a model's reading of the posting — the second is useful but not
 * authoritative, and presenting them identically would overstate what we know.
 */
export type RequirementsSource = 'EMPLOYER' | 'AI_EXTRACTED' | 'NONE';

export interface SkillGapResult {
  status: SkillGapStatus;
  /** Whether these requirements were written by the employer or read out by the model. */
  requirementsSource: RequirementsSource;
  requirements: RequirementMatch[];
  /** Requirements with no supporting skill — what the user should act on. */
  missing: string[];
  matchedCount: number;
  /**
   * Everything from the user's most recent parse that was compared against the
   * requirements — the `skills` column plus project technologies and fields of study.
   * See {@link SkillGapService.latestParsedResume} for why those and not more.
   */
  skillsConsidered: string[];
}

/**
 * Skills shorter than this are skipped when matching.
 *
 * Word-boundary matching still misfires on very short tokens — "R" matches nothing useful
 * and "C" would hit every "C" in a requirement list. Losing a couple of real one-letter
 * languages is preferable to reporting matches that are not there.
 */
const MIN_SKILL_LENGTH = 2;

@Injectable()
export class SkillGapService {
  constructor(private readonly prisma: PrismaService) {}

  async analyse(userId: string, jobId: string): Promise<SkillGapResult> {
    const [job, parsed] = await Promise.all([
      this.prisma.job.findUnique({
        where: { id: jobId },
        select: { requirements: true, extractedRequirements: true },
      }),
      this.latestParsedResume(userId),
    ]);

    // Employer-authored requirements always win. The AI-extracted list is a fallback for
    // ingested postings that carry none, never a replacement for a human's words.
    const employer = clean(job?.requirements);
    const extracted = clean(job?.extractedRequirements);
    const requirements = employer.length > 0 ? employer : extracted;
    const requirementsSource: RequirementsSource =
      employer.length > 0 ? 'EMPLOYER' : extracted.length > 0 ? 'AI_EXTRACTED' : 'NONE';

    const skills = parsed.filter((s) => s.trim().length >= MIN_SKILL_LENGTH);

    // Distinguish the two empty cases. "No gaps" because the job listed no requirements is
    // not the same as "no gaps" because the CV covers everything, and showing them
    // identically would tell the user they are a perfect fit for a job we know nothing about.
    if (requirements.length === 0) {
      return {
        status: 'JOB_HAS_NO_REQUIREMENTS',
        requirementsSource,
        requirements: [],
        missing: [],
        matchedCount: 0,
        skillsConsidered: skills,
      };
    }
    if (skills.length === 0) {
      return {
        status: 'NO_PARSED_RESUME',
        requirementsSource,
        requirements: requirements.map((text) => ({ text, matchedSkills: [] })),
        missing: requirements,
        matchedCount: 0,
        skillsConsidered: [],
      };
    }

    // Words that recur across this job's requirements describe the job's SUBJECT, not any
    // particular requirement, so they cannot carry a partial match on their own.
    const themeWords = themeWordsOf(requirements);

    const matches = requirements.map((text) => {
      const exact = skills.filter((skill) => mentionsExactly(text, skill));
      if (exact.length > 0) {
        return { text, matchedSkills: exact, matchQuality: 'EXACT' as const };
      }
      const partial = skills.filter((skill) =>
        mentionsPartially(text, skill, themeWords),
      );
      return partial.length > 0
        ? { text, matchedSkills: partial, matchQuality: 'PARTIAL' as const }
        : { text, matchedSkills: [] };
    });

    return {
      status: 'OK',
      requirementsSource,
      requirements: matches,
      missing: matches.filter((m) => m.matchedSkills.length === 0).map((m) => m.text),
      matchedCount: matches.filter((m) => m.matchedSkills.length > 0).length,
      skillsConsidered: skills,
    };
  }

  /**
   * Everything the user's most recent parse can evidence; empty if none has been parsed.
   *
   * NOT just the `skills` column. Résumé extraction produces broad category labels —
   * the measured example parsed to *Programming, Communication, Technical Skills,
   * Hardware + Software* — which match a lot of requirement text while evidencing almost
   * nothing concrete, and left every gap list SHORTER than the truth. Meanwhile the same
   * parse already held "Arduino", "PID Control" and "Automotive Engineering Technology"
   * in columns this never read.
   *
   * The two extra sources are chosen because they are SPECIFIC BY CONSTRUCTION:
   *
   *  - `projects[].technologies` — the parse prompt restricts these to tools named in the
   *    text, and puts what was BUILT in the description instead.
   *  - `educations[].fieldOfStudy` — a named discipline.
   *
   * EXPERIENCE TITLES ARE DELIBERATELY EXCLUDED, and this is the interesting one. They
   * look like free evidence, but they are where bare role nouns live — "Intern",
   * "Assistant", "Manager" — and a bare "Manager" whole-word-matches any requirement
   * mentioning management. That is precisely the false match §5.3 of the 08-09 handoff was
   * about ("Effective Time Management" reported as covering "Classroom behaviour
   * management"). Adding titles would have widened that hole while appearing to help.
   *
   * This changes what the matcher is GIVEN. It does not touch how the matcher decides —
   * see §5.2: `themeWordsOf` and the `management` signal word stay exactly as measured.
   */
  private async latestParsedResume(userId: string): Promise<string[]> {
    const resume = await this.prisma.resume.findFirst({
      where: { userId, parsingStatus: 'SUCCESS', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        parsedData: { select: { skills: true, projects: true, educations: true } },
      },
    });
    const parsed = resume?.parsedData;
    if (!parsed) return [];

    return dedupe([
      // toSkillList, not toStringArray: the model returns "Languages: C++, Python,
      // TypeScript" as a single entry often enough that the split has to happen here.
      // See splitSkillEntry for the measurement that put it in code rather than the prompt.
      ...toSkillList(parsed.skills),
      ...toProjectTechnologies(parsed.projects).flatMap(splitSkillEntry),
      ...toFieldsOfStudy(parsed.educations),
    ]);
  }
}

/**
 * Case-insensitive dedupe, keeping the first spelling seen.
 *
 * A CV that lists "Arduino" under skills and again under a project's technologies would
 * otherwise report it twice in `skillsConsidered` and count it twice in `matchedSkills`,
 * which reads as more evidence than there is.
 */
function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const trimmed = v.trim();
    const key = trimmed.toLowerCase();
    if (trimmed.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Non-empty, trimmed strings only. */
function clean(values: string[] | undefined): string[] {
  return (values ?? []).filter((r) => typeof r === 'string' && r.trim().length > 0);
}

/**
 * Words too common in résumés and postings to be evidence of anything.
 *
 * Without this, "Technical **Skills**" matches "Strong interpersonal **skills**" and
 * every candidate matches every requirement — the false-match failure that makes this
 * whole feature lie. Domain words like "management" or "automotive" are deliberately NOT
 * here: those are exactly the signal we want.
 */
const GENERIC_WORDS = new Set([
  'skill', 'skills', 'experience', 'experienced', 'knowledge', 'ability', 'abilities',
  'strong', 'excellent', 'good', 'proven', 'effective', 'effectively', 'understanding',
  'working', 'work', 'years', 'year', 'professional', 'relevant', 'related', 'various',
  'general', 'basic', 'advanced', 'and', 'with', 'for', 'the', 'of', 'in', 'to', 'a',
  'an', 'or', 'other', 'using', 'use',
]);

/** Does `requirement` contain `skill` verbatim, as a whole word? */
function mentionsExactly(requirement: string, skill: string): boolean {
  return wholeWordTest(skill).test(requirement);
}

/**
 * A word must appear in more than this share of a job's requirements — and at least
 * twice — before it counts as the job's subject rather than a discriminator.
 */
const THEME_WORD_SHARE = 0.4;

/**
 * Words that recur across a job's own requirements.
 *
 * Measured need: on a Welding Engineer posting, "welding" appears in most requirements, so
 * a skill named "Welding Techniques (MIG, TIG, SMAW, FCAW)" partial-matched a *degree*
 * requirement, a *certification* requirement and an *automation* requirement — none of
 * which the candidate's skills evidence. It scored 9 of 12 where roughly 5 was defensible.
 *
 * A word repeated throughout the requirement list describes what the JOB is about; it
 * cannot tell one requirement apart from another, so it must not carry a match alone.
 * Rare words are untouched, which is why "Automotive" (1 of 10 requirements on an
 * automotive posting) still matches while "welding" no longer does.
 */
function themeWordsOf(requirements: string[]): Set<string> {
  const documentFrequency = new Map<string, number>();
  for (const requirement of requirements) {
    for (const word of new Set(wordsOf(requirement))) {
      documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
    }
  }
  const limit = Math.max(2, requirements.length * THEME_WORD_SHARE);
  return new Set(
    [...documentFrequency.entries()]
      .filter(([, count]) => count >= limit)
      .map(([word]) => word),
  );
}

/** Meaningful lowercase words, generic résumé filler removed. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9+#.]+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ''))
    .filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w));
}

/**
 * Does `requirement` contain a distinctive word of a MULTI-WORD skill?
 *
 * Measured need: on a Manufacturing/Automotive posting, a candidate with "Automotive
 * Engineering Technology" and "Project Management" matched 0 of 10 requirements, because
 * the whole phrase never appears verbatim inside a long requirement sentence — while
 * "Automotive" and "Management" were both literally present. Whole-phrase-only matching
 * reports "you match nothing" to someone who plainly matches something.
 *
 * Words that are merely the job's subject (see {@link themeWordsOf}) are excluded, so a
 * welding skill no longer "covers" every requirement that says welding.
 *
 * Single-token skills are excluded on purpose: they have no parts to match partially, and
 * splitting them would break "C++", "CI/CD" and ".NET", none of which contain a space.
 */
function mentionsPartially(
  requirement: string,
  skill: string,
  themeWords: Set<string>,
): boolean {
  if (!/\s/.test(skill.trim())) return false;
  return wordsOf(skill)
    .filter((word) => !themeWords.has(word))
    .some((word) => wholeWordTest(word).test(requirement));
}

/**
 * Case-insensitive whole-word matcher.
 *
 * Word boundaries matter: a plain substring test makes "Go" match "Google" and "React"
 * match "Reactive", crediting a skill the candidate never claimed. `\b` is meaningless
 * next to a non-word character (the "+" in "C++"), so only the ends that actually
 * start/end with a word character are anchored.
 */
function wholeWordTest(term: string): RegExp {
  const trimmed = term.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const left = /^\w/.test(trimmed) ? '\\b' : '';
  const right = /\w$/.test(trimmed) ? '\\b' : '';
  return new RegExp(`${left}${escaped}${right}`, 'i');
}
