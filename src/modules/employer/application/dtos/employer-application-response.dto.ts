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
 *
 * WHICH RÉSUMÉ THE SNAPSHOT IS OF — the two fields differ, so do not read them as one
 * number about one document:
 *
 *  - `requirementsTotal` / `requirementsCovered` / `missingRequirements` are computed
 *    from `Application.resumeId` — the CV the candidate actually submitted. Fixed at
 *    submission and unaffected by anything they change later.
 *  - `matchScore` is NOT per-résumé. It is a cosine against `profiles.embedding`, one
 *    vector per user built from their profile plus their ACTIVE résumé at screening
 *    time. It was frozen with the rest of the snapshot, but the document behind it was
 *    whichever CV was default then — not necessarily the submitted one.
 *
 * Until this comment said so, the guarantee above was simply false: screening read the
 * active résumé for BOTH halves (MENTOR_REVIEW_2026-08-18 §5). Closing the remaining gap
 * needs per-résumé embeddings, which PHASE_DEFAULT_RESUME.md deliberately rejected — so
 * it is a stated limitation, not an oversight.
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

/**
 * The résumé the candidate submitted with this application — metadata only.
 *
 * NO URL HERE, on purpose. A board load lists every application; minting a signed
 * download credential for each one would put dozens of live URLs into a response that may
 * be cached, logged or shared, when the employer will open at most one or two. Ask for the
 * URL when you actually want the file: `GET /employer/applications/:id/resume`.
 */
export class SubmittedResumeDto {
  @ApiProperty() id: string;
  @ApiProperty({ description: 'As the candidate named it — shown on the card.' })
  fileName: string;
  @ApiProperty({ description: 'PDF | DOCX' }) fileType: string;
  @ApiProperty({ description: 'Bytes.' }) fileSize: number;

  constructor(row: {
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
  }) {
    this.id = row.id;
    this.fileName = row.fileName;
    this.fileType = row.fileType;
    this.fileSize = row.fileSize;
  }
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

  @ApiPropertyOptional({
    type: SubmittedResumeDto,
    nullable: true,
    description:
      'The CV this candidate applied with — the one recorded on the application, not ' +
      'whichever résumé is their default today. Null when they had none to send, or when ' +
      'they have since deleted it. Call GET /employer/applications/{id}/resume for a ' +
      'short-lived download URL.',
  })
  resume: SubmittedResumeDto | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'The cover letter the candidate wrote for this application. It was on the ' +
      'Application row all along and simply never reached the employer.',
  })
  coverLetter: string | null;

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
    resume: SubmittedResumeDto | null;
    coverLetter: string | null;
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
    this.resume = row.resume;
    this.coverLetter = row.coverLetter;
    this.appliedAt = row.appliedAt;
    this.availableActions = employerActionsFrom(
      row.status as unknown as DomainStatus,
    ) as unknown as ApplicationStatus[];
  }
}
