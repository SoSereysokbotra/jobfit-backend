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

  @ApiProperty()
  startDate: Date;

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
    this.startDate = experience.startDate;
    this.endDate = experience.endDate;
    this.technologies = experience.technologies;
    this.createdAt = experience.createdAt;
    this.updatedAt = experience.updatedAt;
  }
}
