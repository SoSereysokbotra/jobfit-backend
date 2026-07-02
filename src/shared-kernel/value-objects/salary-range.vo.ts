import { ValueObject } from '@core/domain/value-object';
import { Result } from '@core/application/result';

interface SalaryRangeProps {
  min: number;
  max: number;
  currency: string;
}

export class SalaryRange extends ValueObject<SalaryRangeProps> {
  get min(): number { return this.props.min; }
  get max(): number { return this.props.max; }
  get currency(): string { return this.props.currency; }

  private constructor(props: SalaryRangeProps) {
    super(props);
  }

  public static create(min: number, max: number, currency = 'USD'): Result<SalaryRange> {
    if (min < 0) return Result.fail('Minimum salary cannot be negative');
    if (max < min) return Result.fail('Maximum salary must be >= minimum salary');
    return Result.ok(new SalaryRange({ min, max, currency }));
  }

  public toString(): string {
    return `${this.currency} ${this.min.toLocaleString()} – ${this.max.toLocaleString()}`;
  }
}
