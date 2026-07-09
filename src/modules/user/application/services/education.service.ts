// src/modules/user/application/services/education.service.ts
//
// Manages a user's education records. Education is a plain Entity, so EducationAddedEvent
// is raised here and published directly. Updates rebuild the entity (via its constructor)
// so invariants (e.g. endDate >= startDate, gpa range) are re-validated.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EducationRepository } from '../../infrastructure/repositories/education.repository';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { DomainEventBus } from '@events/domain-event-bus.service';
import {
  Education,
  EducationProps,
} from '../../domain/entities/education.entity';
import { AddEducationDto } from '../dtos/add-education.dto';
import { EducationAddedEvent } from '../../domain/events/education-added.event';
import { ERROR_MESSAGES } from '@common/constants/error-messages';

@Injectable()
export class EducationService {
  constructor(
    private readonly educationRepository: EducationRepository,
    private readonly userRepository: UserRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  async addEducation(userId: string, dto: AddEducationDto): Promise<Education> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    if (dto.startDate && dto.endDate && dto.endDate < dto.startDate) {
      throw new BadRequestException('startDate must be on or before endDate');
    }

    let education: Education;
    try {
      education = Education.create({
        userId,
        institution: dto.institution,
        degreeLevel: dto.degreeLevel,
        fieldOfStudy: dto.fieldOfStudy,
        description: dto.description,
        startDate: dto.startDate,
        endDate: dto.endDate,
        gpa: dto.gpa,
      });
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    await this.educationRepository.save(education);

    await this.eventBus.publish(
      new EducationAddedEvent(
        userId,
        education.id,
        education.institution,
        education.fieldOfStudy,
      ),
    );
    return education;
  }

  /** All of a user's education records, most recently finished first. */
  async getEducations(userId: string): Promise<Education[]> {
    return this.educationRepository.findByUserId(userId);
  }

  async updateEducation(
    id: string,
    dto: Partial<EducationProps>,
  ): Promise<Education> {
    const existing = await this.educationRepository.findById(id);
    if (!existing) throw new NotFoundException('Education not found');

    let updated: Education;
    try {
      // Rebuild via the constructor so invariants are re-validated, preserving id/createdAt.
      updated = new Education(
        {
          userId: existing.userId,
          institution: dto.institution ?? existing.institution,
          degreeLevel: dto.degreeLevel ?? existing.degreeLevel,
          fieldOfStudy: dto.fieldOfStudy ?? existing.fieldOfStudy,
          description: dto.description ?? existing.description,
          startDate: dto.startDate ?? existing.startDate,
          endDate: dto.endDate ?? existing.endDate,
          gpa: dto.gpa ?? existing.gpa,
          createdAt: existing.createdAt,
        },
        existing.id,
      );
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    await this.educationRepository.save(updated);
    return updated;
  }

  async deleteEducation(id: string): Promise<void> {
    await this.educationRepository.delete(id);
  }
}
