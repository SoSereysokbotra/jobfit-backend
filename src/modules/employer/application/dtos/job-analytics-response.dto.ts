// src/modules/employer/application/dtos/job-analytics-response.dto.ts
//
// Read model for GET /employer/jobs/:id/analytics.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class JobAnalyticsResponseDto {
  @ApiProperty() jobId: string;

  @ApiProperty({ description: 'Total non-deleted applications received.' })
  applicationsCount: number;

  @ApiProperty({ description: 'Application counts grouped by status.' })
  applicationsByStatus: Record<string, number>;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Average candidate match score (0-100), or null if none computed.',
  })
  averageMatchScore: number | null;

  @ApiProperty({
    description:
      'Placeholder — no view tracking exists yet (always 0 for now).',
  })
  views: number;

  constructor(params: {
    jobId: string;
    applicationsCount: number;
    applicationsByStatus: Record<string, number>;
    averageMatchScore: number | null;
  }) {
    this.jobId = params.jobId;
    this.applicationsCount = params.applicationsCount;
    this.applicationsByStatus = params.applicationsByStatus;
    this.averageMatchScore =
      params.averageMatchScore === null
        ? null
        : Math.round(params.averageMatchScore * 100) / 100;
    this.views = 0;
  }
}
