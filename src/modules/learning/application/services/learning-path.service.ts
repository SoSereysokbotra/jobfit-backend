// src/modules/learning/application/services/learning-path.service.ts
//
// Skill-gap learning paths, computed over existing UserSkill data (no external course API).
// Gaps = in-demand skills the user doesn't have; each comes with curated resources.

import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from '@modules/user/infrastructure/repositories/user.repository';
import { UserSkillRepository } from '@modules/user/infrastructure/repositories/user-skill.repository';
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
  ) {}

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
