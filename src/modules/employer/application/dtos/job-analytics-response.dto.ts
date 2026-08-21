// src/modules/employer/application/dtos/job-analytics-response.dto.ts
//
// Read model for GET /employer/jobs/:id/analytics.

import { ApiProperty } from '@nestjs/swagger';

export class JobAnalyticsResponseDto {
  @ApiProperty() jobId: string;

  @ApiProperty({ description: 'Total non-deleted applications received.' })
  applicationsCount: number;

  @ApiProperty({ description: 'Application counts grouped by status.' })
  applicationsByStatus: Record<string, number>;

  /**
   * The matched candidate pool, split into the bands §13's calibration supports.
   *
   * Replaces `averageMatchScore`, which read an AVG from `match_scores` — a table with no
   * rows and no writer — so it was `null` on every request ever made and the UI's "Avg
   * Match" card always showed "—" (MENTOR_REVIEW_2026-08-18 §15). Restoring it as an
   * average from `recommendations` was rejected: the score's observed range is 41–69 on a
   * scale presented as 0–100 and the human grades overlap inside it, so a mean would be a
   * magnitude claim the calibration does not support (§13).
   */
  @ApiProperty({
    description:
      'Matched candidates by confidence band. Counts, not an average — the score is ' +
      'calibrated for ORDERING, not magnitude (see §13).',
  })
  candidateBands: { strong: number; possible: number; weak: number };

  @ApiProperty({
    description:
      'Placeholder — no view tracking exists yet (always 0 for now).',
  })
  views: number;

  constructor(params: {
    jobId: string;
    applicationsCount: number;
    applicationsByStatus: Record<string, number>;
    candidateBands: { strong: number; possible: number; weak: number };
  }) {
    this.jobId = params.jobId;
    this.applicationsCount = params.applicationsCount;
    this.applicationsByStatus = params.applicationsByStatus;
    this.candidateBands = params.candidateBands;
    this.views = 0;
  }
}
