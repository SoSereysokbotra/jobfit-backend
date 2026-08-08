// src/modules/employer/application/dtos/employer-application-response.dto.ts
//
// Read model for the employer pipeline view: the candidate (non-secret fields), the job,
// current status, employer notes, and the AI Recruiter's screening assessment.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '@prisma/client';
import { employerActionsFrom } from '@modules/application/domain/entities/application.entity';
import { ApplicationStatus as DomainStatus } from '@shared/kernel/enums/application-status.enum';

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

  @ApiProperty({
    description:
      'Whether YOU have hidden this from your board. A view preference of your own — the ' +
      'candidate has a separate flag, and theirs can never remove a row from your board. ' +
      'It used to be able to: archiving was a shared status, so a candidate tidying an ' +
      'accepted job dropped it out of Hired and filed them under rejections.',
  })
  archived: boolean;

  @ApiProperty({
    description:
      'Messages from this candidate about their offer that you have not read. Drives the ' +
      'board badge — a status alone cannot distinguish a first message from a fifth, ' +
      'which is why later messages went unnoticed.',
  })
  unreadMessages: number;

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

  @ApiProperty({
    enum: ApplicationStatus,
    isArray: true,
    description:
      'Statuses the EMPLOYER can move this application to right now — reachable from its ' +
      'current status AND theirs to decide. Clients must derive their affordances from ' +
      'this rather than restating the rules: the board offered every column as a drop ' +
      'target, so "Hired" (ACCEPTED, the candidate\'s decision) refused every time. ' +
      'Check it PER CARD, not per column — from SUBMITTED this excludes INTERVIEW, and ' +
      'unscreened applications really do sit in SUBMITTED whenever screening could not ' +
      'run. An empty array is legitimate: an ARCHIVED application is finished.',
  })
  availableActions: ApplicationStatus[];

  constructor(row: {
    id: string;
    jobId: string;
    jobTitle: string;
    candidate: { id: string; name: string; email: string };
    status: ApplicationStatus;
    archived: boolean;
    unreadMessages: number;
    employerNotes: string | null;
    screening: ScreeningSummaryDto;
    appliedAt: Date;
  }) {
    this.id = row.id;
    this.jobId = row.jobId;
    this.jobTitle = row.jobTitle;
    this.candidate = row.candidate;
    this.status = row.status;
    this.archived = row.archived;
    this.unreadMessages = row.unreadMessages;
    this.employerNotes = row.employerNotes;
    this.screening = row.screening;
    this.appliedAt = row.appliedAt;
    this.availableActions = employerActionsFrom(
      row.status as unknown as DomainStatus,
    ) as unknown as ApplicationStatus[];
  }
}
