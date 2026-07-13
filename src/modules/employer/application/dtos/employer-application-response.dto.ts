// src/modules/employer/application/dtos/employer-application-response.dto.ts
//
// Read model for the employer pipeline view. Exposes the candidate (non-secret fields),
// the job, current status, employer notes and an optional match score.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';

export class EmployerApplicationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() jobId: string;
  @ApiProperty() jobTitle: string;

  @ApiProperty({ description: 'Candidate (non-secret projection).' })
  candidate: { id: string; name: string; email: string };

  @ApiProperty({ enum: ApplicationStatus }) status: ApplicationStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) employerNotes:
    string | null;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Candidate match score for this job (0-100), when available.',
  })
  matchScore: number | null;
  @ApiProperty() appliedAt: Date;

  constructor(row: {
    id: string;
    jobId: string;
    jobTitle: string;
    candidate: { id: string; name: string; email: string };
    status: ApplicationStatus;
    employerNotes: string | null;
    matchScore: number | null;
    appliedAt: Date;
  }) {
    this.id = row.id;
    this.jobId = row.jobId;
    this.jobTitle = row.jobTitle;
    this.candidate = row.candidate;
    this.status = row.status;
    this.employerNotes = row.employerNotes;
    this.matchScore = row.matchScore;
    this.appliedAt = row.appliedAt;
  }
}
