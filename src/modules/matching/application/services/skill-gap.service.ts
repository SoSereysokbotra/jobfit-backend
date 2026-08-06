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
import { toStringArray } from '../../domain/parsed-resume-json';

/** Why a gap analysis may be empty — the UI must not show "0 gaps" as if it were good news. */
export type SkillGapStatus =
  | 'OK'
  | 'JOB_HAS_NO_REQUIREMENTS'
  | 'NO_PARSED_RESUME';

export interface RequirementMatch {
  /** The requirement exactly as the employer wrote it. Never paraphrased. */
  text: string;
  /** CV skills found in this requirement. Empty means it is a gap. */
  matchedSkills: string[];
}

export interface SkillGapResult {
  status: SkillGapStatus;
  requirements: RequirementMatch[];
  /** Requirements with no supporting skill — what the user should act on. */
  missing: string[];
  matchedCount: number;
  /** Skills read from the user's most recent parsed résumé. */
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
        select: { requirements: true },
      }),
      this.latestParsedResume(userId),
    ]);

    const requirements = (job?.requirements ?? []).filter(
      (r) => typeof r === 'string' && r.trim().length > 0,
    );
    const skills = parsed.filter((s) => s.trim().length >= MIN_SKILL_LENGTH);

    // Distinguish the two empty cases. "No gaps" because the job listed no requirements is
    // not the same as "no gaps" because the CV covers everything, and showing them
    // identically would tell the user they are a perfect fit for a job we know nothing about.
    if (requirements.length === 0) {
      return {
        status: 'JOB_HAS_NO_REQUIREMENTS',
        requirements: [],
        missing: [],
        matchedCount: 0,
        skillsConsidered: skills,
      };
    }
    if (skills.length === 0) {
      return {
        status: 'NO_PARSED_RESUME',
        requirements: requirements.map((text) => ({ text, matchedSkills: [] })),
        missing: requirements,
        matchedCount: 0,
        skillsConsidered: [],
      };
    }

    const matches = requirements.map((text) => ({
      text,
      matchedSkills: skills.filter((skill) => mentions(text, skill)),
    }));

    return {
      status: 'OK',
      requirements: matches,
      missing: matches.filter((m) => m.matchedSkills.length === 0).map((m) => m.text),
      matchedCount: matches.filter((m) => m.matchedSkills.length > 0).length,
      skillsConsidered: skills,
    };
  }

  /** Skills from the user's most recently parsed résumé; empty if none has been parsed. */
  private async latestParsedResume(userId: string): Promise<string[]> {
    const resume = await this.prisma.resume.findFirst({
      where: { userId, parsingStatus: 'SUCCESS', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { parsedData: { select: { skills: true } } },
    });
    return toStringArray(resume?.parsedData?.skills ?? null);
  }
}

/**
 * Does `requirement` mention `skill` as a whole word?
 *
 * Word boundaries matter: a plain substring test makes "Go" match "Google" and "React"
 * match "Reactive", reporting a skill the candidate was never credited with. Boundaries
 * are relaxed around non-word characters so "C++", "CI/CD" and ".NET" still match.
 */
function mentions(requirement: string, skill: string): boolean {
  const escaped = skill.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // \b is meaningless next to a non-word char (e.g. the "+" in "C++"), so only anchor
  // the ends that actually start/end with a word character.
  const left = /^\w/.test(skill) ? '\\b' : '';
  const right = /\w$/.test(skill) ? '\\b' : '';
  return new RegExp(`${left}${escaped}${right}`, 'i').test(requirement);
}
