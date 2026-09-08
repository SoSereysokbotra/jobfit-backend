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
 * The two-way honest summary behind `reason`.
 *
 * Structured as well as prose because a client should be able to render "⚠️ Requires
 * on-site presence" as its own element — a chip, a red line under the score — instead of
 * parsing it back out of a sentence. The prose exists for the places that can only show
 * one line.
 */
export class MatchFlagsDto {
  @ApiProperty({
    description:
      'True when the job violates a preference the candidate explicitly stated — ' +
      'remote-only vs an on-site role, a salary well under their floor. The score is ' +
      'already damped for it; this says a client may also SAY so.',
  })
  hasDealbreakerMismatch: boolean;

  @ApiProperty({
    type: [String],
    description:
      'Logistical conflicts, user-readable, e.g. "Located in Singapore (relocation ' +
      'required)". Empty when there are none.',
  })
  warnings: string[];

  @ApiProperty({
    type: [String],
    description: 'What genuinely fits, e.g. "Strong skills match (92%)".',
  })
  highlights: string[];
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
   * The overall match score: `roleFitScore` damped by `preferenceFitScore`.
   *
   * ⚠️ STILL FOR ORDERING RATHER THAN DISPLAY. The two-dimensional rewrite fixed the
   * inversion — a job violating every stated preference can no longer outrank one that
   * fits — but it did not calibrate the magnitude, which would need labelled data the
   * eval set does not have (2 candidates). The old linear score was measured at Spearman
   * ρ 0.662 against human grades with an observed range of only 41–69; this one moves
   * across the full range by construction, and how its numbers line up against human
   * judgement has NOT been measured. Show `band`, and show `flags.warnings` — those are
   * statements the pipeline can defend.
   */
  @ApiProperty({
    description:
      'Overall match score, 0-100. The gated composite of `roleFitScore` and ' +
      '`preferenceFitScore` — use it for ORDERING and prefer `band` for display.',
  })
  match: number;

  /**
   * What the score is allowed to claim: STRONG / POSSIBLE / WEAK.
   *
   * Read at 70/50 for a two-dimensional row and at the calibrated 57/51 for a row still
   * carrying the old linear score — the thresholds belong to the number, not to the
   * field, and the server picks the right pair (see the mapper). This is what a client
   * should put in front of a user.
   */
  @ApiProperty({
    enum: ['STRONG', 'POSSIBLE', 'WEAK'],
    description: 'Evidence-backed confidence band. Prefer this over `match` for display.',
  })
  band: MatchBand;
  /**
   * CAPABILITY only: skills (embedding cosine) blended with seniority. 0-100.
   *
   * Absent on rows scored before the two-dimensional rewrite, which is a real state a
   * client will see until that user's next recompute — not a nullable field nobody hits.
   */
  @ApiPropertyOptional({
    description:
      'Role / capability fit, 0-100 — how well the candidate can DO this job, ' +
      'independent of whether they want its logistics. Absent on rows not yet rescored.',
  })
  roleFitScore?: number;

  /**
   * LOGISTICS only: work arrangement and location, employment type, job level, salary,
   * each against what the candidate explicitly asked for. 0-100.
   *
   * This is the number that explains a demotion. A job with `roleFitScore` 95 and
   * `preferenceFitScore` 10 is one the candidate could do and cannot take, and showing
   * both is the difference between an honest ranking and a mysterious one.
   */
  @ApiPropertyOptional({
    description:
      'Preference / logistics fit, 0-100 — arrangement, location, employment type, ' +
      'level and salary against what the candidate asked for. Absent on rows not yet ' +
      'rescored.',
  })
  preferenceFitScore?: number;

  /**
   * Warnings and highlights behind `reason`.
   *
   * ABSENT, NOT EMPTY, on a row scored before preferences were evaluated: `warnings: []`
   * claims nothing conflicts, and a row that never ran the check has not earned that
   * claim.
   */
  @ApiPropertyOptional({
    type: MatchFlagsDto,
    description:
      'Structured highlights and warnings. Absent on rows not yet rescored — an empty ' +
      'warnings list means "checked, nothing conflicts", so it must not stand in for ' +
      '"never checked".',
  })
  flags?: MatchFlagsDto;

  @ApiPropertyOptional({
    description:
      'Human-readable "why this matched" — highlights AND conflicts, in the form ' +
      '"{title}: {highlights} — Note: {warnings}." It used to carry highlights only, ' +
      'so a job that violated every stated preference still read as unqualified praise.',
  })
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
