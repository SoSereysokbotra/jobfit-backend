import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { MatchFlagsDto } from './recommended-job.dto';
import { MatchBand } from '../../domain/scoring/match-band';

export class JobMatchQueryDto {
  @ApiProperty({ description: 'The job to score against the current user’s profile.' })
  @IsUUID()
  jobId: string;
}

export class MatchBreakdownDto {
  @ApiProperty() skills: number;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'NULL when the posting stated no seniority — no structured `experienceLevel` and ' +
      'nothing recognisable in the title (two jobs in three). EXCLUDED from the total ' +
      'rather than scored as a neutral value; render it as "not computed".',
  })
  experience: number | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'NULL when location could not be measured — the profile or the job named a place ' +
      'we could not resolve. It is then EXCLUDED from `score`, not scored as a neutral ' +
      'value. Clients must render it as "not computed" rather than as a low match.',
  })
  location: number | null;
  @ApiProperty() salary: number;
  @ApiProperty() other: number;
}

export class JobMatchDto {
  @ApiProperty({
    description:
      '0-100 overall score from the deterministic scorer: `roleFitScore` damped by ' +
      '`preferenceFitScore`, so a job the candidate cannot take cannot score highly on ' +
      'a strong résumé alone.',
  })
  score: number;

  @ApiProperty({
    description:
      'Role / capability fit, 0-100 — skills and seniority only. This is the number to ' +
      'read when the question is "can this person do the job?".',
  })
  roleFitScore: number;

  @ApiProperty({
    description:
      'Preference / logistics fit, 0-100 — work arrangement, location, employment type, ' +
      'level and salary against what THIS candidate asked for.',
  })
  preferenceFitScore: number;

  @ApiProperty({
    enum: ['STRONG', 'POSSIBLE', 'WEAK'],
    description: 'What the overall score is allowed to claim. Prefer it over `score`.',
  })
  band: MatchBand;

  @ApiProperty({
    type: MatchFlagsDto,
    description:
      'Highlights and warnings. `warnings` are also appended to `reasons`, so a client ' +
      'showing only the list still shows the conflicts.',
  })
  flags: MatchFlagsDto;

  @ApiProperty({ type: MatchBreakdownDto })
  breakdown: MatchBreakdownDto;

  @ApiProperty({
    type: [String],
    description:
      'Statements derived from the sub-scores, followed by any preference warnings. ' +
      'Never generated text — each line restates something that was actually computed.',
  })
  reasons: string[];

  @ApiProperty({
    description:
      'False when the job or profile has no embedding, so `skills` could not be ' +
      'computed and the total UNDERSTATES real fit. Clients must surface this rather ' +
      'than present a deflated score as fact.',
  })
  skillsScored: boolean;
}
