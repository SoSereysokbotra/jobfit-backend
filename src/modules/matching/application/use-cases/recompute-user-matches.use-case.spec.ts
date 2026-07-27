// Tests for RecomputeUserMatchesUseCase.
//
// - execute() scoring is characterized (exact recommendation payloads) with the
//   retriever stubbed, so the scoring pipeline stays pinned across Phase B changes.
// - retrieveRankedJobs() hybrid fusion (dense + BM25 via RRF) is tested directly.

import { RecomputeUserMatchesUseCase } from './recompute-user-matches.use-case';
import { ComputeMatchScoreUseCase } from './compute-match-score.use-case';

describe('RecomputeUserMatchesUseCase', () => {
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
        resume: {
          findFirst: jest.fn().mockResolvedValue({
            parsedData: { experiences: JSON.stringify([{ title: 'x' }, { title: 'y' }]) },
          }),
        },
        job: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'jobA', title: 'Backend Engineer', remoteType: 'REMOTE', location: null, minSalary: null, maxSalary: null, company: { industry: null } },
            { id: 'jobB', title: 'Frontend Engineer', remoteType: 'ON_SITE', location: 'NYC', minSalary: 100, maxSalary: 200, company: { industry: 'tech' } },
          ]),
        },
        recommendation: { upsert: jest.fn().mockResolvedValue(undefined) },
      };
      service = new RecomputeUserMatchesUseCase(prisma as never, new ComputeMatchScoreUseCase(), aiClient as never);
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
        resume: {
          findFirst: jest.fn().mockResolvedValue({
            parsedData: { skills: JSON.stringify(['node']), experiences: null },
          }),
        },
      };
      const aiClient = { rerank: jest.fn() };
      const service = new RecomputeUserMatchesUseCase(prisma as never, new ComputeMatchScoreUseCase(), aiClient as never);

      const result = await service.retrieveRankedJobs('u1', 3);

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
        resume: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const aiClient = { rerank: jest.fn() };
      const service = new RecomputeUserMatchesUseCase(prisma as never, new ComputeMatchScoreUseCase(), aiClient as never);

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
        resume: { findFirst: jest.fn().mockResolvedValue(null) },
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
      const service = new RecomputeUserMatchesUseCase(prisma as never, new ComputeMatchScoreUseCase(), aiClient as never);

      const result = await service.retrieveRankedJobs('u1', 3, { rerank: true });

      expect(aiClient.rerank).toHaveBeenCalledTimes(1);
      expect(result.map((r) => r.id)).toEqual(['c', 'a', 'b']); // reordered by rerank score
    });
  });
});
