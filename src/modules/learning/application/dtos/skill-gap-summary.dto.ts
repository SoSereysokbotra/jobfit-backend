// src/modules/learning/application/dtos/skill-gap-summary.dto.ts
//
// What the jobs a user is actually chasing ask for that their CV does not evidence,
// grouped by application.
//
// Replaces a fixed list of ten technology skills every user was measured against regardless
// of field. Grouped by job because a requirement only means something next to the posting
// that asked for it — a flat list mixes three unrelated fields together and makes the reader
// reconstruct "which job is this?" on every row.

import { ApiProperty } from '@nestjs/swagger';
import { RequirementsSource } from '@modules/matching/application/services/skill-gap.service';

/**
 * Whether the CV says nothing about a requirement, or says something adjacent.
 *
 * PARTIAL exists because collapsing it into "covered" produced a false claim: a CV listing
 * "Effective Time Management" was reported as covering "Classroom behaviour management",
 * because both contain the word `management`. The matcher had labelled that weak; this layer
 * used to discard the label.
 */
export type GapCoverage = 'MISSING' | 'PARTIAL';

export class SkillGapItemDto {
  @ApiProperty({
    description:
      'The requirement exactly as it appears on the posting. Never paraphrased — the ' +
      'employer’s wording is what the candidate will be judged against.',
  })
  requirement: string;

  @ApiProperty({
    enum: ['MISSING', 'PARTIAL'],
    description:
      'MISSING — nothing on the CV evidences this. PARTIAL — something adjacent matched, ' +
      'which is worth showing but must NOT be presented as covered.',
  })
  coverage: GapCoverage;

  @ApiProperty({
    type: [String],
    description:
      'For PARTIAL only: the CV skills that caused the weak match. Naming them is what ' +
      'lets the user overrule us — "Time Management" against "Classroom behaviour ' +
      'management" is obviously wrong once it is said out loud.',
  })
  matchedSkills: string[];

  @ApiProperty({
    description:
      'How many of the user’s applications ask for this requirement — across all of them, ' +
      'not just this one. Grouping by job would otherwise hide the most useful signal on ' +
      'the page: the thing several employers want.',
  })
  requiredBy: number;
}

export class ApplicationGapsDto {
  @ApiProperty() applicationId: string;
  @ApiProperty() jobId: string;
  @ApiProperty() jobTitle: string;

  @ApiProperty({
    enum: ['EMPLOYER', 'AI_EXTRACTED'],
    description:
      'Whether this posting’s requirements are the employer’s own words or the model’s ' +
      'reading of free text. The user is entitled to know which they are judged on.',
  })
  source: RequirementsSource;

  @ApiProperty({ description: 'Requirements this posting states, so the UI can say "4 of 7".' })
  requirementsTotal: number;

  @ApiProperty({
    type: [SkillGapItemDto],
    description: 'MISSING before PARTIAL, then most-wanted, then alphabetical.',
  })
  gaps: SkillGapItemDto[];
}

export class SkillGapSummaryDto {
  @ApiProperty({
    description:
      'False when the user has applied to nothing. Explicit, because "no gaps" and ' +
      '"nothing to compute from" are different answers and must not render identically.',
  })
  hasApplications: boolean;

  @ApiProperty({
    description:
      'False when no résumé has been parsed. Also distinct: without a CV there are no ' +
      'skills to compare against, so every requirement would look like a gap.',
  })
  hasParsedResume: boolean;

  @ApiProperty({
    description:
      'Applications that actually contributed requirements. Postings that list none are ' +
      'excluded — counting them would dilute every fraction with jobs we know nothing about.',
  })
  jobsConsidered: number;

  @ApiProperty({
    type: [ApplicationGapsDto],
    description: 'Most gaps first — the posting the user is furthest from leads.',
  })
  applications: ApplicationGapsDto[];
}
