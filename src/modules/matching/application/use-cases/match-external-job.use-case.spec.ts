// Tests for MatchExternalJobUseCase.
//
// The failure these pin is a CONFIDENT NUMBER FOR AN UNMEASURED THING. When the AI
// service is unreachable the skills comparison cannot run, and the degraded path used to
// substitute a "neutral" cosine of 0.5 — which is exactly SKILLS_COSINE_CEIL, so the
// remap returned 100 and, at 75% of the field-forward blend, put every unknown job in the
// high 80s/90s. Observed on 2026-08-12: a Software Engineer's CV scored 95% against a
// Food & Beverage Manager posting, and 89% against two unrelated others. Three different
// jobs, three confident numbers, none of them computed.

import { MatchExternalJobUseCase } from './match-external-job.use-case';

const JOB = {
  title: 'Food and Beverage Manager',
  company: null,
  location: 'Phnom Penh, Cambodia',
  remoteType: null,
};

/**
 * `embedding` is the candidate's stored profile vector as pgvector renders it; `embed`
 * is the AI call for the job vector. Either being unavailable is what "degraded" means.
 */
function build(opts: { embedFails?: boolean; profileVector?: boolean } = {}) {
  const vector = '[1,0,0]';
  const prisma: any = {
    profile: {
      findUnique: jest.fn().mockResolvedValue({
        city: 'Phnom Penh',
        country: 'Cambodia',
        desiredRemoteTypes: [],
        minSalary: null,
        maxSalary: null,
        desiredIndustries: [],
      }),
    },
    experience: { count: jest.fn().mockResolvedValue(2) },
    resume: { findFirst: jest.fn().mockResolvedValue(null) },
    company: { findFirst: jest.fn().mockResolvedValue(null) },
    job: { aggregate: jest.fn() },
    $queryRaw: jest
      .fn()
      .mockResolvedValue([{ embedding: opts.profileVector === false ? null : vector }]),
  };
  const aiClient: any = {
    embed: jest.fn(async () => {
      if (opts.embedFails) throw new Error('AI service unreachable');
      // Orthogonal to the profile vector: cosine 0, i.e. an unrelated field.
      return { embeddings: [[0, 1, 0]] };
    }),
  };
  return new MatchExternalJobUseCase(prisma, aiClient);
}

describe('MatchExternalJobUseCase', () => {
  it('emits NO score when the AI service is down', async () => {
    const result = await build({ embedFails: true }).execute('u1', JOB);

    expect(result?.semantic).toBe(false);
    // The regression: this used to be 95, because an unmeasured sub-score scored 100.
    // Reweighting the rest was tried and still gave 92 — experience and location are
    // generous by construction, so there is no honest total to print.
    expect(result!.score).toBeNull();
    // The placeholder must not read as a verdict in either direction.
    expect(result!.breakdown.skills).toBe(50);
  });

  it('emits no score when the candidate has no profile vector', async () => {
    const result = await build({ profileVector: false }).execute('u1', JOB);

    expect(result?.semantic).toBe(false);
    expect(result!.score).toBeNull();
  });

  it('scores an unrelated field low once the comparison actually runs', async () => {
    const result = await build().execute('u1', JOB);

    expect(result?.semantic).toBe(true);
    // Cosine 0 is below SKILLS_COSINE_FLOOR, so the remap floors it.
    expect(result!.breakdown.skills).toBe(0);
    // Skills carries 75% of the field-forward blend, so the total collapses with it.
    expect(result!.score).toBeLessThan(30);
  });

  it('returns null when there is no profile to match against', async () => {
    const useCase = build();
    (useCase as any).prisma.profile.findUnique.mockResolvedValue(null);

    expect(await useCase.execute('u1', JOB)).toBeNull();
  });
});
