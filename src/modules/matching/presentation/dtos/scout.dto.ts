// src/modules/matching/presentation/dtos/scout.dto.ts
//
// `GET /recommendations/scout` — new high-match jobs for the extension's passive
// background scout (Phase 11). Jobs published since `since` are scored LIVE for the user
// and returned at/above a score threshold. Shape mirrors the extension's `ScoutMatch`.
//
// It used to return the user's cached recommendations filtered by `job.createdAt`, which
// could never include a job ingested after their last recompute — see
// MENTOR_REVIEW_2026-08-18 §7 and the note on RecommendationsQueryService.getScout.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { MatchBand } from '../../domain/scoring/match-band';

export class ScoutQueryDto {
  @ApiPropertyOptional({ description: 'Minimum match score 0–100', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @ApiPropertyOptional({
    description:
      'Only jobs published after this ISO timestamp. Omitted: the last 7 days. The ' +
      'extension sends its last-poll watermark here.',
  })
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
  /**
   * ⚠️ ORDERING AND FILTERING, NOT DISPLAY. Since the two-dimensional rewrite this is the
   * gated composite — capability damped by how well the job fits the candidate's stated
   * preferences — so it spans 0–100 and a job that breaks a stated preference lands in
   * the twenties by design. Its magnitude has NOT been calibrated against human grades
   * (MENTOR_REVIEW_2026-08-18 §13 measured the score it replaced). `minScore` filters on
   * it, which is legitimate; the badge should render `band`.
   */
  @ApiProperty({
    description:
      'Match score 0–100 (gated composite of role fit and preference fit). For ' +
      'ordering/filtering; render `band`.',
  })
  score!: number;

  /** What the score is allowed to claim. Render this, not `score`. */
  @ApiProperty({ enum: ['STRONG', 'POSSIBLE', 'WEAK'] })
  band!: MatchBand;
  @ApiProperty({ description: 'Where the notification click navigates' }) url!: string;
}
