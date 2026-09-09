import { cosineSimilarity, scoreSkills } from './skills-scorer';
import {
  scoreExperience,
  deriveJobLevel,
  candidateLevel,
  SeniorityLevel,
} from './experience-scorer';
import { scoreLocation } from './location-scorer';
import { scoreSalary } from './salary-scorer';
import { weightedMatch } from './weighted-match.calculator';
import { CandidateContext, JobContext } from './types';
import { LocationIndex } from '../../../location/location-index';
import { LOCATION_FIXTURES } from '../../../location/location-fixtures';

// Real places, resolved the same way production resolves them. The scorer compares
// PLACES now, so a test that hand-built a place object would prove nothing about whether
// a user's typed city reaches the right row.
const places = new LocationIndex(LOCATION_FIXTURES);
const at = (text: string) => places.resolveText(text);

const candidate = (over: Partial<CandidateContext> = {}): CandidateContext => ({
  place: null,
  desiredRemoteTypes: [],
  minSalary: null,
  maxSalary: null,
  experienceCount: 0,
  ...over,
});

const job = (over: Partial<JobContext> = {}): JobContext => ({
  remoteType: 'ON_SITE',
  place: null,
  locationLabel: null,
  requiredLevel: null,
  minSalary: null,
  maxSalary: null,
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

  describe('deriveJobLevel', () => {
    it('prefers the structured column over the title', () => {
      // The field is something a person set; the title is an inference from prose.
      expect(deriveJobLevel({ experienceLevel: 'ENTRY', title: 'Senior Engineer' })).toBe(
        SeniorityLevel.Entry,
      );
    });

    it('reads seniority out of the title when the column is empty', () => {
      expect(deriveJobLevel({ title: 'Senior Accountant' })).toBe(SeniorityLevel.Senior);
      expect(deriveJobLevel({ title: 'Junior Full-Stack Developer' })).toBe(
        SeniorityLevel.Entry,
      );
      expect(deriveJobLevel({ title: 'Finance Manager' })).toBe(SeniorityLevel.Lead);
      expect(deriveJobLevel({ title: 'Marketing Intern' })).toBe(SeniorityLevel.Intern);
    });

    it('lets the most senior claim in a compound title win', () => {
      // Ingested titles concatenate roles; a posting listing several is at the top one.
      expect(
        deriveJobLevel({ title: 'Admin and Operations Manager, Head of School' }),
      ).toBe(SeniorityLevel.Lead);
      expect(
        deriveJobLevel({ title: 'Assistant to CEO, Finance and Accounting Manager' }),
      ).toBe(SeniorityLevel.Executive);
    });

    it('does not match seniority words inside other words', () => {
      // Unanchored /lead/ matches "Leadership", /sr/ matches "Personal Assistant".
      expect(deriveJobLevel({ title: 'Leadership Programme Coordinator' })).toBeNull();
      expect(deriveJobLevel({ title: 'Personal Assistant' })).toBeNull();
    });

    it('returns null when the posting says nothing — the common case', () => {
      // Two jobs in three on the live corpus. Null is "not measured", not "junior".
      expect(deriveJobLevel({ title: 'Accountant' })).toBeNull();
      expect(deriveJobLevel({ title: null, experienceLevel: null })).toBeNull();
    });
  });

  describe('scoreExperience', () => {
    // THE BUG THIS PINS. scoreExperience used to take only the candidate, so it returned
    // the same number for every job in a pool — measured as 1 distinct value across all
    // 50 of a user's rows, with 25% of the weight behind it. It could not reorder
    // anything while reporting itself as this job's "experience match".
    it('VARIES with the job, not just the candidate', () => {
      const mid = candidate({ experienceCount: 1 }); // -> Mid
      const scores = [
        scoreExperience(mid, job({ requiredLevel: SeniorityLevel.Mid })),
        scoreExperience(mid, job({ requiredLevel: SeniorityLevel.Entry })),
        scoreExperience(mid, job({ requiredLevel: SeniorityLevel.Executive })),
      ];
      expect(new Set(scores).size).toBeGreaterThan(1);
    });

    it('scores an exact level match highest', () => {
      expect(
        scoreExperience(
          candidate({ experienceCount: 1 }),
          job({ requiredLevel: SeniorityLevel.Mid }),
        ),
      ).toBe(100);
    });

    it('penalises being under-qualified harder than being over-qualified', () => {
      // A senior can take a mid role; a graduate cannot take a director role, and
      // showing it to them is the more damaging mistake.
      const senior = candidate({ experienceCount: 5 }); // -> Senior
      const graduate = candidate({ experienceCount: 0 }); // -> Entry
      const over = scoreExperience(senior, job({ requiredLevel: SeniorityLevel.Entry }));
      const under = scoreExperience(
        graduate,
        job({ requiredLevel: SeniorityLevel.Executive }),
      );
      expect(over).toBeGreaterThan(under!);
      expect(under).toBeLessThan(50);
    });

    it('is NULL when the posting states no seniority', () => {
      // Not a low score — no comparison happened. weightedMatch drops it and rescales.
      expect(scoreExperience(candidate({ experienceCount: 2 }), job())).toBeNull();
    });

    it('maps a role count to a level, capped at senior', () => {
      expect(candidateLevel(0)).toBe(SeniorityLevel.Entry);
      expect(candidateLevel(1)).toBe(SeniorityLevel.Mid);
      // Nothing in a role count distinguishes a lead from an executive.
      expect(candidateLevel(9)).toBe(SeniorityLevel.Senior);
    });
  });

  describe('scoreLocation', () => {
    it('remote job suits a candidate who has stated no preference', () => {
      expect(scoreLocation(candidate(), job({ remoteType: 'REMOTE' }))).toBe(100);
    });

    it('remote job suits a candidate who asked for remote', () => {
      expect(
        scoreLocation(
          candidate({ desiredRemoteTypes: ['REMOTE', 'HYBRID'] }),
          job({ remoteType: 'REMOTE' }),
        ),
      ).toBe(100);
    });

    it('does NOT hand a remote job a perfect location score to an on-site candidate', () => {
      // `desiredRemoteTypes` was collected from these users and read by nothing, so every
      // remote posting scored 100 for everybody — which is why "Remote (US)" ranked 4th
      // for a Phnom Penh profile and 4th for a San Francisco one, identically.
      const onSite = candidate({ desiredRemoteTypes: ['ON_SITE'] });
      // Nothing to compare geographically -> not measured, rather than an invented penalty.
      expect(scoreLocation(onSite, job({ remoteType: 'REMOTE' }))).toBeNull();
    });

    it('falls through to real geography for a remote job the candidate did not ask for', () => {
      const onSite = candidate({
        desiredRemoteTypes: ['ON_SITE'],
        place: at('Phnom Penh'),
      });
      // The posting says remote AND names a place: compare the places like any other job.
      expect(
        scoreLocation(onSite, { remoteType: 'REMOTE', place: at('Phnom Penh') }),
      ).toBe(100);
      expect(
        scoreLocation(onSite, { remoteType: 'REMOTE', place: at('Bangkok, Thailand') }),
      ).toBe(30);
    });

    it('same city -> 100', () => {
      expect(
        scoreLocation(
          candidate({ place: at('Phnom Penh') }),
          job({ place: at('Phnom Penh, Cambodia') }),
        ),
      ).toBe(100);
    });

    it('same city reached by different spellings still -> 100', () => {
      // The old scorer gave these different scores purely on spelling.
      expect(
        scoreLocation(candidate({ place: at('PNH') }), job({ place: at('Phnom Penh') })),
      ).toBe(100);
    });

    it('same country, same province -> 85', () => {
      // Dangkao is its own city row inside Phnom Penh province (KH.22) — a commutable
      // job, and a case the old flat 55 could not express at all.
      expect(
        scoreLocation(candidate({ place: at('Phnom Penh') }), job({ place: at('Dangkao') })),
      ).toBe(85);
    });

    it('same country, different province -> 70', () => {
      expect(
        scoreLocation(
          candidate({ place: at('Phnom Penh') }),
          job({ place: at('Siem Reap, Cambodia') }),
        ),
      ).toBe(70);
    });

    it('different country -> 30', () => {
      expect(
        scoreLocation(
          candidate({ place: at('Phnom Penh') }),
          job({ place: at('Bangkok, Thailand') }),
        ),
      ).toBe(30);
    });

    // THE DISCRIMINATION THIS REWRITE EXISTS FOR. Under the regex scorer a Siem Reap job
    // and a Bangkok job both scored 55 for a Phnom Penh candidate, so location could not
    // affect ranking at all.
    it('ranks a same-country job above a foreign one', () => {
      const me = candidate({ place: at('Phnom Penh') });
      const near = scoreLocation(me, job({ place: at('Siem Reap, Cambodia') }))!;
      const far = scoreLocation(me, job({ place: at('Bangkok, Thailand') }))!;
      expect(near).toBeGreaterThan(far);
    });

    // Two city-states both have admin1 === null. `null === null` would rank them as
    // sharing a province; 25 of the 34,129 imported places are like this.
    it('does not treat two unknown provinces as the same province', () => {
      const singapore = at('Singapore')!;
      expect(singapore.admin1Code).toBeNull();
      const elsewhere = { ...singapore, geonameId: -1, countryCode: 'SG' };
      expect(scoreLocation(candidate({ place: singapore }), job({ place: elsewhere }))).toBe(
        70,
      );
    });

    it('returns NULL when the candidate has no resolvable location', () => {
      expect(scoreLocation(candidate(), job({ place: at('Phnom Penh') }))).toBeNull();
    });

    it('returns NULL when the job has no resolvable location', () => {
      expect(scoreLocation(candidate({ place: at('Phnom Penh') }), job())).toBeNull();
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

  describe('weightedMatch', () => {
    // The industry sub-score was deleted (see weighted-match.calculator.ts). The four
    // remaining weights sum to 0.9, and blendMeasured normalises by the weights actually
    // present, so they still produce a 0-100 total.
    it('applies 40/25/15/10, normalised over the weights present', () => {
      // (100*.4 + 80*.25 + 60*.15 + 40*.1) / .9 = 73 / .9 = 81.1 -> 81
      expect(weightedMatch({ skills: 100, experience: 80, location: 60, salary: 40 })).toBe(81);
    });
    it('all 100 -> 100', () => {
      expect(
        weightedMatch({ skills: 100, experience: 100, location: 100, salary: 100 }),
      ).toBe(100);
    });
    it('an unmeasured location is dropped, not scored', () => {
      // Only skills/experience/salary remain: (100*.4 + 100*.25 + 100*.1) / .75 = 100
      expect(
        weightedMatch({ skills: 100, experience: 100, location: null, salary: 100 }),
      ).toBe(100);
    });
  });
});
