import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SalaryRangeResponseDto {
  @ApiProperty() min: number;
  @ApiProperty() max: number;
  @ApiProperty() currency: string;
}

/**
 * Real company facts, for the job detail page.
 *
 * Every field is optional and omitted when the database has no value. The panel this
 * feeds used to hardcode "Technology & Software", "500-1000 employees", "Series C, $120M"
 * and "Glassdoor 4.2/5 (234 reviews)" for every company — inventing facts about real
 * businesses. Most companies have almost none of this recorded (`size` is populated 0
 * times across the table), so a missing field must render as nothing, never as a default.
 */
export class CompanyProfileDto {
  @ApiProperty() name: string;
  @ApiPropertyOptional() description?: string;
  @ApiPropertyOptional() website?: string;
  @ApiPropertyOptional({ description: 'Resolved Industry.name, not the raw id.' })
  industry?: string;
  @ApiPropertyOptional({ description: 'STARTUP | SMALL | MEDIUM | LARGE | ENTERPRISE' })
  size?: string;
  @ApiPropertyOptional() foundedYear?: number;
  @ApiPropertyOptional({ description: 'City and/or country, whichever is recorded.' })
  location?: string;
  @ApiPropertyOptional() glassdoorRating?: number;
  @ApiPropertyOptional() glassdoorReviews?: number;
}

export class JobResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() companyId: string;
  @ApiPropertyOptional({
    description:
      'Display name of the posting company. Enriched by JobService from the ' +
      'Company table; absent if the company row is missing.',
  })
  companyName?: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() status: string;
  @ApiProperty() remoteType: string;
  @ApiPropertyOptional() location?: string;
  @ApiPropertyOptional() salaryRange?: SalaryRangeResponseDto;
  @ApiProperty({ type: [String] }) skillIds: string[];
  @ApiProperty({ type: [String] }) responsibilities: string[];
  @ApiProperty({ type: [String] }) requirements: string[];
  @ApiProperty({ type: [String] }) benefits: string[];
  @ApiPropertyOptional({ type: Number, nullable: true }) bonusPct?: number | null;

  @ApiProperty({
    enum: ['INTERNAL', 'EXTERNAL'],
    description:
      'INTERNAL — apply inside JobFits. EXTERNAL — ingested from another site; the user ' +
      'must apply at `externalUrl`. Submitting an application to an EXTERNAL job is ' +
      'rejected server-side.',
  })
  sourceType: string;

  @ApiPropertyOptional({
    description: 'The original posting. Present for EXTERNAL jobs; where the user applies.',
  })
  externalUrl?: string;

  @ApiPropertyOptional({
    type: CompanyProfileDto,
    description:
      'Populated on the job DETAIL endpoint only (list responses carry companyName ' +
      'alone). Fields the database has no value for are omitted entirely.',
  })
  company?: CompanyProfileDto;

  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}
