// Re-opening the same posting must cost nothing; a CHANGED input must still regenerate.
//
// MENTOR_REVIEW_2026-08-18 §11 asked for a cache keyed on
// (userId, source, externalId, hash(description)). The risk in adding one is not that it
// misses — it is that it HITS when it should not, and quietly serves a report about a
// résumé the user has since replaced. That is the §6 defect (write once, never
// invalidate) reintroduced through the back door, so most of these tests are about the
// miss cases.

import { MatchReportService, hashDescription } from './match-report.service';

const DESCRIPTION = 'We need a React engineer with TypeScript and Kubernetes experience.';

const RESUME = {
  id: 'r1',
  fileName: 'cv.pdf',
  parsingStatus: 'SUCCESS',
  updatedAt: new Date('2026-08-01T00:00:00Z'),
};

const PARSED = {
  id: 'p1',
  resumeId: 'r1',
  rawText: 'React TypeScript engineer',
  summary: 'Engineer',
  skills: JSON.stringify(['React']),
  experiences: JSON.stringify([]),
  educations: JSON.stringify([]),
  email: 'a@b.c',
  phone: '123',
  updatedAt: new Date('2026-08-01T00:00:00Z'),
};

function build(over: Record<string, unknown> = {}) {
  const reports: any = {
    create: jest.fn().mockResolvedValue('new-report'),
    findReusable: jest
      .fn()
      .mockResolvedValue('cachedId' in over ? over.cachedId : null),
  };
  const resumes: any = {
    findDefaultByUserId: jest
      .fn()
      .mockResolvedValue('resume' in over ? over.resume : RESUME),
    findByUserId: jest.fn().mockResolvedValue([]),
  };
  const parsedResumes: any = {
    findByResumeId: jest
      .fn()
      .mockResolvedValue('parsed' in over ? over.parsed : PARSED),
  };
  const scorer: any = {
    scoreResume: jest.fn().mockResolvedValue({
      atsScore: 60,
      qualityScore: 55,
      breakdown: {},
      suggestions: [],
      scoredBy: 'heuristic',
    }),
  };
  const matchExternalJob: any = {
    execute: jest.fn().mockResolvedValue({
      score: 70,
      breakdown: { skills: 70, experience: 90, location: 80, salary: 50, other: 50 },
      semantic: true,
      companyData: false,
    }),
  };
  const ai: any = {
    extractJobRequirements: jest
      .fn()
      .mockResolvedValue({ requirements: ['React'], groundedness: 0.9 }),
  };
  const prisma: any = {
    profile: {
      findUnique: jest.fn().mockResolvedValue(
        'profileUpdatedAt' in over ? { updatedAt: over.profileUpdatedAt } : null,
      ),
    },
  };

  const service = new MatchReportService(
    reports,
    resumes,
    parsedResumes,
    scorer,
    matchExternalJob,
    ai,
    prisma,
  );
  return { service, reports, ai, scorer, matchExternalJob, prisma };
}

const input = (over: Partial<Record<string, string>> = {}) => ({
  externalId: 'job-1',
  source: 'linkedin',
  title: 'Frontend Engineer',
  company: 'Acme',
  location: 'Phnom Penh',
  jobDescription: DESCRIPTION,
  ...over,
});

describe('hashDescription', () => {
  it('is stable for identical text', () => {
    expect(hashDescription(DESCRIPTION)).toBe(hashDescription(DESCRIPTION));
  });

  it('ignores whitespace re-wrapping', () => {
    // The same posting read by two of our five site adapters differs only in wrapping.
    expect(hashDescription('a  b\n\nc')).toBe(hashDescription('a b c'));
  });

  it('changes when the posting is edited', () => {
    expect(hashDescription('Junior engineer')).not.toBe(
      hashDescription('Senior engineer'),
    );
  });

  it('does NOT fold case — Junior and junior are different postings', () => {
    expect(hashDescription('Junior')).not.toBe(hashDescription('junior'));
  });
});

describe('MatchReportService.generate — dedupe', () => {
  it('returns the cached report id without any AI call', async () => {
    const { service, ai, scorer, matchExternalJob, reports } = build({
      cachedId: 'cached-1',
    });

    await expect(service.generate('u1', input())).resolves.toBe('cached-1');

    // The whole point: no spend. extractJobRequirements is the metered DeepSeek call.
    expect(ai.extractJobRequirements).not.toHaveBeenCalled();
    expect(scorer.scoreResume).not.toHaveBeenCalled();
    expect(matchExternalJob.execute).not.toHaveBeenCalled();
    expect(reports.create).not.toHaveBeenCalled();
  });

  it('generates normally on a miss', async () => {
    const { service, ai, reports } = build();

    await expect(service.generate('u1', input())).resolves.toBe('new-report');
    expect(ai.extractJobRequirements).toHaveBeenCalledTimes(1);
    expect(reports.create).toHaveBeenCalledTimes(1);
  });

  it('looks the report up by user, source, externalId and the TEXT hash', async () => {
    const { service, reports } = build();
    await service.generate('u1', input());

    expect(reports.findReusable).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        source: 'linkedin',
        externalId: 'job-1',
        descriptionHash: hashDescription(DESCRIPTION),
      }),
    );
  });

  it('will not reuse a payload built by an older version of the builder', async () => {
    // MEASURED 2026-08-25: two report defects were fixed, the user re-scanned the same
    // posting, and got byte-identical output — the posting and the CV were unchanged, so
    // the cache served the pre-fix payload. An improvement nobody can see is not shipped.
    const { service, reports } = build();
    await service.generate('u1', input());

    const asked = reports.findReusable.mock.calls[0][0] as { payloadVersion: number };
    expect(asked.payloadVersion).toEqual(expect.any(Number));
    // Whatever it is, the row we WRITE must carry the same one, or nothing ever hits.
    const written = reports.create.mock.calls[0][0] as { payloadVersion: number };
    expect(written.payloadVersion).toBe(asked.payloadVersion);
  });

  it('stores the hash it looked up, so the next visit can hit', async () => {
    const { service, reports } = build();
    await service.generate('u1', input());

    expect(reports.create).toHaveBeenCalledWith(
      expect.objectContaining({ descriptionHash: hashDescription(DESCRIPTION) }),
    );
  });

  it('asks for a DIFFERENT hash when the posting text changed', async () => {
    const { service, reports } = build();
    await service.generate('u1', input({ jobDescription: 'Totally different posting' }));

    const asked = reports.findReusable.mock.calls[0][0].descriptionHash;
    expect(asked).not.toBe(hashDescription(DESCRIPTION));
  });

  // ── The freshness bar: the half that keeps the cache honest ────────────────

  it('will not reuse a report older than the résumé it should be about', async () => {
    const { service, reports } = build();
    await service.generate('u1', input());

    const { notBefore } = reports.findReusable.mock.calls[0][0];
    expect(notBefore).toEqual(RESUME.updatedAt);
  });

  it('moves the bar to the PARSE when the parse is newer than the résumé row', async () => {
    const reparsed = { ...PARSED, updatedAt: new Date('2026-08-15T00:00:00Z') };
    const { service, reports } = build({ parsed: reparsed });
    await service.generate('u1', input());

    expect(reports.findReusable.mock.calls[0][0].notBefore).toEqual(reparsed.updatedAt);
  });

  it('moves the bar to the PROFILE when the profile is the newest input', async () => {
    // The profile feeds the match score through profiles.embedding, so a changed
    // profile changes the report even though the résumé and posting are untouched.
    const profileUpdatedAt = new Date('2026-08-19T00:00:00Z');
    const { service, reports } = build({ profileUpdatedAt });
    await service.generate('u1', input());

    expect(reports.findReusable.mock.calls[0][0].notBefore).toEqual(profileUpdatedAt);
  });

  it('takes the LATEST of the three, not the first one it finds', async () => {
    const profileUpdatedAt = new Date('2026-07-01T00:00:00Z'); // older than the résumé
    const { service, reports } = build({ profileUpdatedAt });
    await service.generate('u1', input());

    expect(reports.findReusable.mock.calls[0][0].notBefore).toEqual(RESUME.updatedAt);
  });

  it('uses the epoch when the user has no résumé and no profile', async () => {
    // Nothing on the candidate side can go stale, so any report for the same text stands.
    const { service, reports } = build({ resume: null, parsed: null });
    await service.generate('u1', input());

    expect(reports.findReusable.mock.calls[0][0].notBefore).toEqual(new Date(0));
  });
});
