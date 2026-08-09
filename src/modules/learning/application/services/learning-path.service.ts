// src/modules/learning/application/services/learning-path.service.ts
//
// Skill-gap learning paths, computed over existing UserSkill data (no external course API).
// Gaps = in-demand skills the user doesn't have; each comes with curated resources.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { UserRepository } from '@modules/user/infrastructure/repositories/user.repository';
import { UserSkillRepository } from '@modules/user/infrastructure/repositories/user-skill.repository';
import {
  RequirementsSource,
  SkillGapService,
} from '@modules/matching/application/services/skill-gap.service';
import { SkillGapSummaryDto } from '../dtos/skill-gap-summary.dto';
import { ERROR_MESSAGES } from '@common/constants/error-messages';
import {
  IN_DEMAND_SKILLS,
  LearningResource,
  resourcesForSkill,
} from '../../domain/learning-resources.catalog';

export interface SkillGapRecommendation {
  skill: string;
  resources: LearningResource[];
}

export interface LearningPathView {
  userId: string;
  currentSkills: string[];
  gapSkills: SkillGapRecommendation[];
}

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
  async getSkillGaps(userId: string): Promise<SkillGapSummaryDto> {
    const applications = await this.prisma.application.findMany({
      where: { userId, deletedAt: null },
      select: { jobId: true, job: { select: { title: true } } },
    });

    if (applications.length === 0) {
      return { hasApplications: false, hasParsedResume: true, jobsConsidered: 0, gaps: [] };
    }

    // One analysis per application. Applications per user are single digits today, so a loop
    // is honest and readable; batch this if that ever stops being true.
    const analyses = await Promise.all(
      applications.map(async (a) => ({
        title: a.job.title,
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
        gaps: [],
      };
    }

    // Postings that state no requirements are evidence of nothing. Counting them would
    // dilute every "3 of 4" with jobs we know nothing about.
    const usable = analyses.filter(({ result }) => result.status === 'OK');

    const byKey = new Map<
      string,
      { requirement: string; requiredBy: number; source: RequirementsSource; jobTitles: string[] }
    >();

    for (const { title, result } of usable) {
      for (const requirement of result.missing) {
        // Keyed case-insensitively, but the first spelling seen is what gets displayed —
        // the employer's own capitalisation, not a normalised one.
        const key = requirement.trim().toLowerCase();
        const existing = byKey.get(key);
        if (existing) {
          existing.requiredBy += 1;
          existing.jobTitles.push(title);
        } else {
          byKey.set(key, {
            requirement: requirement.trim(),
            requiredBy: 1,
            source: result.requirementsSource,
            jobTitles: [title],
          });
        }
      }
    }

    // Most-required first; alphabetical within a count so the order is stable between loads
    // rather than following whatever order the database returned.
    const gaps = [...byKey.values()].sort(
      (a, b) => b.requiredBy - a.requiredBy || a.requirement.localeCompare(b.requirement),
    );

    return {
      hasApplications: true,
      hasParsedResume: true,
      jobsConsidered: usable.length,
      gaps,
    };
  }

  /** Current skills + gap recommendations (in-demand skills the user lacks). */
  async getLearningPath(userId: string): Promise<LearningPathView> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    const userSkills = await this.userSkillRepository.findByUserId(userId);
    const currentSkills: string[] = [];
    for (const userSkill of userSkills) {
      const skill = await this.userSkillRepository.findSkillById(
        userSkill.skillId,
      );
      if (skill) currentSkills.push(skill.name);
    }
    const have = new Set(currentSkills.map((n) => n.toLowerCase()));

    const gapSkills: SkillGapRecommendation[] = IN_DEMAND_SKILLS.filter(
      (skill) => !have.has(skill.toLowerCase()),
    ).map((skill) => ({ skill, resources: resourcesForSkill(skill) }));

    return { userId, currentSkills, gapSkills };
  }

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
