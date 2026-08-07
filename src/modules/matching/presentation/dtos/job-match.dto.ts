import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class JobMatchQueryDto {
  @ApiProperty({ description: 'The job to score against the current user’s profile.' })
  @IsUUID()
  jobId: string;
}

export class MatchBreakdownDto {
  @ApiProperty() skills: number;
  @ApiProperty() experience: number;
  @ApiProperty() location: number;
  @ApiProperty() salary: number;
  @ApiProperty() other: number;
}

export class JobMatchDto {
  @ApiProperty({ description: '0-100 weighted total from the deterministic scorer.' })
  score: number;

  @ApiProperty({ type: MatchBreakdownDto })
  breakdown: MatchBreakdownDto;

  @ApiProperty({
    type: [String],
    description:
      'Statements derived from the sub-scores. Never generated text — each line ' +
      'restates a number that was actually computed.',
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
