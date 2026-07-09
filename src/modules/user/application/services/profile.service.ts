// src/modules/user/application/services/profile.service.ts
//
// Manages a user's Profile (1:1 with User). Uses the Location and SalaryRange value
// objects; domain validation errors surface as 400s. Updates rebuild the entity via its
// constructor so invariants (bio length, URL format) are re-validated.

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfileRepository } from '../../infrastructure/repositories/profile.repository';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { DomainEventBus } from '@events/domain-event-bus.service';
import { Profile, WorkPreferences } from '../../domain/entities/profile.entity';
import { Location } from '@shared/kernel/value-objects/location.vo';
import { SalaryRange } from '@shared/kernel/value-objects/salary-range.vo';
import { CreateProfileDto, LocationDto } from '../dtos/create-profile.dto';
import { UpdateProfileDto } from '../dtos/update-profile.dto';
import { ProfileCreatedEvent } from '../../domain/events/profile-created.event';
import { ProfileUpdatedEvent } from '../../domain/events/profile-updated.event';
import { PreferencesUpdatedEvent } from '../../domain/events/preferences-updated.event';
import { ERROR_MESSAGES } from '@common/constants/error-messages';

@Injectable()
export class ProfileService {
  constructor(
    private readonly profileRepository: ProfileRepository,
    private readonly userRepository: UserRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  async createProfile(
    userId: string,
    dto: CreateProfileDto,
  ): Promise<Profile> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    let profile: Profile;
    try {
      profile = Profile.create({
        userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        photoUrl: dto.photoUrl,
        bio: dto.bio,
        headline: dto.headline,
        location: this.toLocation(dto.location),
        salaryRange: this.toSalaryRange(dto.minSalary, dto.maxSalary, dto.salaryCurrency),
        linkedinUrl: dto.linkedinUrl,
        githubUrl: dto.githubUrl,
        portfolioUrl: dto.portfolioUrl,
      });
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    await this.profileRepository.save(profile);
    await this.eventBus.publish(new ProfileCreatedEvent(userId, profile.id));
    return profile;
  }

  async getProfile(userId: string): Promise<Profile> {
    const profile = await this.profileRepository.findByUserId(userId);
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<Profile> {
    const existing = await this.getProfile(userId);

    let updated: Profile;
    try {
      // Rebuild via the constructor so invariants are re-validated, preserving id/createdAt.
      updated = new Profile(
        {
          userId: existing.userId,
          firstName: dto.firstName ?? existing.firstName,
          lastName: dto.lastName ?? existing.lastName,
          phone: dto.phone ?? existing.phone,
          photoUrl: existing.photoUrl,
          bio: dto.bio ?? existing.bio,
          headline: dto.headline ?? existing.headline,
          location: dto.location ? this.toLocation(dto.location) : existing.location,
          desiredJobLevels: existing.desiredJobLevels,
          desiredRemoteTypes: existing.desiredRemoteTypes,
          desiredEmploymentTypes: existing.desiredEmploymentTypes,
          desiredIndustries: existing.desiredIndustries,
          salaryRange: existing.salaryRange,
          linkedinUrl: dto.linkedinUrl ?? existing.linkedinUrl,
          githubUrl: dto.githubUrl ?? existing.githubUrl,
          portfolioUrl: dto.portfolioUrl ?? existing.portfolioUrl,
          createdAt: existing.createdAt,
        },
        existing.id,
      );
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    await this.profileRepository.save(updated);
    await this.eventBus.publish(
      new ProfileUpdatedEvent(
        userId,
        'profile',
        { firstName: existing.firstName, lastName: existing.lastName },
        { firstName: updated.firstName, lastName: updated.lastName },
      ),
    );
    return updated;
  }

  async updateWorkPreferences(
    userId: string,
    prefs: WorkPreferences,
  ): Promise<Profile> {
    const profile = await this.getProfile(userId);
    profile.updateWorkPreferences(prefs);
    await this.profileRepository.save(profile);
    await this.eventBus.publish(new PreferencesUpdatedEvent(userId));
    return profile;
  }

  async updateSalaryExpectations(
    userId: string,
    min: number,
    max: number,
  ): Promise<Profile> {
    if (min <= 0) {
      throw new BadRequestException('Minimum salary must be greater than 0');
    }
    if (max <= min) {
      throw new BadRequestException(
        'Maximum salary must be greater than minimum salary',
      );
    }

    const profile = await this.getProfile(userId);
    profile.salaryRange = SalaryRange.create(
      min,
      max,
      profile.salaryRange?.currency,
    );
    profile.updatedAt = new Date();
    await this.profileRepository.save(profile);
    return profile;
  }

  private toLocation(location?: LocationDto): Location | undefined {
    if (!location) return undefined;
    return Location.create(
      location.city,
      location.state ?? '',
      location.country,
      location.latitude,
      location.longitude,
    );
  }

  private toSalaryRange(
    min?: number,
    max?: number,
    currency?: string,
  ): SalaryRange | undefined {
    if (min === undefined || max === undefined) return undefined;
    return SalaryRange.create(min, max, currency);
  }
}
