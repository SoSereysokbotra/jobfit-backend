// Tests for JobMatchService — the real match score for one job on the job detail page.
//
// Replaces a widget that rendered `job.match ± 3` where job.match was hardcoded to 0, with
// four literal <li> bullets claiming "React, TypeScript, and Node.js align perfectly" for
// every job and user. The tests below pin the two properties that make the replacement
// worth having: the numbers come from the real scorer, and the sentences restate numbers
// that were actually computed.

import { JobMatchService } from './job-match.service';
import { ComputeMatchScoreUseCase } from '../use-cases/compute-match-score.use-case';

describe('JobMatchService', () => {
  const profile = {
    city: 'Phnom Penh',
    country: 'KH',
    desiredRemoteTypes: ['REMOTE'],
    minSalary: 40000,
    maxSalary: 90000,
    desiredIndustries: [],
  };
  const job = {
    title: 'Backend Engineer',
    remoteType: 'REMOTE',
    location: 'Remote',
    minSalary: 50000,
    maxSalary: 80000,
    company: { industry: null },
  };

  const build = (opts: {
    profile?: unknown;
    job?: unknown;
    cosine?: number | null;
    experiences?: string | null;
    structuredExperience?: number;
  }) => {
    // `in` rather than `??`: an explicit null must override the default, not fall through.
    const prisma: any = {
      profile: {
        findUnique: jest.fn().mockResolvedValue('profile' in opts ? opts.profile : profile),
      },
      job: { findUnique: jest.fn().mockResolvedValue('job' in opts ? opts.job : job) },
      experience: { count: jest.fn().mockResolvedValue(opts.structuredExperience ?? 0) },
      resume: {
        findFirst: jest.fn().mockResolvedValue(
          opts.experiences === undefined
            ? { parsedData: { experiences: JSON.stringify([{}, {}]) } }
            : opts.experiences === null
              ? null
              : { parsedData: { experiences: opts.experiences } },
        ),
      },
    };
    const recompute: any = {
      cosineForJobs: jest.fn().mockResolvedValue(
        opts.cosine === null ? [] : [{ id: 'j1', cosine_sim: opts.cosine ?? 0.8 }],
      ),
    };
    return new JobMatchService(prisma, new ComputeMatchScoreUseCase(), recompute);
  };

  it('returns null when the user has no profile', async () => {
    expect(await build({ profile: null }).matchForJob('u1', 'j1')).toBeNull();
  });

  it('returns null for an unknown job', async () => {
    expect(await build({ job: null }).matchForJob('u1', 'j1')).toBeNull();
  });

  it('produces a real score and a full sub-score breakdown', async () => {
    const result = await build({ cosine: 0.85 }).matchForJob('u1', 'j1');

    expect(result!.score).toBeGreaterThan(0);
    expect(Object.keys(result!.breakdown).sort()).toEqual([
      'experience', 'location', 'other', 'salary', 'skills',
    ]);
    // Driven by the embedding similarity, not a constant.
    expect(result!.breakdown.skills).toBeGreaterThan(0);
  });

  it('scores a better embedding match higher', async () => {
    const weak = await build({ cosine: 0.2 }).matchForJob('u1', 'j1');
    const strong = await build({ cosine: 0.95 }).matchForJob('u1', 'j1');

    expect(strong!.score).toBeGreaterThan(weak!.score);
  });

  it('reuses the recommendation pipeline’s cosine query', async () => {
    // Single source of truth: the same job must not score differently here and in
    // /recommendations.
    const service = build({});
    await service.matchForJob('u1', 'j1');

    const recompute = (service as unknown as { recompute: { cosineForJobs: jest.Mock } })
      .recompute;
    expect(recompute.cosineForJobs).toHaveBeenCalledWith('u1', ['j1']);
  });

  it('flags skillsScored=false when no embedding exists', async () => {
    // The total understates real fit here, so the client has to be able to say so
    // instead of showing a deflated number as fact.
    const result = await build({ cosine: null }).matchForJob('u1', 'j1');

    expect(result!.skillsScored).toBe(false);
    expect(result!.breakdown.skills).toBe(0);
  });

  it('reports experience from the parsed résumé when there are no structured rows', async () => {
    const result = await build({
      experiences: JSON.stringify([{}, {}, {}]),
    }).matchForJob('u1', 'j1');

    expect(result!.reasons).toContain('Experience: 3 roles on your profile.');
  });

  it('prefers structured experience rows over the parsed résumé', async () => {
    const result = await build({ structuredExperience: 1 }).matchForJob('u1', 'j1');

    expect(result!.reasons).toContain('Experience: 1 role on your profile.');
  });

  it('says so plainly when there is no experience at all', async () => {
    const result = await build({ experiences: null }).matchForJob('u1', 'j1');

    expect(result!.reasons).toContain('Experience: none on your profile yet.');
  });

  it('describes skills honestly when overlap is weak', async () => {
    const result = await build({ cosine: 0.05 }).matchForJob('u1', 'j1');

    expect(result!.reasons).toContain('Skills: limited overlap with this role.');
  });

  it('never emits a reason naming a technology it was not given', async () => {
    // The replaced widget hardcoded React / TypeScript / Node.js / GraphQL.
    const result = await build({}).matchForJob('u1', 'j1');

    const joined = result!.reasons.join(' ');
    for (const invented of ['React', 'TypeScript', 'Node.js', 'GraphQL']) {
      expect(joined).not.toContain(invented);
    }
  });

  it('omits the salary line when the job states no salary', async () => {
    const result = await build({
      job: { ...job, minSalary: null, maxSalary: null },
    }).matchForJob('u1', 'j1');

    expect(result!.reasons.some((r) => r.startsWith('Salary:'))).toBe(false);
  });
});
