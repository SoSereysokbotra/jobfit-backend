import { cosineSimilarity, scoreSkills } from './skills-scorer';
import {
  scoreExperience,
  deriveJobLevel,
  candidateLevel,
  SeniorityLevel,
} from './experience-scorer';
import { scoreLocation } from './location-scorer';
import { scoreSalary } from './salary-scorer';
import {
  compositeScore,
  computeTwoDimensionalMatch,
  DEALBREAKER_CEILING,
  PREFERENCE_NEUTRAL,
  roleFit,
  scoreEmploymentType,
  scoreJobLevel,
  scoreSalaryPreference,
  scoreWorkArrangement,
  twoDimensionalBand,
  weightedMatch,
} from './weighted-match.calculator';
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

// ─────────────────────────────────────────────────────────────────────────────
// Two-dimensional matching (Approach C).
//
// The first test is THE REPORTED BUG, written as an executable statement of it: a
// candidate who asked for remote-only work, an on-site job in a city they do not live in,
// and a résumé that matches the role almost perfectly. Under the old linear sum that job
// finished above 70 and was labelled a strong match, because skills and experience were
// 65% of the weight and nothing in the pipeline read the preference at all.
// ─────────────────────────────────────────────────────────────────────────────
describe('two-dimensional matching', () => {
  describe('scoreWorkArrangement', () => {
    it('remote-only candidate + on-site job -> 0 and a warning', () => {
      const w = scoreWorkArrangement(
        candidate({ desiredRemoteTypes: ['REMOTE'], place: at('Phnom Penh') }),
        job({ remoteType: 'ON_SITE', place: at('Singapore') }),
      );
      expect(w.score).toBe(0);
      expect(w.warning).toBe('Requires on-site / hybrid presence');
    });

    it('remote-only candidate + hybrid job -> 0: hybrid still requires presence', () => {
      expect(
        scoreWorkArrangement(
          candidate({ desiredRemoteTypes: ['REMOTE'] }),
          job({ remoteType: 'HYBRID', place: at('Singapore') }),
        ).score,
      ).toBe(0);
    });

    it('remote job -> 100 whoever the candidate is', () => {
      expect(
        scoreWorkArrangement(candidate({ desiredRemoteTypes: ['REMOTE'] }), job({ remoteType: 'REMOTE' })).score,
      ).toBe(100);
      expect(
        scoreWorkArrangement(candidate({ desiredRemoteTypes: ['ON_SITE'] }), job({ remoteType: 'REMOTE' })).score,
      ).toBe(100);
    });

    it('candidate open to on-site: same city 100, same country 50, abroad 0', () => {
      const open = (over = {}) =>
        candidate({ desiredRemoteTypes: ['ON_SITE', 'HYBRID'], place: at('Phnom Penh'), ...over });

      expect(
        scoreWorkArrangement(open(), job({ remoteType: 'ON_SITE', place: at('Phnom Penh') })).score,
      ).toBe(100);

      const otherCity = scoreWorkArrangement(
        open(),
        job({ remoteType: 'ON_SITE', place: at('Siem Reap') }),
      );
      expect(otherCity.score).toBe(50);
      expect(otherCity.warning).toContain('different city');

      const abroad = scoreWorkArrangement(
        open(),
        job({ remoteType: 'ON_SITE', place: at('Bangkok') }),
      );
      expect(abroad.score).toBe(0);
      expect(abroad.warning).toContain('relocation required');
    });

    it('unstated arrangement -> neutral 70 and NO warning', () => {
      // A gap in the posting is not a conflict. Warning here would invent one.
      const w = scoreWorkArrangement(candidate({ place: at('Phnom Penh') }), job({ remoteType: null }));
      expect(w.score).toBe(PREFERENCE_NEUTRAL.workArrangement);
      expect(w.warning).toBeUndefined();
    });

    it('unresolvable location on either side -> neutral 70, no warning', () => {
      expect(
        scoreWorkArrangement(
          candidate({ desiredRemoteTypes: ['ON_SITE'], place: null }),
          job({ remoteType: 'ON_SITE', place: at('Phnom Penh') }),
        ).score,
      ).toBe(PREFERENCE_NEUTRAL.workArrangement);
    });
  });

  describe('scoreEmploymentType', () => {
    it('no stated preference -> 100: nothing to violate', () => {
      expect(scoreEmploymentType(candidate(), job({ employmentType: 'FULL_TIME' })).score).toBe(100);
    });

    it('job matches one of the desired types -> 100', () => {
      expect(
        scoreEmploymentType(
          candidate({ desiredEmploymentTypes: ['FULL_TIME', 'CONTRACT'] }),
          job({ employmentType: 'CONTRACT' }),
        ).score,
      ).toBe(100);
    });

    it('job differs -> 0 and a readable warning', () => {
      const e = scoreEmploymentType(
        candidate({ desiredEmploymentTypes: ['CONTRACT'] }),
        job({ employmentType: 'FULL_TIME' }),
      );
      expect(e.score).toBe(0);
      // The enum value is turned into prose: the user reads the warning.
      expect(e.warning).toBe('Full-time role (differs from preferred)');
    });

    it('job states no type -> neutral 80, not a mismatch', () => {
      const e = scoreEmploymentType(
        candidate({ desiredEmploymentTypes: ['CONTRACT'] }),
        job({ employmentType: null }),
      );
      expect(e.score).toBe(PREFERENCE_NEUTRAL.employmentType);
      expect(e.warning).toBeUndefined();
    });
  });

  describe('scoreJobLevel', () => {
    it('no stated preference -> 100', () => {
      expect(scoreJobLevel(candidate(), job({ jobLevel: 'INTERN' })).score).toBe(100);
    });

    it('exact level -> 100', () => {
      expect(
        scoreJobLevel(candidate({ desiredJobLevels: ['SENIOR', 'LEAD'] }), job({ jobLevel: 'LEAD' })).score,
      ).toBe(100);
    });

    it('one rung away -> 60, and deliberately silent', () => {
      const l = scoreJobLevel(candidate({ desiredJobLevels: ['SENIOR'] }), job({ jobLevel: 'MID' }));
      expect(l.score).toBe(60);
      expect(l.warning).toBeUndefined();
    });

    it('distant level -> 20 with a warning', () => {
      const l = scoreJobLevel(candidate({ desiredJobLevels: ['LEAD'] }), job({ jobLevel: 'ENTRY' }));
      expect(l.score).toBe(20);
      expect(l.warning).toBe('Role level is Entry-level');
    });

    it('takes the BEST of several desired levels, not the average', () => {
      // ENTRY is three rungs from the posting; LEAD is exact. Saying yes to both means
      // this is an exact match, not a middling one.
      expect(
        scoreJobLevel(candidate({ desiredJobLevels: ['ENTRY', 'LEAD'] }), job({ jobLevel: 'LEAD' })).score,
      ).toBe(100);
    });

    it('job states no level -> neutral 80', () => {
      expect(
        scoreJobLevel(candidate({ desiredJobLevels: ['SENIOR'] }), job({ jobLevel: null })).score,
      ).toBe(PREFERENCE_NEUTRAL.jobLevel);
    });
  });

  describe('scoreSalaryPreference', () => {
    it('offer at or above the floor -> 100 and a highlight', () => {
      const s = scoreSalaryPreference({ minSalary: 1000 }, { minSalary: 900, maxSalary: 1200 });
      expect(s.score).toBe(100);
      expect(s.highlight).toBe('Salary matches target');
    });

    it('within 15% below the floor -> 60, "slightly below"', () => {
      const s = scoreSalaryPreference({ minSalary: 1000 }, { minSalary: 800, maxSalary: 900 });
      expect(s.score).toBe(60);
      expect(s.warning).toBe('Salary slightly below requested range');
    });

    it('well below the floor -> 0', () => {
      const s = scoreSalaryPreference({ minSalary: 1000 }, { minSalary: 400, maxSalary: 500 });
      expect(s.score).toBe(0);
      expect(s.warning).toBe('Salary below requested range');
    });

    it('NULL (excluded) when either side is silent — never a neutral number', () => {
      expect(scoreSalaryPreference({ minSalary: null }, { minSalary: 100, maxSalary: 200 }).score).toBeNull();
      expect(scoreSalaryPreference({ minSalary: 1000 }, { minSalary: null, maxSalary: null }).score).toBeNull();
    });

    it('a posting stating only a minimum is still a statement', () => {
      expect(scoreSalaryPreference({ minSalary: 1000 }, { minSalary: 1500, maxSalary: null }).score).toBe(100);
    });
  });

  describe('compositeScore (the gate)', () => {
    // The three worked examples from the specification, verbatim.
    it('R 95, P 100 -> 95: nothing to damp', () => {
      expect(compositeScore(95, 100)).toBe(95);
    });
    it('R 95, P 0 -> 29: capability alone cannot carry a job the candidate cannot take', () => {
      expect(compositeScore(95, 0)).toBe(29); // 95 × 0.30 = 28.5
    });
    it('R 95, P 60 -> 68', () => {
      expect(compositeScore(95, 60)).toBe(68); // 95 × (0.3 + 0.7×0.6) = 68.4
    });

    it('stays monotonic in both inputs — it has to remain a usable sort key', () => {
      expect(compositeScore(90, 50)).toBeGreaterThan(compositeScore(70, 50));
      expect(compositeScore(80, 90)).toBeGreaterThan(compositeScore(80, 40));
    });
  });

  describe('roleFit', () => {
    it('blends skills 60 / experience 40', () => {
      expect(roleFit(90, 50)).toBe(74); // 90×.6 + 50×.4 = 74
    });
    it('rescales skills to 100% when the posting states no seniority', () => {
      expect(roleFit(90, null)).toBe(90);
    });
  });

  describe('twoDimensionalBand', () => {
    it('70 / 50 are the cut points', () => {
      expect(twoDimensionalBand(70)).toBe('STRONG');
      expect(twoDimensionalBand(69)).toBe('POSSIBLE');
      expect(twoDimensionalBand(50)).toBe('POSSIBLE');
      expect(twoDimensionalBand(49)).toBe('WEAK');
    });
  });

  describe('computeTwoDimensionalMatch', () => {
    it('TEST CASE 1 — the reported bug: 95% skills, remote-only candidate, on-site job elsewhere', () => {
      const result = computeTwoDimensionalMatch({
        candidate: candidate({
          desiredRemoteTypes: ['REMOTE'],
          place: at('Phnom Penh'),
          desiredEmploymentTypes: ['FULL_TIME'],
        }),
        job: job({
          remoteType: 'ON_SITE',
          place: at('Singapore'),
          employmentType: 'FULL_TIME',
        }),
        skills: 95,
        experience: 95,
        title: 'Senior Backend Engineer',
      });

      // Capability is untouched — the candidate really can do this job, and pretending
      // otherwise would be the mirror image of the bug.
      expect(result.roleFitScore).toBe(95);
      // Capped by DEALBREAKER_CEILING: the candidate stated one preference and this job
      // breaks it, and the three components they never stated must not average that away.
      // Without the cap this is 56, and the whole bug survives at C = 66 / POSSIBLE.
      expect(result.preferenceFitScore).toBe(DEALBREAKER_CEILING);
      expect(result.preferenceFitScore).toBeLessThanOrEqual(30);
      // The demotion the old scorer could not express: this used to finish above 70.
      expect(result.overallScore).toBe(45); // 95 × (0.3 + 0.7×0.25)
      expect(result.overallScore).toBeLessThan(50);
      expect(result.band).toBe('WEAK');
      expect(result.flags.hasDealbreakerMismatch).toBe(true);
      expect(result.flags.warnings).toContain('Requires on-site / hybrid presence');
      // And the user is TOLD, in the same sentence that praises the skills.
      expect(result.explanation).toContain('Senior Backend Engineer:');
      expect(result.explanation).toContain('Strong skills match (95%)');
      expect(result.explanation).toContain('— Note: Requires on-site / hybrid presence.');
    });

    it('TEST CASE 2 — ideal match: skills and every preference line up', () => {
      const result = computeTwoDimensionalMatch({
        candidate: candidate({
          desiredRemoteTypes: ['REMOTE'],
          place: at('Phnom Penh'),
          desiredEmploymentTypes: ['FULL_TIME'],
          desiredJobLevels: ['SENIOR'],
          minSalary: 2000,
        }),
        job: job({
          remoteType: 'REMOTE',
          place: at('Phnom Penh'),
          employmentType: 'FULL_TIME',
          jobLevel: 'SENIOR',
          minSalary: 2500,
          maxSalary: 3500,
        }),
        skills: 92,
        experience: 100,
        title: 'Senior Backend Engineer',
      });

      expect(result.preferenceFitScore).toBe(100);
      expect(result.overallScore).toBeGreaterThanOrEqual(85);
      expect(result.band).toBe('STRONG');
      expect(result.flags.hasDealbreakerMismatch).toBe(false);
      expect(result.flags.warnings).toEqual([]);
      expect(result.flags.highlights).toContain('Salary matches target');
      // No warnings, so the sentence simply ends — no dangling "Note:".
      expect(result.explanation).not.toContain('Note:');
    });

    it('TEST CASE 3 — a posting that states almost nothing does not explode or throw', () => {
      const bare = () =>
        computeTwoDimensionalMatch({
          candidate: candidate({
            desiredRemoteTypes: ['REMOTE', 'HYBRID'],
            place: at('Phnom Penh'),
            desiredEmploymentTypes: ['FULL_TIME'],
            desiredJobLevels: ['SENIOR'],
            minSalary: 2000,
          }),
          // No arrangement, no place, no salary, no type, no level.
          job: job({ remoteType: null }),
          skills: 80,
          experience: null,
          title: 'Mystery Role',
        });

      expect(bare).not.toThrow();
      const result = bare();

      // Every unstated field scores its neutral, so P is the weighted average of
      // 70 / 80 / 80 with salary EXCLUDED and the remaining weights rescaled:
      //   (70×.35 + 80×.25 + 80×.20) / .80 = 76.25 -> 76
      expect(result.preferenceFitScore).toBe(76);
      // Missing data must not manufacture either a perfect score or a conflict.
      expect(result.preferenceFitScore).toBeLessThan(100);
      expect(result.flags.warnings).toEqual([]);
      expect(result.flags.hasDealbreakerMismatch).toBe(false);
      expect(result.roleFitScore).toBe(80); // experience null -> skills rescaled to 100%
      expect(result.overallScore).toBe(compositeScore(80, 76));
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it('a candidate who has stated nothing is not damped for it', () => {
      // An empty profile form is not a set of violated preferences. This is the guard on
      // the whole design: the gate must punish bad JOBS, not sparse users.
      const result = computeTwoDimensionalMatch({
        candidate: candidate(),
        job: job({ remoteType: 'REMOTE' }),
        skills: 90,
        experience: null,
      });
      expect(result.preferenceFitScore).toBe(100);
      expect(result.overallScore).toBe(90);
    });

    it('a weak skills score still leads the sentence, but is not called a highlight', () => {
      const result = computeTwoDimensionalMatch({
        candidate: candidate({ desiredRemoteTypes: ['REMOTE'] }),
        job: job({ remoteType: 'REMOTE' }),
        skills: 20,
        experience: null,
        title: 'Welder',
      });
      expect(result.explanation).toBe('Welder: Limited skills overlap (20%), Fully remote.');
      expect(result.flags.highlights).not.toContain('Limited skills overlap (20%)');
    });

    it('several conflicts are all reported, not just the first', () => {
      const result = computeTwoDimensionalMatch({
        candidate: candidate({
          desiredRemoteTypes: ['REMOTE'],
          desiredEmploymentTypes: ['CONTRACT'],
          desiredJobLevels: ['LEAD'],
          minSalary: 5000,
        }),
        job: job({
          remoteType: 'ON_SITE',
          employmentType: 'FULL_TIME',
          jobLevel: 'ENTRY',
          minSalary: 800,
          maxSalary: 1000,
        }),
        skills: 95,
        experience: 100,
        title: 'Junior Assistant',
      });

      expect(result.flags.warnings).toHaveLength(4);
      // 20×0.20 = 4, already far under the ceiling — the cap is a maximum, not a floor,
      // so ordering below it survives: one broken preference still beats four.
      expect(result.preferenceFitScore).toBe(4);
      expect(result.band).toBe('WEAK');
      expect(result.explanation).toContain('; '); // warnings joined, none dropped
    });
  });
});
