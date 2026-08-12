// src/modules/matching/presentation/dtos/scout.dto.ts
//
// `GET /recommendations/scout` — new high-match jobs for the extension's passive
// background scout (Phase 11). Returns the user's recommendations at/above a
// score threshold (optionally only jobs newer than `since`). Shape mirrors the
// extension's `ScoutMatch`.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export class ScoutQueryDto {
  @ApiPropertyOptional({ description: 'Minimum match score 0–100', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @ApiPropertyOptional({ description: 'Only jobs newer than this ISO timestamp' })
  @IsOptional()
  @IsISO8601()
  since?: string;
}

export class ScoutMatchDto {
  @ApiProperty() externalId!: string;
  @ApiProperty({ description: 'linkedin | indeed | source name | "jobfit"' })
  source!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) company!: string | null;
  @ApiProperty({ description: '0–100 match score' }) score!: number;
  @ApiProperty({ description: 'Where the notification click navigates' }) url!: string;
}
