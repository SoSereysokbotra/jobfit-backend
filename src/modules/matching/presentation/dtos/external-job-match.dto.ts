import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Query for `GET /recommendations/by-job` — used by the browser extension to
 * score a posting the user is viewing on an external site.
 *
 * Only identifiers are accepted. The posting's description is deliberately NOT
 * part of this contract: the extension must never scrape listing bodies, and we
 * never store anything about the external posting.
 */
export class ExternalJobMatchQueryDto {
  @ApiProperty({ description: "The source's job id, e.g. a LinkedIn job id" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  externalId!: string;

  @ApiProperty({ example: 'linkedin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  source!: string;

  @ApiProperty({ description: 'Job title as displayed on the source page' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Company display name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @ApiPropertyOptional({ description: 'Location as displayed on the source page' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @ApiPropertyOptional({ enum: ['REMOTE', 'HYBRID', 'ON_SITE'] })
  @IsOptional()
  @IsIn(['REMOTE', 'HYBRID', 'ON_SITE'])
  remoteType?: string;
}

export class ExternalJobSubScoresDto {
  @ApiProperty() skills!: number;
  @ApiProperty() experience!: number;
  @ApiProperty() location!: number;
  @ApiProperty() salary!: number;
  @ApiProperty({ description: 'Industry alignment (weight 10%)' })
  other!: number;
}

export class ExternalJobMatchDto {
  @ApiProperty() externalId!: string;
  @ApiProperty() source!: string;

  @ApiProperty({ description: 'Weighted total, 0-100' })
  overall!: number;

  @ApiProperty({ type: ExternalJobSubScoresDto })
  subScores!: ExternalJobSubScoresDto;

  @ApiProperty({
    description:
      'False when the semantic (skills) component could not be computed — no ' +
      'candidate embedding or the AI service was unreachable — and a neutral ' +
      'value was used instead. Surface this so the score is not over-trusted.',
  })
  semantic!: boolean;
}
