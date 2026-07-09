// src/modules/user/application/dtos/education-response.dto.ts
//
// API response projection of an Education entity.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Education } from '../../domain/entities/education.entity';
import { DegreeLevel } from '@shared/kernel/enums/degree-level.enum';

export class EducationResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  institution: string;

  @ApiProperty({ enum: DegreeLevel })
  degreeLevel: DegreeLevel;

  @ApiProperty()
  fieldOfStudy: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  startDate: Date;

  @ApiPropertyOptional()
  endDate?: Date;

  @ApiPropertyOptional()
  gpa?: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(education: Education) {
    this.id = education.id;
    this.userId = education.userId;
    this.institution = education.institution;
    this.degreeLevel = education.degreeLevel;
    this.fieldOfStudy = education.fieldOfStudy;
    this.description = education.description;
    this.startDate = education.startDate;
    this.endDate = education.endDate;
    this.gpa = education.gpa;
    this.createdAt = education.createdAt;
    this.updatedAt = education.updatedAt;
  }
}
