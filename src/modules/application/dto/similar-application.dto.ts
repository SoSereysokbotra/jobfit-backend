// src/modules/application/dto/similar-application.dto.ts
//
// `GET /applications/similar` — the extension's "Application Radar" duplicate
// detector. Given a company + role from a job page, returns the current user's
// most recent prior application to the same company + a matching title, or null.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';

export class SimilarApplicationQueryDto {
  @ApiProperty({ description: 'Job title as displayed on the source page' })
  @IsString()
  @MaxLength(200)
  jobTitle!: string;

  @ApiProperty({ description: 'Company display name from the source page' })
  @IsString()
  @MaxLength(200)
  companyName!: string;

  // The extension also sends externalId/source. They're unused here but MUST be
  // declared, or the global forbidNonWhitelisted ValidationPipe 400s the request.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(128)
  externalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;
}

export class DuplicateApplicationDto {
  @ApiProperty() applicationId!: string;
  @ApiProperty() jobTitle!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) companyName!: string | null;
  @ApiProperty({ enum: ApplicationStatus }) status!: ApplicationStatus;
  @ApiProperty({ description: 'ISO timestamp' }) appliedAt!: string;
}
