// Tests for RecomputeUserMatchesUseCase.
//
// - execute() scoring is characterized (exact recommendation payloads) with the
//   retriever stubbed, so the scoring pipeline stays pinned across Phase B changes.
// - retrieveRankedJobs() hybrid fusion (dense + BM25 via RRF) is tested directly.

import { RecomputeUserMatchesUseCase } from './recompute-user-matches.use-case';
import { ComputeMatchScoreUseCase } from './compute-match-score.use-case';
import { AiServiceError } from '@infra/ai/ai.errors';

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
        recommendation: { upsert: jest.fn().mockResolvedValue(undefined) },
      };
      service = new RecomputeUserMatchesUseCase(prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume());
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

      expect(prisma.recommendation.upsert.mock.calls[0][0]).toEqual({
        where: { userId_jobId: { userId: 'u1', jobId: 'jobA' } },
        update: { score: 77, breakdown: { skills: 80, experience: 80, location: 100, salary: 50, other: 50 }, reasonExplanation: 'Backend Engineer: strong skills match, location fits.' },
        create: { userId: 'u1', jobId: 'jobA', score: 77, breakdown: { skills: 80, experience: 80, location: 100, salary: 50, other: 50 }, reasonExplanation: 'Backend Engineer: strong skills match, location fits.' },
      });
      expect(prisma.recommendation.upsert.mock.calls[1][0]).toEqual({
        where: { userId_jobId: { userId: 'u1', jobId: 'jobB' } },
        update: { score: 58, breakdown: { skills: 50, experience: 80, location: 50, salary: 50, other: 50 }, reasonExplanation: 'Frontend Engineer: partial skills match.' },
        create: { userId: 'u1', jobId: 'jobB', score: 58, breakdown: { skills: 50, experience: 80, location: 50, salary: 50, other: 50 }, reasonExplanation: 'Frontend Engineer: partial skills match.' },
      });
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
      const service = new RecomputeUserMatchesUseCase(prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume());

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
      const service = new RecomputeUserMatchesUseCase(prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume());

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
      const service = new RecomputeUserMatchesUseCase(prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume());

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
        prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume(), withConfig(true),
      );

      const result = await service.retrieveRankedJobs('u1', 3);

      expect(aiClient.rerank).toHaveBeenCalledTimes(1);
      expect(result.map((r) => r.id)).toEqual(['c', 'a', 'b']);
    });

    it('skips the reranker when the config flag is off', async () => {
      const { prisma, aiClient } = rerankFixtures();
      const service = new RecomputeUserMatchesUseCase(
        prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume(), withConfig(false),
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
        prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume(), withConfig(true),
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
        prisma as never, new ComputeMatchScoreUseCase(), aiClient as never, activeResume(), withConfig(true),
      );

      const result = await service.retrieveRankedJobs('u1', 3);

      expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    });
  });
});
