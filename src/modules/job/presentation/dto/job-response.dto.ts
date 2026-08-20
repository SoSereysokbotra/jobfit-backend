import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * A pay band the client can render without inventing anything.
 *
 * `min`/`max` are ABSOLUTE amounts as the posting stated them — 140000 is one hundred and
 * forty thousand. They are not "thousands", and a client must not append "K" to them.
 *
 * The frontend used to receive only the numbers, so it supplied the missing halves
 * itself: it assumed USD and assumed per-year, then abbreviated. On a corpus that is 83%
 * Cambodian that produced confident, wrong facts (MENTOR_REVIEW_2026-08-18 §12). Both
 * halves now travel with the number.
 */
export class SalaryRangeResponseDto {
  @ApiProperty({ description: 'Absolute amount, not thousands' }) min: number;
  @ApiProperty({ description: 'Absolute amount, not thousands' }) max: number;
  @ApiProperty({ example: 'USD' }) currency: string;

  /**
   * How often the amounts are paid, or ABSENT when the posting did not say.
   *
   * Absent means unknown and must render as unknown. It is deliberately not defaulted to
   * ANNUAL: 500 per month and 500 per year are the same integer, and guessing is the
   * defect this field exists to remove.
   */
  @ApiPropertyOptional({
    enum: ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'ANNUAL'],
    description: 'Absent when unknown — do not assume ANNUAL',
  })
  period?: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL';
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

  /**
   * What the posting is. ABSENT when the employer has not said — which is every job
   * created before these columns existed.
   *
   * Clients must render an absent value as nothing. The frontend previously hardcoded
   * "Full-time" and "Mid-level" in its mapper because the API had nothing to give it, so
   * every job card asserted both — including on a part-time teaching post. Same rule as
   * CompanyProfileDto: a fact we do not have must not look like a fact we do.
   */
  @ApiPropertyOptional({
    enum: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY', 'FREELANCE'],
  })
  employmentType?: string;

  @ApiPropertyOptional({
    enum: ['INTERN', 'ENTRY', 'MID', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR', 'C_LEVEL'],
  })
  experienceLevel?: string;

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
