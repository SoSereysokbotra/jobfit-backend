// MENTOR_REVIEW_2026-08-18 §12. The band used to be two integers; the currency and the
// period were supplied by whoever rendered it, which meant "USD per year" on a corpus
// that is 83% Cambodian.

import { SalaryRange } from './salary-range.vo';

describe('SalaryRange', () => {
  it('defaults the currency to USD when none is given', () => {
    expect(SalaryRange.create(1000, 2000).value.currency).toBe('USD');
  });

  it('keeps a stated currency', () => {
    expect(SalaryRange.create(400, 800, 'KHR').value.currency).toBe('KHR');
  });

  it('normalises currency case so usd and USD are one currency', () => {
    expect(SalaryRange.create(1, 2, ' khr ').value.currency).toBe('KHR');
  });

  it('leaves the period UNDEFINED when it is not stated', () => {
    // The whole point: unknown must stay distinguishable from annual. A default here
    // would put the guess back, one layer below the one that was removed.
    expect(SalaryRange.create(1000, 2000).value.period).toBeUndefined();
  });

  it('carries a stated period', () => {
    expect(SalaryRange.create(400, 800, 'KHR', 'MONTHLY').value.period).toBe('MONTHLY');
  });

  it('does not scale or abbreviate the amounts', () => {
    // 140000 is one hundred and forty thousand. Nothing here turns it into 140.
    const band = SalaryRange.create(140000, 185000).value;
    expect(band.min).toBe(140000);
    expect(band.max).toBe(185000);
  });

  describe('isMeaningful', () => {
    it('is false for a 0–0 band', () => {
      // What a missing salary looked like after a null-to-zero mapper, rendered as
      // "$0K – $0K" on 348 of 367 jobs.
      expect(SalaryRange.create(0, 0).value.isMeaningful).toBe(false);
    });

    it('is true for a real band', () => {
      expect(SalaryRange.create(400, 800).value.isMeaningful).toBe(true);
    });

    it('is true for a single-point band', () => {
      // min === max is a real posting ("120,000"), not a missing value.
      expect(SalaryRange.create(120000, 120000).value.isMeaningful).toBe(true);
    });

    it('is true for a low Cambodian monthly figure', () => {
      // 300/month must not be mistaken for "no salary". Rounding this to thousands is
      // what collapsed it into 0 before.
      expect(SalaryRange.create(300, 500, 'USD', 'MONTHLY').value.isMeaningful).toBe(true);
    });
  });

  describe('validation', () => {
    it('rejects a negative minimum', () => {
      expect(SalaryRange.create(-1, 10).isFailure).toBe(true);
    });

    it('rejects a maximum below the minimum', () => {
      expect(SalaryRange.create(10, 5).isFailure).toBe(true);
    });
  });

  describe('toString', () => {
    it('names the period when it is known', () => {
      expect(SalaryRange.create(400, 800, 'KHR', 'MONTHLY').value.toString()).toContain(
        'MONTHLY',
      );
    });

    it('claims no period when it is unknown', () => {
      const text = SalaryRange.create(400, 800, 'KHR').value.toString();
      expect(text).not.toMatch(/ANNUAL|MONTHLY|HOURLY|DAILY|WEEKLY/);
    });
  });
});
