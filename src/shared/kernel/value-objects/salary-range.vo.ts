// src/shared/kernel/value-objects/salary-range.vo.ts

import { ValueObject } from '@common/abstracts/value-object';

export class SalaryRange extends ValueObject {
  readonly min: number;
  readonly max: number;
  readonly currency: string;

  constructor(min: number, max: number, currency = 'USD') {
    super();

    if (typeof min !== 'number' || Number.isNaN(min) || min < 0) {
      throw new Error('Minimum salary cannot be negative');
    }
    if (typeof max !== 'number' || Number.isNaN(max) || max < min) {
      throw new Error('Maximum salary must be greater than or equal to minimum salary');
    }
    if (!currency || currency.trim().length === 0) {
      throw new Error('Currency cannot be empty');
    }

    this.min = min;
    this.max = max;
    this.currency = currency.trim().toUpperCase();
  }

  static create(min: number, max: number, currency = 'USD'): SalaryRange {
    return new SalaryRange(min, max, currency);
  }

  /** True when the range represents a real, paid band (min > 0 and max > min). */
  get isValid(): boolean {
    return this.min > 0 && this.max > this.min;
  }

  toString(): string {
    return `${this.currency} ${this.min.toLocaleString()} – ${this.max.toLocaleString()}`;
  }

  toJSON() {
    return { min: this.min, max: this.max, currency: this.currency };
  }
}
