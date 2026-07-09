// src/modules/user/application/services/experience.service.ts
//
// Manages a user's work experiences. Experience is a plain Entity, so ExperienceAddedEvent
// is raised here and published directly. Updates rebuild the entity (via its constructor)
// so invariants (e.g. endDate >= startDate) are re-validated.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExperienceRepository } from '../../infrastructure/repositories/experience.repository';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { DomainEventBus } from '@events/domain-event-bus.service';
import { Experience } from '../../domain/entities/experience.entity';
import { AddExperienceDto } from '../dtos/add-experience.dto';
import { UpdateExperienceDto } from '../dtos/update-experience.dto';
import { ExperienceAddedEvent } from '../../domain/events/experience-added.event';
import { ERROR_MESSAGES } from '@common/constants/error-messages';

@Injectable()
export class ExperienceService {
  constructor(
    private readonly experienceRepository: ExperienceRepository,
    private readonly userRepository: UserRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  async addExperience(
    userId: string,
    dto: AddExperienceDto,
  ): Promise<Experience> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    if (dto.startDate && dto.endDate && dto.endDate < dto.startDate) {
      throw new BadRequestException('startDate must be on or before endDate');
    }
    if (dto.isCurrentJob && dto.endDate) {
      throw new BadRequestException('A current job cannot have an endDate');
    }

    const experience = Experience.create({
      userId,
      company: dto.company,
      title: dto.title,
      jobLevel: dto.jobLevel,
      employmentType: dto.employmentType,
      industry: dto.industry,
      description: dto.description,
      isCurrentJob: dto.isCurrentJob,
      startDate: dto.startDate,
      endDate: dto.endDate,
      technologies: dto.technologies,
    });
    await this.experienceRepository.save(experience);

    await this.eventBus.publish(
      new ExperienceAddedEvent(
        userId,
        experience.id,
        experience.company,
        experience.title,
      ),
    );
    return experience;
  }

  /** All of a user's experiences, newest first. */
  async getExperiences(userId: string): Promise<Experience[]> {
    return this.experienceRepository.findByUserId(userId);
  }

  async updateExperience(
    id: string,
    dto: UpdateExperienceDto,
  ): Promise<Experience> {
    const existing = await this.experienceRepository.findById(id);
    if (!existing) throw new NotFoundException('Experience not found');

    // Rebuild via the constructor so invariants are re-validated, preserving id/createdAt.
    const updated = new Experience(
      {
        userId: existing.userId,
        company: dto.company ?? existing.company,
        title: dto.title ?? existing.title,
        jobLevel: dto.jobLevel ?? existing.jobLevel,
        employmentType: existing.employmentType,
        industry: existing.industry,
        description: dto.description ?? existing.description,
        isCurrentJob: existing.isCurrentJob,
        startDate: existing.startDate,
        endDate: dto.endDate ?? existing.endDate,
        technologies: dto.technologies ?? existing.technologies,
        createdAt: existing.createdAt,
      },
      existing.id,
    );
    await this.experienceRepository.save(updated);
    return updated;
  }

  async deleteExperience(id: string): Promise<void> {
    await this.experienceRepository.delete(id);
  }
}
