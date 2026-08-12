// src/modules/match-report/presentation/dto/match-report.dto.ts
//
// The global ValidationPipe runs with `forbidNonWhitelisted: true`, so EVERY field the
// extension sends has to be declared here or the request 400s with a message the user
// never sees. Keep this in step with the extension's CREATE_MATCH_REPORT message.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Maximum description we accept.
 *
 * The extension already caps what it captures; this is the server-side twin of that cap.
 * It is a bound on the AI call (a whole posting is well under it) and on what a caller
 * could push through this route, not a target.
 */
const MAX_DESCRIPTION = 20000;

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
}

export class CreateMatchReportResponseDto {
  @ApiProperty({ description: 'Open the report at {WEB_APP}/match-report/{id}' })
  id!: string;
}
