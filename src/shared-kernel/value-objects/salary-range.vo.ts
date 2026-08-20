import { ValueObject } from '@core/domain/value-object';
import { Result } from '@core/application/result';

/**
 * How often the figure is paid.
 *
 * `undefined` means UNKNOWN and must stay distinguishable from a real value: a client
 * that cannot tell "annual" from "we never recorded it" ends up asserting one
 * (MENTOR_REVIEW_2026-08-18 §12, where every posting rendered as USD-per-year with a "K"
 * suffix because the API gave the client nothing better to go on).
 */
export type SalaryPeriodValue =
  | 'HOURLY'
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'ANNUAL';

interface SalaryRangeProps {
  min: number;
  max: number;
  currency: string;
  period?: SalaryPeriodValue;
}

/**
 * A pay band: two amounts, the currency they are counted in, and how often they are paid.
 *
 * THE AMOUNTS ARE ABSOLUTE AND IN THE MINOR-UNIT-FREE FORM THE POSTING USED — 140000
 * means one hundred and forty thousand, not 140. Nothing here scales, abbreviates or
 * assumes "thousands"; a presentation layer that wants "140K" derives it from the real
 * number, and one that cannot must show the real number rather than guess a magnitude.
 */
export class SalaryRange extends ValueObject<SalaryRangeProps> {
  get min(): number { return this.props.min; }
  get max(): number { return this.props.max; }
  get currency(): string { return this.props.currency; }
  get period(): SalaryPeriodValue | undefined { return this.props.period; }

  private constructor(props: SalaryRangeProps) {
    super(props);
  }

  public static create(
    min: number,
    max: number,
    currency = 'USD',
    period?: SalaryPeriodValue,
  ): Result<SalaryRange> {
    if (min < 0) return Result.fail('Minimum salary cannot be negative');
    if (max < min) return Result.fail('Maximum salary must be >= minimum salary');
    return Result.ok(
      new SalaryRange({
        min,
        max,
        // Normalised so 'usd' and 'USD' cannot become two different currencies in the
        // same corpus. Profile.salaryCurrency has always been stored upper-case.
        currency: currency.trim().toUpperCase(),
        period,
      }),
    );
  }

  /**
   * A band worth showing a user.
   *
   * `0 – 0` is what a missing salary used to look like once it had been through a
   * null-to-zero mapper, and it was rendered as "$0K – $0K" on 348 of 367 jobs. Zero pay
   * is not a band, so it is not valid, and callers can use this instead of re-deriving
   * the rule.
   */
  get isMeaningful(): boolean {
    return this.max > 0;
  }

  public toString(): string {
    const amounts = `${this.currency} ${this.min.toLocaleString()} – ${this.max.toLocaleString()}`;
    return this.period ? `${amounts} (${this.period})` : amounts;
  }
}
