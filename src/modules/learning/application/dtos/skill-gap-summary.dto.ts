// src/modules/learning/application/dtos/skill-gap-summary.dto.ts
//
// What the jobs a user is actually chasing ask for that their CV does not evidence.
//
// Replaces a fixed list of ten technology skills that every user was measured against
// regardless of field, so a mathematics teacher was told to learn Docker and Kubernetes.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RequirementsSource } from '@modules/matching/application/services/skill-gap.service';

export class AggregatedGapDto {
  @ApiProperty({
    description:
      'The requirement exactly as it appears on the posting. Never paraphrased — the ' +
      'employer’s wording is what the candidate will be judged against.',
  })
  requirement: string;

  @ApiProperty({
    description:
      'How many of the user’s applications ask for this. A COUNT, not a grade: "needed by ' +
      '3 of your 4 applications" is checkable, "Priority: High" is not.',
  })
  requiredBy: number;

  @ApiProperty({
    enum: ['EMPLOYER', 'AI_EXTRACTED'],
    description:
      'Whether this requirement is the employer’s own words or the model’s reading of a ' +
      'free-text posting. Travels with the gap for the same reason it travels through ' +
      'screening: the second is useful but not authoritative.',
  })
  source: RequirementsSource;

  @ApiPropertyOptional({
    type: [String],
    description: 'Titles of the applied jobs asking for it, so the number can be checked.',
  })
  jobTitles?: string[];
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

  @ApiProperty({ type: [AggregatedGapDto], description: 'Most-required first.' })
  gaps: AggregatedGapDto[];
}
