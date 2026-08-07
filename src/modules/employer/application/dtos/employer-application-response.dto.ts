// src/modules/employer/application/dtos/employer-application-response.dto.ts
//
// Read model for the employer pipeline view: the candidate (non-secret fields), the job,
// current status, employer notes, and the AI Recruiter's screening assessment.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';

/**
 * What the automatic screening found when this candidate applied.
 *
 * A SNAPSHOT of that moment, never recomputed — so an employer can always explain a
 * decision they made on it, even after the candidate edits their résumé.
 */
export class ScreeningSummaryDto {
  @ApiProperty({ description: 'When screening ran. Null means it never did.' })
  screenedAt: Date | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      '0-100 from the DETERMINISTIC scorer, never the LLM fitScore. Treat as a tiebreak: ' +
      'measured on four candidates spanning a senior engineer to a graphic designer it ' +
      'varied by only 4 points, while requirement coverage separated them cleanly.',
  })
  matchScore: number | null;

  @ApiProperty({ description: 'Stated requirements this candidate was checked against.' })
  requirementsTotal: number;

  @ApiProperty({ description: 'How many the résumé evidences. The ranking signal.' })
  requirementsCovered: number;

  @ApiProperty({ type: [String], description: 'Requirements with no supporting skill.' })
  missingRequirements: string[];

  @ApiProperty({
    enum: ['EMPLOYER', 'AI_EXTRACTED', 'NONE'],
    description:
      'Whether the requirements were written by the employer or read out of the job ' +
      'description by AI. The employer is entitled to know which they are judging on.',
  })
  requirementsSource: string;
}

export class EmployerApplicationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() jobId: string;
  @ApiProperty() jobTitle: string;

  @ApiProperty({ description: 'Candidate (non-secret projection).' })
  candidate: { id: string; name: string; email: string };

  @ApiProperty({ enum: ApplicationStatus }) status: ApplicationStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) employerNotes: string | null;

  @ApiProperty({
    type: ScreeningSummaryDto,
    description:
      'Automatic screening result. Replaces the old top-level `matchScore`, which read ' +
      'from the `matchScore` table — a table with zero rows that nothing writes to, so ' +
      'the field could never hold a value.',
  })
  screening: ScreeningSummaryDto;

  @ApiProperty() appliedAt: Date;

  constructor(row: {
    id: string;
    jobId: string;
    jobTitle: string;
    candidate: { id: string; name: string; email: string };
    status: ApplicationStatus;
    employerNotes: string | null;
    screening: ScreeningSummaryDto;
    appliedAt: Date;
  }) {
    this.id = row.id;
    this.jobId = row.jobId;
    this.jobTitle = row.jobTitle;
    this.candidate = row.candidate;
    this.status = row.status;
    this.employerNotes = row.employerNotes;
    this.screening = row.screening;
    this.appliedAt = row.appliedAt;
  }
}
