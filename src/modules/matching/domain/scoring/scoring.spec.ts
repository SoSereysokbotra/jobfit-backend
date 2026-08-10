import { cosineSimilarity, scoreSkills } from './skills-scorer';
import { scoreExperience } from './experience-scorer';
import { scoreLocation } from './location-scorer';
import { scoreSalary } from './salary-scorer';
import { scoreOther, weightedMatch } from './weighted-match.calculator';
import { CandidateContext, JobContext } from './types';

const candidate = (over: Partial<CandidateContext> = {}): CandidateContext => ({
  city: null,
  country: null,
  desiredRemoteTypes: [],
  minSalary: null,
  maxSalary: null,
  desiredIndustries: [],
  experienceCount: 0,
  ...over,
});

const job = (over: Partial<JobContext> = {}): JobContext => ({
  remoteType: 'ON_SITE',
  location: null,
  minSalary: null,
  maxSalary: null,
  industry: null,
  ...over,
});

describe('scoring', () => {
  describe('cosineSimilarity / scoreSkills', () => {
    it('identical vectors -> 1.0 -> 100', () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
      expect(scoreSkills(1)).toBe(100);
    });
    it('orthogonal -> 0', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });
    it('clamps out-of-range similarity to 0-100', () => {
      expect(scoreSkills(-0.5)).toBe(0);
      expect(scoreSkills(1.4)).toBe(100);
      expect(scoreSkills(0.64)).toBe(64);
    });
    it('mismatched lengths -> 0', () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    });
  });

  describe('scoreExperience', () => {
    it('scales with experience count', () => {
      expect(scoreExperience(candidate({ experienceCount: 0 }))).toBe(40);
      expect(scoreExperience(candidate({ experienceCount: 1 }))).toBe(65);
      expect(scoreExperience(candidate({ experienceCount: 2 }))).toBe(80);
      expect(scoreExperience(candidate({ experienceCount: 5 }))).toBe(90);
    });
  });

  describe('scoreLocation', () => {
    it('remote job suits everyone', () => {
      expect(scoreLocation(candidate(), job({ remoteType: 'REMOTE' }))).toBe(100);
    });
    it('city match on an on-site job -> 100', () => {
      expect(
        scoreLocation(
          candidate({ city: 'Phnom Penh' }),
          job({ location: 'Phnom Penh, Cambodia' }),
        ),
      ).toBe(100);
    });
    it('country match -> 80', () => {
      expect(
        scoreLocation(
          candidate({ country: 'Cambodia' }),
          job({ location: 'Siem Reap, Cambodia' }),
        ),
      ).toBe(80);
    });
    it('wants remote but job is on-site -> 40', () => {
      expect(
        scoreLocation(
          candidate({ city: 'X', desiredRemoteTypes: ['REMOTE'] }),
          job({ location: 'Y' }),
        ),
      ).toBe(40);
    });
  });

  describe('scoreSalary', () => {
    it('no preference or undisclosed -> neutral 50', () => {
      expect(scoreSalary(candidate(), job({ minSalary: 100, maxSalary: 200 }))).toBe(50);
      expect(scoreSalary(candidate({ minSalary: 100 }), job())).toBe(50);
    });
    it('overlapping bands -> 100', () => {
      expect(
        scoreSalary(
          candidate({ minSalary: 80, maxSalary: 120 }),
          job({ minSalary: 100, maxSalary: 150 }),
        ),
      ).toBe(100);
    });
    it('job below floor -> partial', () => {
      const s = scoreSalary(
        candidate({ minSalary: 100, maxSalary: 150 }),
        job({ minSalary: 40, maxSalary: 60 }),
      );
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(70);
    });
  });

  describe('scoreOther (industry)', () => {
    it('industry in desired set -> 100', () => {
      expect(
        scoreOther(candidate({ desiredIndustries: ['tech'] }), job({ industry: 'tech' })),
      ).toBe(100);
    });
    it('no preference or unknown industry -> 50', () => {
      expect(scoreOther(candidate(), job({ industry: 'tech' }))).toBe(50);
    });

    // The 100 branch was UNREACHABLE in production. `companies.industry` holds an
    // Industry id and `Profile.desiredIndustries` holds names, and the scorer compared
    // them directly — measured across the whole database, 0 of 35 companies had an
    // industry value appearing in any profile's desired list. Worse than useless: jobs
    // WITH industry data got the mismatch score (40) and jobs missing it got the neutral
    // 50, and in the labelled set the jobs with data are the good ones. Calibration
    // measured ρ = -0.667 against human grades, flipping to +0.518 once names met names.
    it('matches on the industry NAME, which is what callers must now pass', () => {
      expect(
        scoreOther(
          candidate({ desiredIndustries: ['Technology'] }),
          job({ industry: 'Technology' }),
        ),
      ).toBe(100);
    });

    it('does not match a raw Industry id against a name', () => {
      // The exact production shape before the fix. It must score as "unknown industry"
      // (50), never as a mismatch (40) — we do not know that it is not Technology.
      expect(
        scoreOther(
          candidate({ desiredIndustries: ['Technology'] }),
          job({ industry: '8449fe51-8c66-4c0f-ab46-9e4f4466c83a' }),
        ),
      ).toBe(40);
    });

    it('compares case-insensitively, because the two sides are authored separately', () => {
      expect(
        scoreOther(
          candidate({ desiredIndustries: ['technology'] }),
          job({ industry: 'Technology' }),
        ),
      ).toBe(100);
    });

    it('treats a blank preference entry as no preference', () => {
      expect(
        scoreOther(candidate({ desiredIndustries: ['  '] }), job({ industry: 'Technology' })),
      ).toBe(50);
    });
  });

  describe('weightedMatch', () => {
    it('applies 40/25/15/10/10 weights', () => {
      // 100*.4 + 80*.25 + 60*.15 + 40*.1 + 20*.1 = 40+20+9+4+2 = 75
      expect(
        weightedMatch({ skills: 100, experience: 80, location: 60, salary: 40, other: 20 }),
      ).toBe(75);
    });
    it('all 100 -> 100', () => {
      expect(
        weightedMatch({ skills: 100, experience: 100, location: 100, salary: 100, other: 100 }),
      ).toBe(100);
    });
  });
});
