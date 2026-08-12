// Tests for the experience-requirement reading.
//
// The failure being fixed: the shared scorer counts CV ENTRIES, so a user with two of
// them got 80% "Experience" on a Chemical Engineer posting asking for 4+ years — the same
// 80% it gave every other job they opened. These pin both halves of the replacement: what
// the posting asks for, and how long the CV actually covers.

import {
  parseYearsRequired,
  scoreYearsAgainstRequirement,
  totalExperienceYears,
} from './experience-requirement';

describe('parseYearsRequired', () => {
  it('reads the bar out of a requirement sentence', () => {
    expect(
      parseYearsRequired([
        '4+ years of professional chemical engineering experience, with hands-on work in process design',
      ]),
    ).toBe(4);
  });

  it('handles the wordings postings actually use', () => {
    expect(parseYearsRequired(['Minimum 10 years of front-of-house operations'])).toBe(10);
    expect(parseYearsRequired(['At least 3 yrs experience with distillation'])).toBe(3);
    expect(
      parseYearsRequired(['Minimum 3+ years of recent experience within Fortune 500 companies']),
    ).toBe(3);
  });

  it('takes the highest bar when several are stated', () => {
    expect(
      parseYearsRequired([
        '2+ years of experience with process control',
        '4+ years of professional experience overall',
      ]),
    ).toBe(4);
  });

  it('ignores numbers that merely sit near the word "year"', () => {
    // Straight out of the NagaWorld posting's benefits list.
    expect(parseYearsRequired(['15 days of seniority payment per year as per Labor Law'])).toBeNull();
    expect(parseYearsRequired(['417% employee growth over 13 years of trading'])).toBeNull();
    expect(parseYearsRequired(['Annual bonus subject to performance'])).toBeNull();
  });

  it('returns null when the posting states no bar', () => {
    expect(
      parseYearsRequired([
        'You do not need a technical degree or previous experience in AI to succeed here',
      ]),
    ).toBeNull();
  });
});

describe('totalExperienceYears', () => {
  const NOW = new Date('2026-08-12T00:00:00Z');

  it('counts overlapping entries once', () => {
    // The real parse behind the reported bug: a one-month entry sitting inside a
    // three-year one. Summing them would report 3.1 years for 3 years of work.
    const years = totalExperienceYears(
      [
        { startDate: '2023-11', endDate: '2023-12' },
        { startDate: '2021-01', endDate: '2024-01' },
      ],
      NOW,
    );
    expect(years).toBe(3);
  });

  it('adds separate spells', () => {
    expect(
      totalExperienceYears(
        [
          { startDate: '2018-01', endDate: '2019-01' },
          { startDate: '2021-01', endDate: '2023-01' },
        ],
        NOW,
      ),
    ).toBe(3);
  });

  it('treats a missing or "Present" end date as still there', () => {
    expect(
      totalExperienceYears([{ startDate: '2024-08', endDate: 'Present' }], NOW),
    ).toBe(2);
    expect(totalExperienceYears([{ startDate: '2024-08' }], NOW)).toBe(2);
  });

  it('accepts bare years and full dates', () => {
    expect(totalExperienceYears([{ startDate: '2020', endDate: '2024' }], NOW)).toBe(4);
    expect(
      totalExperienceYears([{ startDate: '2020-01-15', endDate: '2022-01-15' }], NOW),
    ).toBe(2);
  });

  it('returns null — not zero — when nothing can be dated', () => {
    // "We can't read your dates" and "you have no experience" must not look the same.
    expect(totalExperienceYears([{ startDate: null, endDate: null }], NOW)).toBeNull();
    expect(totalExperienceYears([], NOW)).toBeNull();
  });
});

describe('scoreYearsAgainstRequirement', () => {
  it('scores the shortfall linearly', () => {
    expect(scoreYearsAgainstRequirement(3, 4)).toBe(75);
    expect(scoreYearsAgainstRequirement(1, 4)).toBe(25);
    expect(scoreYearsAgainstRequirement(0.5, 10)).toBe(5);
  });

  it('caps at meeting the bar — there is no credit for exceeding it', () => {
    expect(scoreYearsAgainstRequirement(4, 4)).toBe(100);
    expect(scoreYearsAgainstRequirement(20, 4)).toBe(100);
  });
});
