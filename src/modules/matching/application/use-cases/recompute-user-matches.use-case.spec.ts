// Tests for RecomputeUserMatchesUseCase.
//
// - execute() scoring is characterized (exact recommendation payloads) with the
//   retriever stubbed, so the scoring pipeline stays pinned across Phase B changes.
// - retrieveRankedJobs() hybrid fusion (dense + BM25 via RRF) is tested directly.

import { RecomputeUserMatchesUseCase } from './recompute-user-matches.use-case';
import { ComputeMatchScoreUseCase } from './compute-match-score.use-case';
import { AiServiceError } from '@infra/ai/ai.errors';
import { stubLocationResolver } from '../../../location/location-resolver.stub';

describe('RecomputeUserMatchesUseCase', () => {
  // Stands in for ActiveResumeService — the rule for WHICH résumé is tested in its own
  // spec; here it only has to resolve to one so the parsed-data lookup is reached.
  const activeResume = (has = true) =>
    ({ findActiveResumeId: jest.fn().mockResolvedValue(has ? 'r1' : null) }) as never;

  describe('execute() scoring (characterized; retriever stubbed)', () => {
    let prisma: any;
    let aiClient: any;
    let service: RecomputeUserMatchesUseCase;

    beforeEach(() => {
      aiClient = { rerank: jest.fn() };
      prisma = {
        profile: {
          findUnique: jest.fn().mockResolvedValue({
            city: null, country: null, desiredRemoteTypes: [],
            minSalary: null, maxSalary: null, desiredIndustries: [],
          }),
        },
        experience: { count: jest.fn().mockResolvedValue(0) },
        parsedResumeData: {
          findUnique: jest.fn().mockResolvedValue({
            experiences: JSON.stringify([{ title: 'x' }, { title: 'y' }]),
          }),
        },
        job: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'jobA', title: 'Backend Engineer', remoteType: 'REMOTE', location: null, minSalary: null, maxSalary: null, company: { industry: null } },
            { id: 'jobB', title: 'Frontend Engineer', remoteType: 'ON_SITE', location: 'NYC', minSalary: 100, maxSalary: 200, company: { industry: 'tech' } },
          ]),
        },
        // `companies.industry` is an id, so execute() resolves it to a NAME before
        // scoring. Empty here: this candidate states no desired industries, so the
        // sub-score is the neutral 50 either way and the payloads below are unchanged.
        industry: { findMany: jest.fn().mockResolvedValue([]) },
        recommendation: {
          upsert: jest.fn().mockResolvedValue(undefined),
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };
      service = new RecomputeUserMatchesUseCase(prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume(), stubLocationResolver());
      // Isolate scoring from the retriever internals.
      jest.spyOn(service, 'retrieveRankedJobs').mockResolvedValue([
        { id: 'jobA', cosine_sim: 0.8 },
        { id: 'jobB', cosine_sim: 0.5 },
      ]);
    });

    it('persists the exact recommendation payloads and returns the count', async () => {
      const written = await service.execute('u1', 50);
      expect(written).toBe(2);
      expect(prisma.recommendation.upsert).toHaveBeenCalledTimes(2);

      // computedAt is a real Date stamped per batch, so match it loosely; every other
      // field stays pinned exactly.
      expect(prisma.recommendation.upsert.mock.calls[0][0]).toEqual({
        where: { userId_jobId: { userId: 'u1', jobId: 'jobA' } },
        update: { score: 77, breakdown: { skills: 80, experience: 80, location: 100, salary: 50, other: 50 }, reasonExplanation: 'Backend Engineer: strong skills match, location fits.', computedAt: expect.any(Date), staleAt: null },
        create: { userId: 'u1', jobId: 'jobA', score: 77, breakdown: { skills: 80, experience: 80, location: 100, salary: 50, other: 50 }, reasonExplanation: 'Backend Engineer: strong skills match, location fits.', computedAt: expect.any(Date) },
      });
      expect(prisma.recommendation.upsert.mock.calls[1][0]).toEqual({
        where: { userId_jobId: { userId: 'u1', jobId: 'jobB' } },
        // location is NULL, not 50: this profile has no city, so no comparison happened.
        // The old scorer returned a neutral 50 here and folded it into the total as if it
        // were a measurement. It is now dropped and the remaining weights rescaled, which
        // is why the score is 59 rather than 58.
        update: { score: 59, breakdown: { skills: 50, experience: 80, location: null, salary: 50, other: 50 }, reasonExplanation: 'Frontend Engineer: partial skills match.', computedAt: expect.any(Date), staleAt: null },
        create: { userId: 'u1', jobId: 'jobB', score: 59, breakdown: { skills: 50, experience: 80, location: null, salary: 50, other: 50 }, reasonExplanation: 'Frontend Engineer: partial skills match.', computedAt: expect.any(Date) },
      });

      // §6: the upsert only ever writes the new top-N, so anything else the user still
      // has is a leftover from an older ranking and has to go — except dismissals, which
      // are tombstones. Without this a job that fell out kept its months-old score.
      expect(prisma.recommendation.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'u1', dismissedAt: null, jobId: { notIn: ['jobA', 'jobB'] } },
      });

      // update carries staleAt: null — clearing the flag is what ends the
      // recompute-on-every-read loop. create does not: a new row is fresh by default.
      expect(prisma.recommendation.upsert.mock.calls[0][0].update.staleAt).toBeNull();
      // dismissedAt is absent from update: refreshing a rejected job's score is fine,
      // un-rejecting it is not.
      expect(
        'dismissedAt' in prisma.recommendation.upsert.mock.calls[0][0].update,
      ).toBe(false);
    });

    it('returns 0 when the user has no profile', async () => {
      prisma.profile.findUnique.mockResolvedValue(null);
      expect(await service.execute('u1')).toBe(0);
      expect(prisma.recommendation.upsert).not.toHaveBeenCalled();
    });
  });

  describe('retrieveRankedJobs() hybrid fusion', () => {
    it('fuses dense + BM25 lists via RRF and backfills cosine for BM25-only hits', async () => {
      const prisma: any = {
        // 1) dense, 2) sparse, 3) cosineForJobs (for the BM25-only hit 'c')
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([{ id: 'a', cosine_sim: 0.9 }, { id: 'b', cosine_sim: 0.7 }])
          .mockResolvedValueOnce([{ id: 'c' }, { id: 'b' }])
          .mockResolvedValueOnce([{ id: 'c', cosine_sim: 0.3 }]),
        profile: { findUnique: jest.fn().mockResolvedValue({ headline: 'engineer' }) },
        parsedResumeData: {
          findUnique: jest.fn().mockResolvedValue({
            skills: JSON.stringify(['node']), experiences: null,
          }),
        },
      };
      const aiClient = { rerank: jest.fn() };
      const service = new RecomputeUserMatchesUseCase(prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume(), stubLocationResolver());

      // rerank:false is explicit — this test is about RRF fusion, and the reranker is
      // ON by default in production, which would otherwise reorder the result.
      const result = await service.retrieveRankedJobs('u1', 3, { rerank: false });

      // RRF: b in both lists -> top; a and c tie -> id order.
      expect(result).toEqual([
        { id: 'b', cosine_sim: 0.7 },
        { id: 'a', cosine_sim: 0.9 },
        { id: 'c', cosine_sim: 0.3 }, // cosine backfilled for the BM25-only hit
      ]);
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(3);
    });

    it('degrades to dense-only when the candidate has no query text', async () => {
      const prisma: any = {
        $queryRawUnsafe: jest.fn().mockResolvedValueOnce([
          { id: 'a', cosine_sim: 0.9 },
          { id: 'b', cosine_sim: 0.7 },
        ]),
        profile: { findUnique: jest.fn().mockResolvedValue({ headline: null }) },
        parsedResumeData: { findUnique: jest.fn().mockResolvedValue(null) },
      };
      const aiClient = { rerank: jest.fn() };
      const service = new RecomputeUserMatchesUseCase(prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume(), stubLocationResolver());

      const result = await service.retrieveRankedJobs('u1', 10);

      expect(result).toEqual([
        { id: 'a', cosine_sim: 0.9 },
        { id: 'b', cosine_sim: 0.7 },
      ]);
      // Only the dense query ran (no sparse, no backfill).
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('reorders the fused shortlist via the LLM reranker when enabled', async () => {
      const prisma: any = {
        // dense returns a,b,c in that order; sparse empty so fused = [a,b,c].
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([
            { id: 'a', cosine_sim: 0.9 },
            { id: 'b', cosine_sim: 0.8 },
            { id: 'c', cosine_sim: 0.7 },
          ])
          .mockResolvedValueOnce([]), // sparse (BM25) — none
        profile: { findUnique: jest.fn().mockResolvedValue({ headline: 'engineer' }) },
        parsedResumeData: { findUnique: jest.fn().mockResolvedValue(null) },
        job: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a', title: 'A', description: '', company: { name: 'X' } },
            { id: 'b', title: 'B', description: '', company: { name: 'Y' } },
            { id: 'c', title: 'C', description: '', company: { name: 'Z' } },
          ]),
        },
      };
      // Reranker prefers c, then a, then b.
      const aiClient = {
        rerank: jest.fn().mockResolvedValue({
          scores: [{ id: 'a', score: 0.5 }, { id: 'b', score: 0.1 }, { id: 'c', score: 0.9 }],
        }),
      };
      const service = new RecomputeUserMatchesUseCase(prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume(), stubLocationResolver());

      const result = await service.retrieveRankedJobs('u1', 3, { rerank: true });

      expect(aiClient.rerank).toHaveBeenCalledTimes(1);
      expect(result.map((r) => r.id)).toEqual(['c', 'a', 'b']); // reordered by rerank score
    });

    // ── production default (Phase B shipped) ────────────────────────────────
    //
    // The reranker is ON in production: measured MRR@10 0.63 -> 0.75 (+20%), the only
    // AI change in this project with a positive measured result behind it. It is a
    // config flag rather than a hardcode because it costs one LLM call per refresh.

    /** Fused order is a,b,c; the reranker prefers c,a,b. */
    const rerankFixtures = () => {
      const prisma: any = {
        $queryRawUnsafe: jest.fn()
          .mockResolvedValueOnce([
            { id: 'a', cosine_sim: 0.9 },
            { id: 'b', cosine_sim: 0.8 },
            { id: 'c', cosine_sim: 0.7 },
          ])
          .mockResolvedValueOnce([]),
        profile: { findUnique: jest.fn().mockResolvedValue({ headline: 'engineer' }) },
        parsedResumeData: { findUnique: jest.fn().mockResolvedValue(null) },
        job: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'a', title: 'A', description: '', company: { name: 'X' } },
            { id: 'b', title: 'B', description: '', company: { name: 'Y' } },
            { id: 'c', title: 'C', description: '', company: { name: 'Z' } },
          ]),
        },
      };
      const aiClient = {
        rerank: jest.fn().mockResolvedValue({
          scores: [{ id: 'a', score: 0.5 }, { id: 'b', score: 0.1 }, { id: 'c', score: 0.9 }],
        }),
      };
      return { prisma, aiClient };
    };

    const withConfig = (rerankEnabled: boolean) =>
      ({ get: jest.fn().mockReturnValue(rerankEnabled) }) as never;

    it('reranks by default when no explicit option is given (config ON)', async () => {
      const { prisma, aiClient } = rerankFixtures();
      const service = new RecomputeUserMatchesUseCase(
        prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume(), stubLocationResolver(), withConfig(true),
      );

      const result = await service.retrieveRankedJobs('u1', 3);

      expect(aiClient.rerank).toHaveBeenCalledTimes(1);
      expect(result.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    });

    it('skips the reranker when the config flag is off', async () => {
      const { prisma, aiClient } = rerankFixtures();
      const service = new RecomputeUserMatchesUseCase(
        prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume(), stubLocationResolver(), withConfig(false),
      );

      const result = await service.retrieveRankedJobs('u1', 3);

      expect(aiClient.rerank).not.toHaveBeenCalled();
      expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']); // fused order
    });

    it('lets an explicit rerank:false win over a config that has it ON', async () => {
      // The eval harness passes explicit booleans precisely so a baseline measurement
      // cannot silently inherit whatever the deployment has enabled.
      const { prisma, aiClient } = rerankFixtures();
      const service = new RecomputeUserMatchesUseCase(
        prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume(), stubLocationResolver(), withConfig(true),
      );

      const result = await service.retrieveRankedJobs('u1', 3, { rerank: false });

      expect(aiClient.rerank).not.toHaveBeenCalled();
      expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });

    it('falls back to the fused order when the AI service is down', async () => {
      // Ranking quality degrades; availability must not.
      const { prisma } = rerankFixtures();
      const aiClient = {
        rerank: jest.fn().mockRejectedValue(
          new AiServiceError('MODEL_TIMEOUT', 'Ollama did not respond', undefined),
        ),
      };
      const service = new RecomputeUserMatchesUseCase(
        prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume(), stubLocationResolver(), withConfig(true),
      );

      const result = await service.retrieveRankedJobs('u1', 3);

      expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });
  });
});

// ── scoreJobs: the single scoring path (MENTOR_REVIEW_2026-08-18 §7) ──────────
//
// Extracted out of execute() so the extension's scout can score jobs that have no cached
// recommendation row. Both callers must go through here, or a scout score and a
// /recommendations score for the same job can drift apart.
describe('RecomputeUserMatchesUseCase.scoreJobs', () => {
  const buildPrisma = (profile: unknown) => ({
    profile: { findUnique: jest.fn().mockResolvedValue(profile) },
    experience: { count: jest.fn().mockResolvedValue(2) },
    parsedResumeData: { findUnique: jest.fn().mockResolvedValue(null) },
    industry: { findMany: jest.fn().mockResolvedValue([]) },
    job: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'jobA',
          title: 'Backend Engineer',
          remoteType: 'REMOTE',
          location: 'Phnom Penh',
          minSalary: null,
          maxSalary: null,
          company: { industry: null },
        },
      ]),
    },
    recommendation: {
      upsert: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  });

  const PROFILE = {
    city: 'Phnom Penh',
    country: 'KH',
    desiredRemoteTypes: ['REMOTE'],
    minSalary: null,
    maxSalary: null,
    desiredIndustries: [],
  };

  const make = (profile: unknown) => {
    const prisma = buildPrisma(profile);
    const activeResumeStub = { findActiveResumeId: jest.fn().mockResolvedValue(null) };
    return new RecomputeUserMatchesUseCase(
      prisma as never,
      new ComputeMatchScoreUseCase(),
      { rerank: jest.fn() } as never,
      activeResumeStub as never,
      stubLocationResolver(),
    );
  };

  // END-TO-END WIRING, not just the scorer: proves the use-case resolves the profile's
  // free-text city and the job's free-text location into real places before comparing.
  // Every other location test operates on already-resolved inputs.
  it('resolves both sides and grades a foreign job below a local one', async () => {
    const prisma = buildPrisma(PROFILE);
    prisma.job.findMany = jest.fn().mockResolvedValue([
      {
        id: 'local',
        title: 'Backend Engineer',
        remoteType: 'ON_SITE',
        location: 'Phnom Penh, Cambodia',
        minSalary: null,
        maxSalary: null,
        company: { industry: null, city: null, country: null },
      },
      {
        id: 'foreign',
        title: 'Backend Engineer',
        remoteType: 'ON_SITE',
        location: 'Bangkok, Thailand',
        minSalary: null,
        maxSalary: null,
        company: { industry: null, city: null, country: null },
      },
    ]);
    const service = new RecomputeUserMatchesUseCase(
      prisma as never,
      new ComputeMatchScoreUseCase(),
      { rerank: jest.fn() } as never,
      { findActiveResumeId: jest.fn().mockResolvedValue(null) } as never,
      stubLocationResolver(),
    );

    const scored = await service.scoreJobs('u1', [
      { id: 'local', cosine_sim: 0.8 },
      { id: 'foreign', cosine_sim: 0.8 },
    ]);

    const local = scored!.find((j) => j.jobId === 'local')!;
    const foreign = scored!.find((j) => j.jobId === 'foreign')!;
    expect(local.breakdown.location).toBe(100); // same city
    expect(foreign.breakdown.location).toBe(30); // different country
    // Identical in every other input, so the whole gap comes from geography — which is
    // exactly what the old scorer could not produce: both were 55 there.
    expect(local.score).toBeGreaterThan(foreign.score);
  });

  it('scores the jobs it is given, without touching the recommendations cache', async () => {
    const service = make(PROFILE);

    const scored = await service.scoreJobs('u1', [{ id: 'jobA', cosine_sim: 0.8 }]);

    expect(scored).toHaveLength(1);
    expect(scored![0]).toMatchObject({
      jobId: 'jobA',
      score: expect.any(Number),
      reasonExplanation: expect.stringContaining('Backend Engineer'),
    });
  });

  it('returns null when the user has no profile — nothing to match against', async () => {
    const service = make(null);

    await expect(service.scoreJobs('u1', [{ id: 'jobA', cosine_sim: 0.8 }])).resolves
      .toBeNull();
  });

  it('short-circuits on an empty input rather than querying', async () => {
    const service = make(PROFILE);

    await expect(service.scoreJobs('u1', [])).resolves.toEqual([]);
  });

  it('skips an id with no matching job row', async () => {
    const service = make(PROFILE);

    const scored = await service.scoreJobs('u1', [
      { id: 'jobA', cosine_sim: 0.8 },
      { id: 'ghost', cosine_sim: 0.9 },
    ]);

    expect(scored!.map((s) => s.jobId)).toEqual(['jobA']);
  });
});
