// Skill gaps come from the jobs a user is actually chasing.
//
// The page used to compare every user against the same ten technology skills, so a
// mathematics teacher was told to learn Docker and Kubernetes — ten recommendations, ten of
// them irrelevant, and none of them derived from anything she had done. The gaps now come
// from the postings she applied to, which makes the answer field-agnostic by construction.

import { LearningPathService } from './learning-path.service';
import type { SkillGapResult } from '@modules/matching/application/services/skill-gap.service';

const ok = (missing: string[], source: 'EMPLOYER' | 'AI_EXTRACTED' = 'EMPLOYER'): SkillGapResult => ({
  status: 'OK',
  requirementsSource: source,
  requirements: [],
  missing,
  matchedCount: 0,
  skillsConsidered: ['whatever the CV had'],
});

const noRequirements: SkillGapResult = {
  status: 'JOB_HAS_NO_REQUIREMENTS',
  requirementsSource: 'NONE',
  requirements: [], missing: [], matchedCount: 0, skillsConsidered: [],
};

const noResume: SkillGapResult = {
  status: 'NO_PARSED_RESUME',
  requirementsSource: 'EMPLOYER',
  requirements: [], missing: [], matchedCount: 0, skillsConsidered: [],
};

/** `jobs` is [title, analysis] in the order the applications come back. */
const setup = (jobs: [string, SkillGapResult][]) => {
  const prisma = {
    application: {
      findMany: jest.fn().mockResolvedValue(
        jobs.map(([title], i) => ({ jobId: `job-${i}`, job: { title } })),
      ),
    },
  };
  const analyse = jest.fn();
  jobs.forEach(([, result]) => analyse.mockResolvedValueOnce(result));
  const service = new LearningPathService(
    {} as never, {} as never, prisma as never, { analyse } as never,
  );
  return { service, prisma, analyse };
};

describe('LearningPathService.getSkillGaps', () => {
  it('gives a mathematics teacher mathematics gaps, and no technology at all', async () => {
    // The reported bug, as a test. Nothing in this result may mention Docker, React or any
    // other member of the old hardcoded list.
    const { service } = setup([
      ['IGCSE Mathematics Teacher', ok(['IGCSE curriculum experience', 'Assessment design'])],
      ['Secondary Maths Teacher', ok(['IGCSE curriculum experience', 'Lesson planning'])],
    ]);

    const summary = await service.getSkillGaps('u1');

    expect(summary.gaps.map((g) => g.requirement)).toEqual([
      'IGCSE curriculum experience', // 2 jobs — first
      'Assessment design',
      'Lesson planning',
    ]);
    const text = JSON.stringify(summary).toLowerCase();
    for (const tech of ['docker', 'kubernetes', 'react', 'typescript', 'aws']) {
      expect(text).not.toContain(tech);
    }
  });

  it('counts how many applications ask for the same thing', async () => {
    const { service } = setup([
      ['A', ok(['MIG welding'])],
      ['B', ok(['MIG welding'])],
      ['C', ok(['MIG welding', 'AWS D1.1'])],
    ]);

    const summary = await service.getSkillGaps('u1');

    expect(summary.gaps[0]).toMatchObject({ requirement: 'MIG welding', requiredBy: 3 });
    expect(summary.gaps[1]).toMatchObject({ requirement: 'AWS D1.1', requiredBy: 1 });
    expect(summary.jobsConsidered).toBe(3);
  });

  it('names the jobs behind the number, so it can be checked', async () => {
    const { service } = setup([
      ['Maths Teacher, Kirirom', ok(['IGCSE'])],
      ['Maths Teacher, Phnom Penh', ok(['IGCSE'])],
    ]);

    const summary = await service.getSkillGaps('u1');

    expect(summary.gaps[0].jobTitles).toEqual([
      'Maths Teacher, Kirirom',
      'Maths Teacher, Phnom Penh',
    ]);
  });

  it('keeps the employer\'s own wording rather than normalising it', async () => {
    const { service } = setup([['A', ok(['IGCSE Curriculum Experience'])]]);

    const summary = await service.getSkillGaps('u1');

    expect(summary.gaps[0].requirement).toBe('IGCSE Curriculum Experience');
  });

  it('matches case-insensitively while displaying the first spelling seen', async () => {
    const { service } = setup([
      ['A', ok(['Lesson planning'])],
      ['B', ok(['lesson planning'])],
    ]);

    const summary = await service.getSkillGaps('u1');

    expect(summary.gaps).toHaveLength(1);
    expect(summary.gaps[0]).toMatchObject({ requirement: 'Lesson planning', requiredBy: 2 });
  });

  it('carries whether each requirement is the employer\'s words or the model\'s reading', async () => {
    const { service } = setup([['A', ok(['Curriculum planning'], 'AI_EXTRACTED')]]);

    const summary = await service.getSkillGaps('u1');

    expect(summary.gaps[0].source).toBe('AI_EXTRACTED');
  });

  describe('the empty answers, which are not the same answer', () => {
    it('says so when the user has applied to nothing', async () => {
      const { service, analyse } = setup([]);

      const summary = await service.getSkillGaps('u1');

      expect(summary).toMatchObject({ hasApplications: false, jobsConsidered: 0, gaps: [] });
      expect(analyse).not.toHaveBeenCalled();
    });

    it('says so when no résumé has been parsed', async () => {
      // Without a CV there are no skills to compare against, so every requirement would look
      // like a gap. Reporting that as "here is what you are missing" would be a lie.
      const { service } = setup([['A', noResume], ['B', noResume]]);

      const summary = await service.getSkillGaps('u1');

      expect(summary).toMatchObject({
        hasApplications: true, hasParsedResume: false, gaps: [],
      });
    });

    it('ignores postings that state no requirements', async () => {
      // A job we know nothing about is evidence of nothing; counting it would dilute
      // every "2 of 3".
      const { service } = setup([
        ['Has requirements', ok(['Assessment design'])],
        ['States none', noRequirements],
      ]);

      const summary = await service.getSkillGaps('u1');

      expect(summary.jobsConsidered).toBe(1);
      expect(summary.gaps[0].requiredBy).toBe(1);
    });

    it('returns no gaps when the CV covers everything asked for', async () => {
      const { service } = setup([['A', ok([])]]);

      const summary = await service.getSkillGaps('u1');

      // Distinguishable from the cases above by the flags: applications exist, a résumé
      // exists, a job contributed — and nothing is missing.
      expect(summary).toMatchObject({
        hasApplications: true, hasParsedResume: true, jobsConsidered: 1, gaps: [],
      });
    });
  });
});
