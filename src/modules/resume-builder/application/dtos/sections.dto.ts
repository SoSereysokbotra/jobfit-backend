// src/modules/resume-builder/application/dtos/sections.dto.ts
//
// Bulk-replace payloads for the six content sections.
//
// Every array section is REPLACE, not merge: the array you send becomes the whole
// section, and `order` is taken from array index. Sending a shorter array really
// does delete the extra rows. That matches how the editor works — it holds the
// section in memory and saves the whole thing — and it makes drag-to-reorder a
// plain array reorder rather than a per-row patch.
//
// Field names mirror the profile-side models (Experience/Education/Certification/
// UserSkill) so importing from profile in Phase 4 is a straight copy. Where the
// profile model has no equivalent (experience `location`) the field is still here,
// because a résumé line needs it — it is simply user-entered.

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DegreeLevel } from '@prisma/client';

/** Guards against a runaway client sending thousands of rows in one section. */
const MAX_SECTION_ITEMS = 100;

export class PutSummaryDto {
  @ApiProperty({ description: 'The whole summary. Send "" to clear it.' })
  @IsString()
  @MaxLength(5000)
  content: string;
}

export class ExperienceItemDto {
  @ApiProperty() @IsNotEmpty() @IsString() company: string;
  @ApiProperty() @IsNotEmpty() @IsString() title: string;

  @ApiPropertyOptional({ description: 'User-entered — profile has no location field.' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isCurrentJob?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  technologies?: string[];
}

export class PutExperienceDto {
  @ApiProperty({ type: [ExperienceItemDto] })
  @IsArray()
  @ArrayMaxSize(MAX_SECTION_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ExperienceItemDto)
  items: ExperienceItemDto[];
}

export class EducationItemDto {
  @ApiProperty() @IsNotEmpty() @IsString() institution: string;

  @ApiProperty({ enum: DegreeLevel })
  @IsEnum(DegreeLevel)
  degreeLevel: DegreeLevel;

  @ApiProperty() @IsNotEmpty() @IsString() fieldOfStudy: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  startDate: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ minimum: 0, maximum: 4 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(4)
  gpa?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;
}

export class PutEducationDto {
  @ApiProperty({ type: [EducationItemDto] })
  @IsArray()
  @ArrayMaxSize(MAX_SECTION_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => EducationItemDto)
  items: EducationItemDto[];
}

export class SkillItemDto {
  @ApiProperty() @IsNotEmpty() @IsString() name: string;

  @ApiPropertyOptional({ description: 'BEGINNER | INTERMEDIATE | ADVANCED | EXPERT' })
  @IsOptional()
  @IsString()
  proficiencyLevel?: string;
}

export class PutSkillsDto {
  @ApiProperty({ type: [SkillItemDto] })
  @IsArray()
  @ArrayMaxSize(MAX_SECTION_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => SkillItemDto)
  items: SkillItemDto[];
}

export class CertificationItemDto {
  @ApiProperty() @IsNotEmpty() @IsString() name: string;
  @ApiProperty() @IsNotEmpty() @IsString() issuer: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  issueDate: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expirationDate?: Date;

  @ApiPropertyOptional() @IsOptional() @IsString() credentialId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() credentialUrl?: string;
}

export class PutCertificationsDto {
  @ApiProperty({ type: [CertificationItemDto] })
  @IsArray()
  @ArrayMaxSize(MAX_SECTION_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CertificationItemDto)
  items: CertificationItemDto[];
}

export class ProjectItemDto {
  @ApiProperty() @IsNotEmpty() @IsString() name: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  technologies?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() url?: string;
}

export class PutProjectsDto {
  @ApiProperty({ type: [ProjectItemDto] })
  @IsArray()
  @ArrayMaxSize(MAX_SECTION_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ProjectItemDto)
  items: ProjectItemDto[];
}
