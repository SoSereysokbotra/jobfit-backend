// src/modules/user/application/dtos/experience-response.dto.ts
//
// API response projection of an Experience entity.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Experience } from '../../domain/entities/experience.entity';
import { JobLevel } from '@shared/kernel/enums/job-level.enum';
import { EmploymentType } from '@shared/kernel/enums/employment-type.enum';

export class ExperienceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  company: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: JobLevel })
  jobLevel: JobLevel;

  @ApiProperty({ enum: EmploymentType })
  employmentType: EmploymentType;

  @ApiProperty()
  industry: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  isCurrentJob: boolean;

  /**
   * Absent when no dates were recorded. The profile form no longer collects employment
   * dates, so rows added through it carry none; older rows keep what they were saved
   * with. Clients must render the absence rather than substituting a date.
   */
  @ApiPropertyOptional()
  startDate?: Date;

  @ApiPropertyOptional()
  endDate?: Date;

  @ApiProperty({ type: [String] })
  technologies: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(experience: Experience) {
    this.id = experience.id;
    this.userId = experience.userId;
    this.company = experience.company;
    this.title = experience.title;
    this.jobLevel = experience.jobLevel;
    this.employmentType = experience.employmentType;
    this.industry = experience.industry;
    this.description = experience.description;
    this.isCurrentJob = experience.isCurrentJob;
    this.startDate = experience.startDate ?? undefined;
    this.endDate = experience.endDate;
    this.technologies = experience.technologies;
    this.createdAt = experience.createdAt;
    this.updatedAt = experience.updatedAt;
  }
}
