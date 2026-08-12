// Tests for MatchReportService.
//
// This service computes nothing — it composes. So what is worth pinning is not a score
// but the DEGRADATION: a user with no profile, a user with no parsed résumé and an AI
// service that is down must each still produce a report, with the missing part named
// rather than faked. The tempting failure is the opposite of a wrong number: a 500, or a
// report whose empty skills table reads as "this job asks for nothing".

import { MatchReportService } from './match-report.service';

const JOB = {
  externalId: '123',
  source: 'linkedin',
  title: 'Frontend Engineer',
  company: 'Acme',
  location: 'Phnom Penh',
  jobDescription:
    'We are looking for a Frontend Engineer. You will build React applications with ' +
    'TypeScript. React experience is required. Strong communication skills and the ' +
    'ability to collaborate with a cross-functional team are essential.',
};

const PARSED = {
  fullName: 'A Candidate',
  email: 'a@example.com',
  phone: '+855 12 345 678',
  location: 'Phnom Penh',
  summary: 'Frontend engineer.',
  experiences: JSON.stringify([{ title: 'Frontend Engineer', company: 'X' }]),
  educations: JSON.stringify([{ fieldOfStudy: 'Computer Science' }]),
  skills: JSON.stringify(['React', 'TypeScript']),
  rawText:
    'Frontend Engineer. Built React applications in TypeScript. Collaborated with a ' +
    'cross-functional team. '.repeat(30),
};

/**
 * All dependencies stubbed; each `over` key is the thing a given test breaks. Every stub
 * returns the SHAPE the real collaborator returns — a stub that returns a convenient
 * shape instead tests nothing about the wiring.
 */
function build(over: Record<string, unknown> = {}) {
  const created: Record<string, unknown>[] = [];
  const reports: any = {
    create: jest.fn(async (input: Record<string, unknown>) => {
      created.push(input);
      return 'report-1';
    }),
  };
  const resumes: any = {
    findDefaultByUserId: jest.fn().mockResolvedValue(
      'resume' in over
        ? over.resume
        : { id: 'r1', fileName: 'cv.pdf', parsingStatus: 'SUCCESS' },
    ),
    findByUserId: jest.fn().mockResolvedValue([]),
  };
  const parsedResumes: any = {
    findByResumeId: jest
      .fn()
      .mockResolvedValue('parsed' in over ? over.parsed : PARSED),
  };
  const scorer: any = {
    scoreResume: jest.fn().mockResolvedValue({
      atsScore: 62,
      qualityScore: 55,
      breakdown: { formatting: 70, keywords: 55 },
      suggestions: ['Add measurable results'],
      scoredBy: 'heuristic',
    }),
  };
  const matchExternalJob: any = {
    execute: jest.fn().mockResolvedValue(
      'match' in over
        ? over.match
        : {
            score: 74,
            breakdown: { skills: 70, experience: 90, location: 80, salary: 50, other: 50 },
            semantic: true,
            companyData: false,
          },
    ),
  };
  const ai: any = {
    extractJobRequirements: jest.fn(async () => {
      if (over.aiDown) throw new Error('AI service unavailable');
      return {
        requirements:
          (over.requirements as string[]) ?? [
            'Experience with React',
            'Experience with TypeScript',
            'Experience with Kubernetes',
          ],
        groundedness: 0.9,
        droppedUngrounded: 0,
        promptVersion: 'v1',
      };
    }),
  };

  const service = new MatchReportService(
    reports,
    resumes,
    parsedResumes,
    scorer,
    matchExternalJob,
    ai,
  );
  return { service, created, reports, scorer, matchExternalJob };
}

/** The payload as it was persisted — what GET /match-report/:id will hand back. */
async function generate(over: Record<string, unknown> = {}) {
  const { service, created } = build(over);
  const job = 'title' in over ? { ...JOB, title: over.title as string } : JOB;
  const id = await service.generate('u1', job);
  expect(id).toBe('report-1');
  return created[0].payload as any;
}

describe('MatchReportService', () => {
  it('composes every section for a user with a parsed résumé', async () => {
    const payload = await generate();

    expect(payload.job).toMatchObject({ externalId: '123', title: 'Frontend Engineer' });
    expect(payload.matchRate).toMatchObject({ overall: 74, semantic: true });
    expect(payload.searchability.atsScore).toBe(62);
    expect(payload.recruiterTips).toEqual({
      qualityScore: 55,
      suggestions: ['Add measurable results'],
    });
    expect(payload.resume).toEqual({ id: 'r1', fileName: 'cv.pdf', summaryPresent: true });
    expect(payload.needsResume).toBe(false);
  });

  it('splits extracted requirements into matched and missing', async () => {
    const payload = await generate();

    const hard = payload.skills.hard as { skill: string; inResume: boolean }[];
    expect(hard.find((h) => h.skill === 'Experience with React')?.inResume).toBe(true);
    expect(hard.find((h) => h.skill === 'Experience with Kubernetes')?.inResume).toBe(false);
    // Counts span both tables — the user acts on one list, not two.
    expect(payload.skills.matchedCount + payload.skills.missingCount).toBe(
      payload.skills.hard.length + payload.skills.soft.length,
    );
  });

  it('counts how prominently a requirement appears rather than printing 1 everywhere', async () => {
    const payload = await generate();
    const react = payload.skills.hard.find((h: any) => h.skill === 'Experience with React');
    // "React" is said twice in the description; the requirement phrase itself, once.
    expect(react.count).toBe(2);
  });

  it('reads soft skills the extractor is told to skip', async () => {
    const payload = await generate();
    const labels = payload.skills.soft.map((s: any) => s.skill);
    expect(labels).toContain('Communication');
    expect(labels).toContain('Teamwork');
    // The CV says "cross-functional team" but never communicates about communication.
    expect(payload.skills.soft.find((s: any) => s.skill === 'Teamwork').inResume).toBe(true);
  });

  it('normalises a decorated LinkedIn title before judging the résumé against it', async () => {
    // Nobody writes "[Open for Expat]" on a CV; scoring against the recruiter's
    // decoration turned a sound word-level check into noise.
    const payload = await generate({
      parsed: { ...PARSED, rawText: 'Frontend Engineer. React. TypeScript.' },
      title: 'Frontend Engineer [Urgent Hiring] - Remote',
    });

    const check = payload.searchability.checks.find(
      (c: any) => c.label === 'Job title present in résumé',
    );
    expect(check.status).toBe('pass');
  });

  it('quotes the core title, not the posting headline, in the hint', async () => {
    const payload = await generate({
      parsed: { ...PARSED, rawText: 'Baker. Made bread for eight years.' },
      title: 'Powerpoint Specialist - Remote',
    });

    const check = payload.searchability.checks.find(
      (c: any) => c.label === 'Job title present in résumé',
    );
    expect(check.status).toBe('fail');
    expect(check.hint).toContain('Powerpoint Specialist');
    expect(check.hint).not.toContain('Remote');
  });

  it('replaces the count-of-entries experience score with the stated years bar', async () => {
    // The reported bug: two CV entries scored 80% "Experience" on a posting asking for
    // 4+ years — the same 80% every other job got, because nothing looked at the job.
    const payload = await generate({
      requirements: ['4+ years of professional chemical engineering experience'],
      parsed: {
        ...PARSED,
        experiences: JSON.stringify([
          { startDate: '2023-11', endDate: '2023-12' },
          { startDate: '2021-01', endDate: '2024-01' },
        ]),
      },
    });

    expect(payload.matchRate.experience).toMatchObject({
      basis: 'REQUIREMENT',
      requiredYears: 4,
      met: false,
    });
    expect(payload.matchRate.subScores.experience).toBeLessThan(80);
  });

  it('re-blends the total so the rows still add up to the headline', async () => {
    const payload = await generate({
      requirements: ['10+ years of professional experience'],
      parsed: {
        ...PARSED,
        experiences: JSON.stringify([{ startDate: '2023-01', endDate: '2024-01' }]),
      },
    });

    // Field-forward blend: skills 75% + location 15% + experience 10%.
    const s = payload.matchRate.subScores;
    expect(payload.matchRate.overall).toBe(
      Math.round(s.skills * 0.75 + s.location * 0.15 + s.experience * 0.1),
    );
  });

  it('labels the fallback as CV depth when the posting states no bar', async () => {
    const payload = await generate({ requirements: ['Experience with React'] });

    expect(payload.matchRate.experience).toMatchObject({
      basis: 'CV_DEPTH',
      requiredYears: null,
      met: null,
    });
    // Untouched — it is the scorer's own value, just honestly labelled.
    expect(payload.matchRate.subScores.experience).toBe(90);
  });

  it('soft-fails the skills table when the AI service is down', async () => {
    const payload = await generate({ aiDown: true });

    // available:false, NOT an empty table — "we could not look" and "this posting asks
    // for nothing" are different answers and the page says which one it is.
    expect(payload.skills.available).toBe(false);
    expect(payload.skills.hard).toEqual([]);
    expect(payload.matchRate.overall).toBe(74); // everything else still renders
  });

  it('reports an empty requirement list as available', async () => {
    const payload = await generate({ requirements: [] });
    expect(payload.skills.available).toBe(true);
    expect(payload.skills.hard).toEqual([]);
  });

  it('still produces a report when the user has no résumé', async () => {
    const payload = await generate({ resume: null, parsed: null });

    expect(payload.needsResume).toBe(true);
    expect(payload.resume).toBeNull();
    expect(payload.searchability).toBeNull();
    expect(payload.recruiterTips).toBeNull();
    // The job's requirements are still worth showing — all of them unmatched.
    expect(payload.skills.available).toBe(true);
    expect(payload.skills.hard.every((h: any) => h.inResume === false)).toBe(true);
  });

  it('still produces a report when the user has no profile to match against', async () => {
    const payload = await generate({ match: null });

    expect(payload.matchRate).toBeNull();
    expect(payload.searchability.atsScore).toBe(62);
  });

  it('flags a résumé that never says the job title', async () => {
    const payload = await generate({
      parsed: { ...PARSED, rawText: 'Baker. Made bread for eight years.' },
    });

    const check = payload.searchability.checks.find(
      (c: any) => c.label === 'Job title present in résumé',
    );
    expect(check.status).toBe('fail');
    expect(check.hint).toContain('Frontend Engineer');
  });

  it('fails the section checks the parse could not find', async () => {
    const payload = await generate({
      parsed: { ...PARSED, educations: null, email: null, phone: null },
    });

    const byLabel = Object.fromEntries(
      payload.searchability.checks.map((c: any) => [c.label, c.status]),
    );
    expect(byLabel['Education section']).toBe('fail');
    expect(byLabel['Contact info']).toBe('fail');
    expect(byLabel['Work experience section']).toBe('pass'); // parsed as objects, not strings
  });

  it('does not fail the whole report when résumé scoring throws', async () => {
    const { service, created, scorer } = build();
    scorer.scoreResume.mockRejectedValue(new Error('scorer exploded'));

    await service.generate('u1', JOB);
    const payload = created[0].payload as any;

    expect(payload.searchability).toBeNull();
    expect(payload.recruiterTips).toBeNull();
    expect(payload.matchRate.overall).toBe(74);
  });

  it('stores identifiers on the row and the description nowhere', async () => {
    const { service, created } = build();
    await service.generate('u1', JOB);

    const row = created[0];
    expect(row).toMatchObject({ userId: 'u1', externalId: '123', source: 'linkedin' });
    expect(JSON.stringify(row)).not.toContain('We are looking for a Frontend Engineer');
  });
});
