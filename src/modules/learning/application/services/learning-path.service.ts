// src/modules/learning/application/services/learning-path.service.ts
//
// Skill gaps, computed from the jobs a user actually applied to (no external course API).
// Gaps = requirements those postings state that the user's CV does not evidence, so the
// answer follows their field instead of assuming everyone is a software engineer.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { UserRepository } from '@modules/user/infrastructure/repositories/user.repository';
import { UserSkillRepository } from '@modules/user/infrastructure/repositories/user-skill.repository';
import {
  RequirementMatch,
  SkillGapService,
} from '@modules/matching/application/services/skill-gap.service';
import {
  ApplicationGapsDto,
  GapCoverage,
  SkillGapSummaryDto,
} from '../dtos/skill-gap-summary.dto';
import {
  LearningResource,
  resourcesForSkill,
} from '../../domain/learning-resources.catalog';
import { ExternalSkillGapReportDto } from '../dtos/external-skill-gap.dto';

/** Seniority words carry no domain signal — drop them so similar-role matching
 *  keys on the field ("Backend Engineer"), not "Senior". */
const TITLE_STOPWORDS = new Set([
  'senior',
  'junior',
  'lead',
  'staff',
  'principal',
  'mid',
  'entry',
  'level',
  'the',
  'and',
  'for',
]);

/**
 * Worth showing on the learning page: nothing evidences it, or only something adjacent does.
 *
 * An EXACT match is genuinely covered and stays off the page. A PARTIAL one is not — it is
 * the matcher saying "this is weak", and hiding it is what let a CV listing "Effective Time
 * Management" be reported as covering "Classroom behaviour management".
 */
const isGap = (r: RequirementMatch): boolean =>
  r.matchedSkills.length === 0 || r.matchQuality === 'PARTIAL';

/** MISSING sorts before PARTIAL: a real gap outranks a doubt. */
const rank = (coverage: GapCoverage): number => (coverage === 'MISSING' ? 0 : 1);

export interface SkillResourcesView {
  skillId: string;
  skillName: string;
  resources: LearningResource[];
}

@Injectable()
export class LearningPathService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userSkillRepository: UserSkillRepository,
    private readonly prisma: PrismaService,
    private readonly skillGap: SkillGapService,
  ) {}

  /**
   * What the jobs this user is actually applying to ask for that their CV does not evidence.
   *
   * The gaps come from the postings, so the answer is field-agnostic by construction: a
   * mathematics teacher's applications yield mathematics requirements, a welder's yield
   * welding ones. The previous implementation compared everyone against the same ten
   * technology skills, which for a non-technology user was wrong ten times out of ten.
   *
   * Deliberately reuses SkillGapService rather than reading `job.requirements` directly:
   * that service already prefers employer-authored requirements over AI-extracted ones,
   * reports which, and matches with the distinctive-word approach that was measured. A
   * second comparison here would be a weaker copy of a solved problem.
   */
  /**
   * Skill gaps for the extension, scoped to PUBLISHED jobs SIMILAR to the one the
   * user is viewing (matched on distinctive title words). Field-aware by design:
   * a "Backend Engineer" page yields backend gaps, not a universal tech list.
   * Returns an empty list (never flags "everything") when the user has no skills,
   * no title is given, or no similar roles exist.
   */
  async getExternalJobGaps(
    userId: string,
    jobExternalId: string,
    source: string,
    title: string | undefined,
  ): Promise<ExternalSkillGapReportDto> {
    const empty: ExternalSkillGapReportDto = { jobExternalId, source, gaps: [] };
    const tokens = (title ?? '')
      .split(/[^A-Za-z0-9+#.]+/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 3 && !TITLE_STOPWORDS.has(w))
      .slice(0, 6);
    if (tokens.length === 0) return empty;

    const userSkillRows = await this.prisma.userSkill.findMany({
      where: { userId },
      select: { skillId: true },
    });
    const userSkillIds = new Set(userSkillRows.map((r) => r.skillId));
    // No skills on file → every requirement would look like a gap. Don't guess.
    if (userSkillIds.size === 0) return empty;

    const similar = await this.prisma.job.findMany({
      where: {
        status: 'PUBLISHED',
        OR: tokens.map((t) => ({
          title: { contains: t, mode: 'insensitive' as const },
        })),
      },
      select: { skills: { select: { skillId: true } } },
      take: 200,
    });
    if (similar.length === 0) return empty;

    const demand = new Map<string, number>();
    for (const job of similar) {
      for (const s of job.skills) {
        if (!userSkillIds.has(s.skillId)) {
          demand.set(s.skillId, (demand.get(s.skillId) ?? 0) + 1);
        }
      }
    }
    if (demand.size === 0) return empty;

    const top = [...demand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const names = await this.prisma.skill.findMany({
      where: { id: { in: top.map(([id]) => id) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(names.map((s) => [s.id, s.name]));

    return {
      jobExternalId,
      source,
      gaps: top
        .filter(([id]) => nameById.has(id))
        .map(([id, count]) => ({
          skill: nameById.get(id)!,
          demandCount: count,
          jobsWithoutSkill: Math.max(0, similar.length - count),
          // No LearningPath table in the schema; the catalog is a separate route.
          learningPath: null,
        })),
    };
  }

  async getSkillGaps(userId: string): Promise<SkillGapSummaryDto> {
    const applications = await this.prisma.application.findMany({
      where: { userId, deletedAt: null },
      select: { id: true, jobId: true, job: { select: { title: true } } },
    });

    if (applications.length === 0) {
      return {
        hasApplications: false,
        hasParsedResume: true,
        jobsConsidered: 0,
        applications: [],
      };
    }

    // One analysis per application. Applications per user are single digits today, so a loop
    // is honest and readable; batch this if that ever stops being true.
    const analyses = await Promise.all(
      applications.map(async (a) => ({
        applicationId: a.id,
        jobId: a.jobId,
        jobTitle: a.job.title,
        result: await this.skillGap.analyse(userId, a.jobId),
      })),
    );

    // Without a parsed CV there are no skills to compare against, so every requirement would
    // look like a gap. That is a different answer from "you are missing these things".
    const hasParsedResume = !analyses.every(
      ({ result }) => result.status === 'NO_PARSED_RESUME',
    );
    if (!hasParsedResume) {
      return {
        hasApplications: true,
        hasParsedResume: false,
        jobsConsidered: 0,
        applications: [],
      };
    }

    // Postings that state no requirements are evidence of nothing. Counting them would
    // dilute every "2 of 3" with jobs we know nothing about.
    const usable = analyses.filter(({ result }) => result.status === 'OK');

    // Count across ALL applications first. Grouping by job otherwise hides the most useful
    // signal on the page — the requirement several employers want — so the number has to
    // mean the same thing inside every group.
    const requiredBy = new Map<string, number>();
    for (const { result } of usable) {
      for (const r of result.requirements) {
        if (isGap(r)) {
          const key = r.text.trim().toLowerCase();
          requiredBy.set(key, (requiredBy.get(key) ?? 0) + 1);
        }
      }
    }

    const grouped: ApplicationGapsDto[] = usable.map(
      ({ applicationId, jobId, jobTitle, result }) => ({
        applicationId,
        jobId,
        jobTitle,
        source: result.requirementsSource,
        requirementsTotal: result.requirements.length,
        gaps: result.requirements
          .filter(isGap)
          .map((r) => ({
            requirement: r.text.trim(),
            // A PARTIAL match used to be dropped here as if it were covered, which reported
            // "Effective Time Management" on a CV as covering "Classroom behaviour
            // management". The matcher had already called it weak; this layer discarded
            // the label. Now it travels, with the skill that caused it.
            coverage: (r.matchQuality === 'PARTIAL' ? 'PARTIAL' : 'MISSING') as GapCoverage,
            matchedSkills: r.matchQuality === 'PARTIAL' ? r.matchedSkills : [],
            requiredBy: requiredBy.get(r.text.trim().toLowerCase()) ?? 1,
          }))
          // A real gap outranks a doubt; then most-wanted; then alphabetical so the order
          // is stable between loads rather than following whatever the database returned.
          .sort(
            (a, b) =>
              rank(a.coverage) - rank(b.coverage) ||
              b.requiredBy - a.requiredBy ||
              a.requirement.localeCompare(b.requirement),
          ),
      }),
    );

    return {
      hasApplications: true,
      hasParsedResume: true,
      jobsConsidered: usable.length,
      // The posting the user is furthest from leads.
      applications: grouped.sort((a, b) => b.gaps.length - a.gaps.length),
    };
  }

  // getLearningPath lived here. It returned every one of ten hardcoded technology skills the
  // user did not have, as their personal learning path — so for anyone outside software it
  // was wrong ten times out of ten, and it never read a single thing the user had done.
  // getSkillGaps above replaces it.

  /** Learning resources for a single skill. */
  async getSkillLearningResources(
    skillId: string,
  ): Promise<SkillResourcesView> {
    const skill = await this.userSkillRepository.findSkillById(skillId);
    if (!skill) throw new NotFoundException('Skill not found');
    return {
      skillId,
      skillName: skill.name,
      resources: resourcesForSkill(skill.name),
    };
  }
}
