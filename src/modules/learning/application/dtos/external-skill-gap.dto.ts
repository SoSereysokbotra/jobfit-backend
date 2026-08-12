// src/modules/learning/application/dtos/external-skill-gap.dto.ts
//
// `GET /learning/gap` — skill gaps for the browser extension, scoped to roles
// SIMILAR to the job being viewed (by title), NOT a market-wide "in-demand
// skills" list (which this codebase deliberately removed as field-blind). Shape
// mirrors the extension's `SkillGapReport`.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ExternalGapQueryDto {
  @ApiProperty({ description: "The source's job id from the page URL" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  jobExternalId!: string;

  @ApiProperty({ example: 'linkedin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  source!: string;

  // Optional: without a title there's nothing to scope similar roles by, so the
  // service returns an empty gap list rather than 400ing.
  @ApiPropertyOptional({ description: 'Job title as displayed on the source page' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class ExternalLearningPathDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() durationWeeks!: number;
  @ApiProperty() isFree!: boolean;
}

export class ExternalSkillGapItemDto {
  @ApiProperty() skill!: string;
  @ApiProperty({ description: 'Similar roles requiring this skill' })
  demandCount!: number;
  @ApiProperty({ description: 'Similar roles NOT requiring it' })
  jobsWithoutSkill!: number;
  @ApiPropertyOptional({ type: ExternalLearningPathDto, nullable: true })
  learningPath!: ExternalLearningPathDto | null;
}

export class ExternalSkillGapReportDto {
  @ApiProperty() jobExternalId!: string;
  @ApiProperty() source!: string;
  @ApiProperty({ type: [ExternalSkillGapItemDto] })
  gaps!: ExternalSkillGapItemDto[];
}
