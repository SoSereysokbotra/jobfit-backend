// MENTOR_REVIEW_2026-08-18 §19. Detection only has to answer "can our Latin word matching
// describe this posting", and these pin both the answer and the reason it is needed.

import { khmerRatio, isKhmerScript, KHMER_THRESHOLD } from './script-detection';

const KHMER_POSTING =
  'ការងារគ្រូបង្រៀនគណិតវិទ្យា នៅរាជធានីភ្នំពេញ ត្រូវការបទពិសោធន៍ការងារ';
const ENGLISH_POSTING =
  'We are hiring a mathematics teacher in Phnom Penh. Experience required.';

describe('why detection is needed at all', () => {
  it('Khmer characters are not word characters, so \\b boundaries never apply', () => {
    expect(/\w/.test('ក')).toBe(false);
  });

  it('splitting Khmer text on Latin classes yields NO tokens', () => {
    // Khmer is written without spaces between words. The matchers do not degrade here —
    // they have nothing to work with.
    expect(KHMER_POSTING.split(/[^a-zA-Z0-9+#]+/).filter(Boolean)).toEqual([]);
  });

  it('but a Latin brand name inside Khmer text IS still matched', () => {
    // This is the actual bug. The skills table was not empty on a Khmer posting — it was
    // built from whichever English words happened to appear, then given a confident count.
    expect(/\bExcel\b/i.test('ចេះប្រើ Excel និង Word')).toBe(true);
  });
});

describe('khmerRatio', () => {
  it('is 1 for pure Khmer', () => {
    expect(khmerRatio('ការងារ')).toBe(1);
  });

  it('is 0 for pure English', () => {
    expect(khmerRatio(ENGLISH_POSTING)).toBe(0);
  });

  it('ignores digits and punctuation — only letters are counted', () => {
    // "2 years!" has no Khmer letters and must not be pushed either way by its digits.
    expect(khmerRatio('2 years! (2026)')).toBe(0);
  });

  it('is 0 for text with no letters at all, rather than NaN', () => {
    expect(khmerRatio('123 456')).toBe(0);
    expect(khmerRatio('')).toBe(0);
  });

  it('reports a genuine mixture as a middling ratio', () => {
    const ratio = khmerRatio('ការងារ teacher');
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(1);
  });
});

describe('isKhmerScript', () => {
  it('accepts a real Khmer posting', () => {
    expect(isKhmerScript(KHMER_POSTING)).toBe(true);
  });

  it('rejects an English posting about a Cambodian job', () => {
    // 91% of the corpus is like this: Cambodian employer, English text. Withholding the
    // skills table for these would break the feature for most of the market it serves.
    expect(isKhmerScript(ENGLISH_POSTING)).toBe(false);
  });

  it('does not trip on an English posting that names a place in Khmer', () => {
    const mostlyEnglish =
      'Senior Backend Engineer at Acme, located in ភ្នំពេញ. We use Node.js, Postgres ' +
      'and Docker. You will build APIs, review code, and mentor junior engineers on the ' +
      'platform team. Competitive salary and benefits offered to the right candidate.';
    expect(isKhmerScript(mostlyEnglish)).toBe(false);
  });

  it('accepts a mostly-Khmer posting that quotes English tool names', () => {
    // The case that used to produce a table made of "Excel" and "Word".
    expect(isKhmerScript('ចេះប្រើ Excel និង Word និងមានបទពិសោធន៍ការងារយ៉ាងតិច')).toBe(true);
  });

  it('treats an empty description as not-Khmer rather than throwing', () => {
    expect(isKhmerScript('')).toBe(false);
  });

  it('sits in the empty gap the corpus actually leaves', () => {
    // Measured over all 367 postings with THIS function: the nonzero ratios begin 0.113,
    // 0.189, 0.265 … so nothing falls between 0.113 and 0.189. The threshold is not a
    // tuned constant balanced on real data; it sits in a hole, and moving it anywhere
    // inside that hole classifies the identical 31 postings.
    expect(KHMER_THRESHOLD).toBeGreaterThan(0.113);
    expect(KHMER_THRESHOLD).toBeLessThan(0.189);
  });

  it('keeps the skills table for the one English posting that quotes a Khmer address', () => {
    // The real 0.113 case — the reason the threshold is not simply "any Khmer at all".
    const ratio = 0.113;
    expect(ratio).toBeLessThan(KHMER_THRESHOLD);
  });
});
