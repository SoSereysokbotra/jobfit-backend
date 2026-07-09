// src/modules/user/application/services/skills.service.ts
//
// Manages a user's skills. UserSkill is a plain Entity (not an aggregate root), so the
// SkillAdded/SkillRemoved events are raised by this service and published directly.

import { Injectable, NotFoundException } from '@nestjs/common';
import { UserSkillRepository } from '../../infrastructure/repositories/user-skill.repository';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { DomainEventBus } from '@events/domain-event-bus.service';
import { UserSkill } from '../../domain/entities/user-skill.entity';
import { AddSkillDto } from '../dtos/add-skill.dto';
import { SkillAddedEvent } from '../../domain/events/skill-added.event';
import { SkillRemovedEvent } from '../../domain/events/skill-removed.event';
import { ERROR_MESSAGES } from '@common/constants/error-messages';

@Injectable()
export class SkillsService {
  constructor(
    private readonly userSkillRepository: UserSkillRepository,
    private readonly userRepository: UserRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  async addSkill(userId: string, dto: AddSkillDto): Promise<UserSkill> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    const skill = await this.userSkillRepository.findSkillById(dto.skillId);
    if (!skill) throw new NotFoundException('Skill not found');

    const userSkill = UserSkill.create({
      userId,
      skillId: dto.skillId,
      proficiencyLevel: dto.proficiencyLevel,
      yearsOfExperience: dto.yearsOfExperience,
    });
    await this.userSkillRepository.save(userSkill);

    await this.eventBus.publish(
      new SkillAddedEvent(userId, skill.id, skill.name),
    );
    return userSkill;
  }

  async removeSkill(userId: string, skillId: string): Promise<void> {
    const userSkill = await this.userSkillRepository.findByUserAndSkill(
      userId,
      skillId,
    );
    if (!userSkill) throw new NotFoundException('Skill not found for user');

    await this.userSkillRepository.delete(userSkill.id);

    const skill = await this.userSkillRepository.findSkillById(skillId);
    await this.eventBus.publish(
      new SkillRemovedEvent(userId, skillId, skill?.name ?? ''),
    );
  }

  /** All of a user's skills, most-endorsed first. */
  async getSkills(userId: string): Promise<UserSkill[]> {
    return this.userSkillRepository.findByUserId(userId);
  }

  async endorseSkill(userId: string, skillId: string): Promise<void> {
    const userSkill = await this.userSkillRepository.findByUserAndSkill(
      userId,
      skillId,
    );
    if (!userSkill) throw new NotFoundException('Skill not found for user');

    userSkill.endorse();
    await this.userSkillRepository.save(userSkill);
  }
}
