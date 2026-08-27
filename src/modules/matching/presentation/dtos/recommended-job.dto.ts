import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MatchBand } from '../../domain/scoring/match-band';

class SalaryRangeDto {
  /** Absolute amount as the posting stated it — not thousands. */
  @ApiProperty() min: number;
  @ApiProperty() max: number;
  /** From the job, never assumed. See MENTOR_REVIEW_2026-08-18 §12. */
  @ApiProperty({ example: 'USD' }) currency: string;
  /** Absent when unknown — do not read as ANNUAL. */
  @ApiPropertyOptional({ enum: ['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'ANNUAL'] })
  period?: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ANNUAL';
}

/**
 * A recommended job. Mirrors the job feature's JobDto (so the frontend can reuse
 * its `toJobView` mapper) and adds the match score + explanation.
 */
export class RecommendedJobDto {
  @ApiProperty() id: string;
  @ApiProperty() companyId: string;
  @ApiPropertyOptional() companyName?: string;
  @ApiProperty() title: string;
  @ApiProperty() description: string;
  @ApiProperty() status: string;
  @ApiProperty() remoteType: string;
  @ApiPropertyOptional() location?: string;
  @ApiPropertyOptional({ type: SalaryRangeDto }) salaryRange?: SalaryRangeDto;
  @ApiProperty({ type: [String] }) skillIds: string[];
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;

  /**
   * The weighted match score.
   *
   * ⚠️ USE THIS FOR ORDERING, NOT FOR DISPLAY. Calibrated 2026-08-20 at Spearman ρ 0.662
   * against human grades — the ordering is real — but the scorer's OBSERVED range is
   * 41–69, not 0–100, and the grades overlap (a job graded BAD reached 56 while one
   * graded GREAT scored 51). Rendering it as "54%" tells a user something the evidence
   * does not support. Show `band` instead. See MENTOR_REVIEW_2026-08-18 §13 and
   * domain/scoring/match-band.ts.
   */
  @ApiProperty({
    description:
      'Weighted match score. For ORDERING only — observed range is 41–69, not 0–100. ' +
      'Render `band`, not this.',
  })
  match: number;

  /**
   * What the score is allowed to claim: STRONG / POSSIBLE / WEAK.
   *
   * Derived from the score at thresholds read off the calibration distribution, each one
   * the edge of a region where a human grade never appeared. This is what a client should
   * put in front of a user.
   */
  @ApiProperty({
    enum: ['STRONG', 'POSSIBLE', 'WEAK'],
    description: 'Evidence-backed confidence band. Prefer this over `match` for display.',
  })
  band: MatchBand;
  @ApiPropertyOptional({ description: 'Human-readable "why this matched".' })
  reason?: string;
  @ApiPropertyOptional({ description: 'Sub-scores: skills/experience/location/salary/other.' })
  breakdown?: Record<string, number>;

  @ApiProperty({
    description:
      'When this score was computed — NOT when the row was last written. It answers ' +
      '"which CV and profile is this number actually about?", so a client can say ' +
      '"matched against your CV from 3 August" instead of implying the number is live.',
  })
  computedAt: string;

  @ApiProperty({
    description:
      'True when an input to this score has changed (profile, preferences, résumé, ' +
      'default-résumé switch) and a recompute has not yet succeeded. The score is real ' +
      'but out of date. Clients MUST say so: serving stale matches is correct, ' +
      'presenting them as fresh is not.',
  })
  stale: boolean;
}
