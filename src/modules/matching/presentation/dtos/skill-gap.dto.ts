import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SkillGapQueryDto {
  @ApiProperty({ description: 'The job to analyse against the current user’s résumé.' })
  @IsUUID()
  jobId: string;
}

export class RequirementMatchDto {
  @ApiProperty({ description: 'The requirement exactly as the employer wrote it.' })
  text: string;

  @ApiProperty({
    type: [String],
    description: 'Résumé skills found in this requirement. Empty means it is a gap.',
  })
  matchedSkills: string[];
}

export class SkillGapDto {
  @ApiProperty({
    enum: ['OK', 'JOB_HAS_NO_REQUIREMENTS', 'NO_PARSED_RESUME'],
    description:
      'Why the result may be empty. An empty `missing` list means something very ' +
      'different for each value, so the client must branch on this rather than on ' +
      '`missing.length` — a job that listed no requirements is not a perfect match.',
  })
  status: string;

  @ApiProperty({
    enum: ['EMPLOYER', 'AI_EXTRACTED', 'NONE'],
    description:
      'Whether the requirements are the employer’s own words or the AI service’s reading ' +
      'of the posting. The client MUST surface this: AI-extracted requirements are useful ' +
      'but not authoritative, and showing them as the employer’s overstates what is known.',
  })
  requirementsSource: string;

  @ApiProperty({ type: [RequirementMatchDto] })
  requirements: RequirementMatchDto[];

  @ApiProperty({
    type: [String],
    description: 'Requirements with no supporting skill — what the user should act on.',
  })
  missing: string[];

  @ApiProperty() matchedCount: number;

  @ApiPropertyOptional({
    type: [String],
    description: 'Skills read from the user’s most recent parsed résumé.',
  })
  skillsConsidered: string[];
}
