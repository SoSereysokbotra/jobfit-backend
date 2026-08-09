// Skill gaps come from the jobs a user is actually chasing, grouped by application.
//
// Two things this pins, both found by using the page rather than reading it:
//
//  1. Gaps follow the JOB'S field. The page used to compare every user against the same ten
//     technology skills, so a mathematics teacher was told to learn Docker.
//  2. A PARTIAL match is not coverage. A CV listing "Effective Time Management" was reported
//     as covering "Classroom behaviour management" — both contain the word `management`. The
//     matcher had labelled that weak; this layer discarded the label.

import { LearningPathService } from './learning-path.service';
import type {
  RequirementMatch,
  SkillGapResult,
} from '@modules/matching/application/services/skill-gap.service';
import type {
  ApplicationGapsDto,
  SkillGapSummaryDto,
} from '../dtos/skill-gap-summary.dto';

const missing = (text: string): RequirementMatch => ({ text, matchedSkills: [] });
const exact = (text: string, ...skills: string[]): RequirementMatch => ({
  text, matchedSkills: skills, matchQuality: 'EXACT',
});
const partial = (text: string, ...skills: string[]): RequirementMatch => ({
  text, matchedSkills: skills, matchQuality: 'PARTIAL',
});

const ok = (
  requirements: RequirementMatch[],
  source: 'EMPLOYER' | 'AI_EXTRACTED' = 'EMPLOYER',
): SkillGapResult => ({
  status: 'OK',
  requirementsSource: source,
  requirements,
  missing: requirements.filter((r) => r.matchedSkills.length === 0).map((r) => r.text),
  matchedCount: requirements.filter((r) => r.matchedSkills.length > 0).length,
  skillsConsidered: ['whatever the CV had'],
});

const empty = (status: 'JOB_HAS_NO_REQUIREMENTS' | 'NO_PARSED_RESUME'): SkillGapResult => ({
  status,
  requirementsSource: status === 'NO_PARSED_RESUME' ? 'EMPLOYER' : 'NONE',
  requirements: [], missing: [], matchedCount: 0, skillsConsidered: [],
});

/** `jobs` is [title, analysis], in the order the applications come back. */
const setup = (jobs: [string, SkillGapResult][]) => {
  const prisma = {
    application: {
      findMany: jest.fn().mockResolvedValue(
        jobs.map(([title], i) => ({ id: `app-${i}`, jobId: `job-${i}`, job: { title } })),
      ),
    },
  };
  const analyse = jest.fn();
  jobs.forEach(([, result]) => analyse.mockResolvedValueOnce(result));
  const service = new LearningPathService(
    {} as never, {} as never, prisma as never, { analyse } as never,
  );
  return { service, analyse };
};

const groupFor = (summary: SkillGapSummaryDto, title: string): ApplicationGapsDto =>
  summary.applications.find((a) => a.jobTitle === title)!;

describe('LearningPathService.getSkillGaps', () => {
  describe('a weak match is not coverage', () => {
    it('reports a PARTIAL match as PARTIAL, never as MISSING', async () => {
      const { service } = setup([
        ['Primary School Mathematics Teacher', ok([
          partial('Classroom behaviour management', 'Effective Time Management'),
          missing('Curriculum planning and scheme of work design'),
        ])],
      ]);

      const summary = await service.getSkillGaps('u1');
      const gaps = summary.applications[0].gaps;

      const weak = gaps.find((g) => g.requirement === 'Classroom behaviour management');
      expect(weak?.coverage).toBe('PARTIAL');
      expect(weak?.matchedSkills).toEqual(['Effective Time Management']);
    });

    it('does NOT silently drop a PARTIAL match — this was the bug', async () => {
      // It used to be filtered out with the exact matches, so the page reported a
      // requirement as covered on the strength of one shared word.
      const { service } = setup([
        ['Teaching', ok([partial('Classroom behaviour management', 'Effective Time Management')])],
      ]);

      const summary = await service.getSkillGaps('u1');

      expect(summary.applications[0].gaps).toHaveLength(1);
    });

    it('keeps a genuinely EXACT match off the page', async () => {
      const { service } = setup([
        ['Dev', ok([
          exact('Clear written and verbal communication', 'Communication'),
          missing('Experience with Docker'),
        ])],
      ]);

      const summary = await service.getSkillGaps('u1');
      const gaps = summary.applications[0].gaps;

      expect(gaps.map((g) => g.requirement)).toEqual(['Experience with Docker']);
    });

    it('names no matched skills on a plain gap', async () => {
      const { service } = setup([['Dev', ok([missing('Experience with Docker')])]]);

      const summary = await service.getSkillGaps('u1');

      expect(summary.applications[0].gaps[0]).toMatchObject({
        coverage: 'MISSING', matchedSkills: [],
      });
    });

    it('sorts real gaps above doubts', async () => {
      const { service } = setup([
        ['Dev', ok([
          partial('Classroom behaviour management', 'Effective Time Management'),
          missing('Experience with Docker'),
        ])],
      ]);

      const summary = await service.getSkillGaps('u1');

      expect(summary.applications[0].gaps.map((g) => g.coverage)).toEqual(['MISSING', 'PARTIAL']);
    });
  });

  describe('grouped by application', () => {
    it('puts each requirement under the job that asked for it', async () => {
      const { service } = setup([
        ['Junior Full-Stack Developer', ok([missing('Experience building React applications')])],
        ['Primary School Mathematics Teacher', ok([missing('Curriculum planning')])],
      ]);

      const summary = await service.getSkillGaps('u1');

      expect(groupFor(summary, 'Junior Full-Stack Developer').gaps.map((g) => g.requirement))
        .toEqual(['Experience building React applications']);
      expect(groupFor(summary, 'Primary School Mathematics Teacher').gaps.map((g) => g.requirement))
        .toEqual(['Curriculum planning']);
    });

    it('gives a mathematics teacher no technology gaps at all', async () => {
      // The original bug, as a test.
      const { service } = setup([
        ['Primary School Mathematics Teacher', ok([
          missing('Experience teaching mathematics to primary students'),
          missing('Assessment design and marking to exam-board standards'),
        ])],
      ]);

      const summary = await service.getSkillGaps('u1');
      const text = JSON.stringify(summary).toLowerCase();

      for (const tech of ['docker', 'kubernetes', 'react', 'typescript', 'aws']) {
        expect(text).not.toContain(tech);
      }
    });

    it('counts requiredBy across ALL applications, not within one', async () => {
      // Grouping would otherwise hide the most useful thing on the page: what several
      // employers want.
      const { service } = setup([
        ['Dev', ok([missing('Familiarity with Git branching'), missing('Docker')])],
        ['Embedded', ok([missing('Familiarity with Git branching')])],
      ]);

      const summary = await service.getSkillGaps('u1');

      const inDev = groupFor(summary, 'Dev').gaps.find((g) => g.requirement.includes('Git'));
      const inEmbedded = groupFor(summary, 'Embedded').gaps.find((g) => g.requirement.includes('Git'));
      expect(inDev?.requiredBy).toBe(2);
      expect(inEmbedded?.requiredBy).toBe(2);
      expect(groupFor(summary, 'Dev').gaps.find((g) => g.requirement === 'Docker')?.requiredBy).toBe(1);
    });

    it('reports how many requirements the posting stated, so the UI can say "1 of 3"', async () => {
      const { service } = setup([
        ['Dev', ok([missing('A'), exact('B', 'Communication'), missing('C')])],
      ]);

      const summary = await service.getSkillGaps('u1');

      expect(summary.applications[0].requirementsTotal).toBe(3);
      expect(summary.applications[0].gaps).toHaveLength(2);
    });

    it('leads with the posting the user is furthest from', async () => {
      const { service } = setup([
        ['One gap', ok([missing('A')])],
        ['Three gaps', ok([missing('B'), missing('C'), missing('D')])],
      ]);

      const summary = await service.getSkillGaps('u1');

      expect(summary.applications.map((a) => a.jobTitle)).toEqual(['Three gaps', 'One gap']);
    });

    it('says whether the requirements are the employer\'s words or the model\'s', async () => {
      const { service } = setup([['Dev', ok([missing('A')], 'AI_EXTRACTED')]]);

      const summary = await service.getSkillGaps('u1');

      expect(summary.applications[0].source).toBe('AI_EXTRACTED');
    });
  });

  describe('the empty answers, which are not the same answer', () => {
    it('says so when the user has applied to nothing', async () => {
      const { service, analyse } = setup([]);

      const summary = await service.getSkillGaps('u1');

      expect(summary).toMatchObject({
        hasApplications: false, jobsConsidered: 0, applications: [],
      });
      expect(analyse).not.toHaveBeenCalled();
    });

    it('says so when no résumé has been parsed', async () => {
      // Without a CV there are no skills to compare against, so every requirement would look
      // like a gap. Reporting that as "here is what you are missing" would be a lie.
      const { service } = setup([
        ['A', empty('NO_PARSED_RESUME')], ['B', empty('NO_PARSED_RESUME')],
      ]);

      const summary = await service.getSkillGaps('u1');

      expect(summary).toMatchObject({
        hasApplications: true, hasParsedResume: false, applications: [],
      });
    });

    it('ignores postings that state no requirements', async () => {
      const { service } = setup([
        ['Has requirements', ok([missing('Assessment design')])],
        ['States none', empty('JOB_HAS_NO_REQUIREMENTS')],
      ]);

      const summary = await service.getSkillGaps('u1');

      expect(summary.jobsConsidered).toBe(1);
      expect(summary.applications).toHaveLength(1);
    });

    it('returns a group with no gaps when the CV covers everything', async () => {
      const { service } = setup([['A', ok([exact('Communication', 'Communication')])]]);

      const summary = await service.getSkillGaps('u1');

      expect(summary).toMatchObject({ hasApplications: true, hasParsedResume: true, jobsConsidered: 1 });
      expect(summary.applications[0].gaps).toEqual([]);
    });
  });
});
