// src/modules/user/application/dtos/profile-response.dto.ts
//
// API response projection of the Profile aggregate. Built from a domain Profile entity so
// controllers never leak the entity or its value objects; Location and SalaryRange are
// flattened to plain JSON shapes.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Profile } from '../../domain/entities/profile.entity';
import { JobLevel } from '@shared/kernel/enums/job-level.enum';
import { RemoteType } from '@shared/kernel/enums/remote-type.enum';
import { EmploymentType } from '@shared/kernel/enums/employment-type.enum';

interface LocationView {
  city: string;
  state: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

interface SalaryRangeView {
  min: number;
  max: number;
  currency: string;
}

export class ProfileResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional()
  photoUrl?: string;

  @ApiPropertyOptional()
  bio?: string;

  @ApiPropertyOptional()
  headline?: string;

  @ApiPropertyOptional({ nullable: true })
  location: LocationView | null;

  @ApiProperty({ enum: JobLevel, isArray: true })
  desiredJobLevels: JobLevel[];

  @ApiProperty({ enum: RemoteType, isArray: true })
  desiredRemoteTypes: RemoteType[];

  @ApiProperty({ enum: EmploymentType, isArray: true })
  desiredEmploymentTypes: EmploymentType[];

  @ApiProperty({ type: [String] })
  desiredIndustries: string[];

  @ApiPropertyOptional({ nullable: true })
  salaryRange: SalaryRangeView | null;

  @ApiPropertyOptional()
  linkedinUrl?: string;

  @ApiPropertyOptional()
  githubUrl?: string;

  @ApiPropertyOptional()
  portfolioUrl?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(profile: Profile) {
    this.id = profile.id;
    this.userId = profile.userId;
    this.firstName = profile.firstName;
    this.lastName = profile.lastName;
    this.phone = profile.phone;
    this.photoUrl = profile.photoUrl;
    this.bio = profile.bio;
    this.headline = profile.headline;
    this.location = profile.location
      ? {
          city: profile.location.city,
          state: profile.location.state,
          country: profile.location.country,
          latitude: profile.location.latitude,
          longitude: profile.location.longitude,
        }
      : null;
    this.desiredJobLevels = profile.desiredJobLevels;
    this.desiredRemoteTypes = profile.desiredRemoteTypes;
    this.desiredEmploymentTypes = profile.desiredEmploymentTypes;
    this.desiredIndustries = profile.desiredIndustries;
    this.salaryRange = profile.salaryRange
      ? {
          min: profile.salaryRange.min,
          max: profile.salaryRange.max,
          currency: profile.salaryRange.currency,
        }
      : null;
    this.linkedinUrl = profile.linkedinUrl;
    this.githubUrl = profile.githubUrl;
    this.portfolioUrl = profile.portfolioUrl;
    this.createdAt = profile.createdAt;
    this.updatedAt = profile.updatedAt;
  }
}
