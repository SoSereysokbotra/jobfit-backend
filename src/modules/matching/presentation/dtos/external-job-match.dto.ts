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
  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'NULL when location could not be measured (unresolvable place on either side). ' +
      'Excluded from `overall` rather than scored as a neutral value — render it as ' +
      '"not computed", the way `semantic: false` is handled for skills.',
  })
  location!: number | null;
  @ApiProperty() salary!: number;
  @ApiProperty({ description: 'Industry alignment (weight 10%)' })
  other!: number;
}

export class ExternalJobMatchDto {
  @ApiProperty() externalId!: string;
  @ApiProperty() source!: string;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Weighted total, 0-100 — or NULL when it could not be computed. Null means the ' +
      'skills comparison did not run (see `semantic`), and skills is the only ' +
      'component that measures fit to THIS role: experience and location alone would ' +
      'score a wildly unrelated job in the 90s, so no total is emitted at all.',
  })
  overall!: number | null;

  @ApiProperty({ type: ExternalJobSubScoresDto })
  subScores!: ExternalJobSubScoresDto;

  @ApiProperty({
    description:
      'False when the semantic (skills) component could not be computed — no ' +
      'candidate embedding, or the AI service was unreachable. When false, `overall` ' +
      'is null and `subScores.skills` is a placeholder that must be rendered as ' +
      '"not computed" rather than as a score.',
  })
  semantic!: boolean;
}
