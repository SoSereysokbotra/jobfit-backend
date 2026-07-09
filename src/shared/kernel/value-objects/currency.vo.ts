// src/shared/kernel/value-objects/currency.vo.ts
//
// Currency as a value object with a small set of supported currencies exposed as static
// instances (USD, EUR, GBP, KHR).

import { ValueObject } from '@common/abstracts/value-object';

export class Currency extends ValueObject {
  readonly code: string;
  readonly symbol: string;

  constructor(code: string, symbol: string) {
    super();

    if (!code || code.trim().length === 0) {
      throw new Error('Currency code cannot be empty');
    }
    if (!symbol || symbol.trim().length === 0) {
      throw new Error('Currency symbol cannot be empty');
    }

    this.code = code.trim().toUpperCase();
    this.symbol = symbol.trim();
  }

  // Supported currencies.
  static readonly USD = new Currency('USD', '$');
  static readonly EUR = new Currency('EUR', '€');
  static readonly GBP = new Currency('GBP', '£');
  static readonly KHR = new Currency('KHR', '៛');

  private static readonly ALL: readonly Currency[] = [
    Currency.USD,
    Currency.EUR,
    Currency.GBP,
    Currency.KHR,
  ];

  /** Look up a supported currency by ISO code (case-insensitive). */
  static fromCode(code: string): Currency {
    const match = Currency.ALL.find(
      (c) => c.code === (code ?? '').trim().toUpperCase(),
    );
    if (!match) {
      throw new Error(`Unsupported currency code: ${code}`);
    }
    return match;
  }

  toString(): string {
    return this.code;
  }
}
