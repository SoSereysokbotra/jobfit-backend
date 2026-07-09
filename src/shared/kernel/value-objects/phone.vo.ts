// src/shared/kernel/value-objects/phone.vo.ts
//
// NOTE: QUICK_REFERENCE.md does not define a PHONE_REGEX constant, so this validates the
// national number as 7–15 digits (E.164-compatible) after stripping spaces, dashes and
// parentheses. The country code defaults to '+1'.

import { ValueObject } from '@common/abstracts/value-object';

const PHONE_REGEX = /^[0-9]{7,15}$/;
const COUNTRY_CODE_REGEX = /^\+[0-9]{1,4}$/;

export class Phone extends ValueObject {
  readonly value: string;
  readonly countryCode: string;

  constructor(value: string, countryCode = '+1') {
    super();

    if (!value || value.trim().length === 0) {
      throw new Error('Phone number cannot be empty');
    }

    // Strip common separators before validating the national number.
    const digits = value.replace(/[\s\-().]/g, '');
    if (!PHONE_REGEX.test(digits)) {
      throw new Error('Phone number format is invalid');
    }

    const cc = (countryCode ?? '').trim();
    if (!COUNTRY_CODE_REGEX.test(cc)) {
      throw new Error('Country code format is invalid (expected e.g. "+1")');
    }

    this.value = digits;
    this.countryCode = cc;
  }

  static create(value: string, countryCode = '+1'): Phone {
    return new Phone(value, countryCode);
  }

  /** E.164-style full number, e.g. "+11234567890". */
  get fullNumber(): string {
    return `${this.countryCode}${this.value}`;
  }

  toString(): string {
    return this.fullNumber;
  }
}
