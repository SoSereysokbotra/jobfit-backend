// src/shared/kernel/value-objects/email.vo.ts
//
// NOTE: QUICK_REFERENCE.md does not define an EMAIL_REGEX constant, so this uses the
// same practical pattern already used elsewhere in the codebase.

import { ValueObject } from '@common/abstracts/value-object';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email extends ValueObject {
  readonly value: string;

  constructor(value: string) {
    super();

    if (!value || value.trim().length === 0) {
      throw new Error('Email cannot be empty');
    }

    const normalized = value.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalized)) {
      throw new Error('Email format is invalid');
    }

    this.value = normalized;
  }

  static create(value: string): Email {
    return new Email(value);
  }

  toString(): string {
    return this.value;
  }
}
