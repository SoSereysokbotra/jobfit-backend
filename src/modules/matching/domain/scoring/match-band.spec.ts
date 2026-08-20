// The thresholds are read off a real distribution, so the tests are too.
//
// Calibration run 2026-08-20 (scripts/eval-score-calibration.ts), 50 pairs, 1 candidate:
//
//   | grade | n  | scored range | mean |
//   | GREAT |  9 | 51–69        | 60.7 |
//   | OK    |  3 | 46–51        | 48.7 |
//   | BAD   | 38 | 41–56        | 46.1 |
//
// Each threshold is the edge of a region where one human grade never appeared. If those
// numbers are ever re-derived from a bigger label set, these tests are the record of what
// the old ones meant — and they should be rewritten, not patched.

import { matchBand, MATCH_BAND_LABEL } from './match-band';

describe('matchBand', () => {
  describe('STRONG — no job scoring here was ever graded BAD', () => {
    it('bands 57, the first score above BAD’s observed maximum of 56', () => {
      expect(matchBand(57)).toBe('STRONG');
    });

    it('bands the best score we have ever produced', () => {
      expect(matchBand(69)).toBe('STRONG');
    });

    it('does NOT band 56 as strong — a job graded BAD reached exactly 56', () => {
      expect(matchBand(56)).not.toBe('STRONG');
    });
  });

  describe('POSSIBLE — the overlap zone, where the scorer genuinely cannot separate', () => {
    it('bands 51, the lowest score a GREAT job received', () => {
      expect(matchBand(51)).toBe('POSSIBLE');
    });

    it('bands 56, the highest score a BAD job received', () => {
      // 51–56 contains both GREAT and BAD. Claiming either would be a coin flip
      // dressed as a measurement.
      expect(matchBand(56)).toBe('POSSIBLE');
    });
  });

  describe('WEAK — no job scoring here was ever graded GREAT', () => {
    it('bands 50, just below GREAT’s observed minimum of 51', () => {
      expect(matchBand(50)).toBe('WEAK');
    });

    it('bands the worst score we have ever produced', () => {
      expect(matchBand(41)).toBe('WEAK');
    });
  });

  describe('inputs the scorer should never produce', () => {
    it('does not throw on scores outside the observed range', () => {
      // The scorer is *labelled* 0–100 even though it emits 41–69. If a future change
      // widens the range, banding must keep working rather than fall through a gap.
      expect(matchBand(0)).toBe('WEAK');
      expect(matchBand(100)).toBe('STRONG');
    });

    it('treats every non-finite score as WEAK, never as a match', () => {
      // Failing towards "we cannot vouch for this" is the only safe direction. Infinity
      // is not a very good match — it is a broken computation, and rendering it as
      // STRONG would be a fabricated recommendation.
      expect(matchBand(Number.NaN)).toBe('WEAK');
      expect(matchBand(Number.POSITIVE_INFINITY)).toBe('WEAK');
      expect(matchBand(Number.NEGATIVE_INFINITY)).toBe('WEAK');
    });
  });

  it('is monotonic — a higher score never bands worse', () => {
    const rank = { WEAK: 0, POSSIBLE: 1, STRONG: 2 } as const;
    for (let score = 0; score < 100; score++) {
      expect(rank[matchBand(score + 1)]).toBeGreaterThanOrEqual(rank[matchBand(score)]);
    }
  });

  it('has a user-facing label for every band', () => {
    // A band with no label would render as a raw enum name to a user.
    for (const band of ['STRONG', 'POSSIBLE', 'WEAK'] as const) {
      expect(MATCH_BAND_LABEL[band]).toBeTruthy();
      expect(MATCH_BAND_LABEL[band]).not.toContain('%');
    }
  });

  it('never expresses a band as a percentage', () => {
    // The whole point of §13: the magnitude is not evidenced, so no label may imply it.
    const labels = Object.values(MATCH_BAND_LABEL).join(' ');
    expect(labels).not.toMatch(/\d/);
  });
});
