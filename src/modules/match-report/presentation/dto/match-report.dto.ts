// src/modules/match-report/presentation/dto/match-report.dto.ts
//
// The global ValidationPipe runs with `forbidNonWhitelisted: true`, so EVERY field the
// extension sends has to be declared here or the request 400s with a message the user
// never sees. Keep this in step with the extension's CREATE_MATCH_REPORT message.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Maximum description we accept.
 *
 * The extension already caps what it captures; this is the server-side twin of that cap.
 * It is a bound on the AI call (a whole posting is well under it) and on what a caller
 * could push through this route, not a target.
 */
const MAX_DESCRIPTION = 20000;

/**
 * How the extension obtained the description, sent alongside it.
 *
 * MUST be declared even though the service only records it: `forbidNonWhitelisted`
 * rejects the WHOLE request over one undeclared field, so an extension that sends
 * provenance against a DTO that doesn't know the word gets a 400 and the user sees
 * "couldn't build the report" with nothing to go on. (That is exactly what happened
 * between the extension's extraction-preview feature and this DTO — found 2026-08-25.)
 */
export class ExtractionProvenanceDto {
  @ApiProperty({ enum: ['json-ld', 'selector', 'longest-paragraph'] })
  @IsIn(['json-ld', 'selector', 'longest-paragraph'])
  strategy!: string;

  @ApiProperty({ description: 'The selector or JSON-LD property that supplied the text' })
  @IsString()
  @MaxLength(200)
  via!: string;

  @ApiProperty({ description: 'Length of the text actually sent' })
  @IsInt()
  @Min(0)
  @Max(MAX_DESCRIPTION)
  chars!: number;

  @ApiProperty({ description: 'True when the user corrected the text before sending' })
  @IsBoolean()
  edited!: boolean;
}

/** 40 years in months — the same ceiling the text parser applies to "N years". */
const MAX_REQUIRED_MONTHS = 480;

/**
 * Pay as the POSTING advertises it, with its period.
 *
 * The period is required whenever an amount is given, and that is the whole point: this
 * project's schema note records that a bare salary integer made "a Cambodian monthly
 * figure and a US annual figure indistinguishable in the same column". A number without
 * its unit is not usable data.
 */
export class PostedSalaryDto {
  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  min?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000_000)
  max?: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, description: 'MONTH | YEAR | HOUR …' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  period?: string | null;
}

export class CreateMatchReportDto {
  @ApiProperty({ description: "The source's job id, read from the page URL" })
  @IsString()
  @MaxLength(128)
  externalId!: string;

  @ApiProperty({ example: 'linkedin' })
  @IsString()
  @MaxLength(32)
  source!: string;

  @ApiProperty({ description: 'The job title as displayed on the posting' })
  @IsString()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string | null;

  @ApiProperty({
    description:
      'The visible posting text. Used ONCE to extract requirements; only the derived ' +
      'report is stored — this is not a job-listing store.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MAX_DESCRIPTION)
  jobDescription!: string;

  @ApiPropertyOptional({ type: ExtractionProvenanceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExtractionProvenanceDto)
  extraction?: ExtractionProvenanceDto;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      "Months of experience the POSTING publishes as a number (schema.org " +
      "experienceRequirements.monthsOfExperience). Preferred over reading a bar out of " +
      'the description: a published 36 is unambiguous in any language, while "3 years" ' +
      'in Khmer prose sits next to age ranges that read identically.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_REQUIRED_MONTHS)
  requiredMonths?: number | null;

  @ApiPropertyOptional({ type: PostedSalaryDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PostedSalaryDto)
  postedSalary?: PostedSalaryDto | null;
}

export class CreateMatchReportResponseDto {
  @ApiProperty({ description: 'Open the report at {WEB_APP}/match-report/{id}' })
  id!: string;
}
