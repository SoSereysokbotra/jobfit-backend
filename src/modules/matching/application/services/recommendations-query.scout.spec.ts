// src/modules/matching/application/services/recommendations-query.scout.spec.ts
//
// MENTOR_REVIEW_2026-08-18 §7. getScout read existing `recommendation` rows and filtered
// them by `job.createdAt >= since`. A recommendation row only exists if a recompute ran,
// and nothing recomputes when a job is ingested — so a genuinely new job had no row and
// could never be returned. The endpoint returned [] forever while the extension polled it
// every 3 hours, which is indistinguishable from "no good jobs this week".
//
// The load-bearing test is the first one: a job with NO cached row still comes back.

import { RecommendationsQueryService } from './recommendations-query.service';

const job = (over: Record<string, unknown> = {}) => ({
  id: 'j-new',
  title: 'Backend Engineer',
  externalId: null,
  externalUrl: null,
  source: null,
  company: { name: 'Acme' },
  ...over,
});

describe('RecommendationsQueryService.getScout — scores live, never the cache', () => {
  let prisma: {
    job: { findMany: jest.Mock };
    recommendation: { findMany: jest.Mock };
  };
  let recompute: { cosineForJobs: jest.Mock; scoreJobs: jest.Mock };
  let service: RecommendationsQueryService;

  beforeEach(() => {
    prisma = {
      job: { findMany: jest.fn().mockResolvedValue([job()]) },
      // No cached recommendations for anyone — the whole point.
      recommendation: { findMany: jest.fn().mockResolvedValue([]) },
    };
    recompute = {
      cosineForJobs: jest.fn().mockResolvedValue([{ id: 'j-new', cosine_sim: 0.9 }]),
      scoreJobs: jest
        .fn()
        .mockResolvedValue([
          { jobId: 'j-new', score: 82.4, breakdown: {}, reasonExplanation: 'x' },
        ]),
    };
    service = new RecommendationsQueryService(prisma as never, recompute as never);
  });

  it('returns a newly ingested job that has NO recommendation row', async () => {
    const result = await service.getScout('u1', 70, '2026-08-19T00:00:00.000Z');

    // Under the old implementation this was [] no matter how well the job matched.
    expect(result).toEqual([
      expect.objectContaining({ title: 'Backend Engineer', score: 82 }),
    ]);
  });

  it('selects candidates by publication date, not by cached rows', async () => {
    await service.getScout('u1', 0, '2026-08-19T00:00:00.000Z');

    expect(prisma.job.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'PUBLISHED',
          createdAt: { gte: new Date('2026-08-19T00:00:00.000Z') },
        },
      }),
    );
  });

  it('falls back to a bounded window when the caller sends no `since`', async () => {
    await service.getScout('u1', 0);

    const { where, take } = prisma.job.findMany.mock.calls[0][0];
    const gte = where.createdAt.gte as Date;
    const daysAgo = (Date.now() - gte.getTime()) / 86_400_000;
    // 7 days. "Everything ever" would be the wrong answer for a client that lost its
    // watermark.
    expect(daysAgo).toBeGreaterThan(6.9);
    expect(daysAgo).toBeLessThan(7.1);
    // And the query stays bounded regardless.
    expect(take).toBe(500);
  });

  it('scores through the same path that writes the cache', async () => {
    await service.getScout('u1', 0, '2026-08-19T00:00:00.000Z');

    // Not a second scorer: a scout score and a /recommendations score for the same job
    // must not be able to disagree.
    expect(recompute.cosineForJobs).toHaveBeenCalledWith('u1', ['j-new']);
    expect(recompute.scoreJobs).toHaveBeenCalledWith('u1', [
      { id: 'j-new', cosine_sim: 0.9 },
    ]);
  });

  it('applies minScore against the freshly computed score', async () => {
    const result = await service.getScout('u1', 90, '2026-08-19T00:00:00.000Z');

    expect(result).toEqual([]);
  });

  it('excludes a job the user dismissed', async () => {
    prisma.recommendation.findMany.mockResolvedValue([{ jobId: 'j-new' }]);

    const result = await service.getScout('u1', 0, '2026-08-19T00:00:00.000Z');

    expect(result).toEqual([]);
    // Refused before scoring — no point computing a number nobody will be shown.
    expect(recompute.scoreJobs).not.toHaveBeenCalled();
    expect(prisma.recommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'u1',
          dismissedAt: { not: null },
        }),
      }),
    );
  });

  it('returns nothing, and scores nothing, when no job is new', async () => {
    prisma.job.findMany.mockResolvedValue([]);

    await expect(service.getScout('u1', 0)).resolves.toEqual([]);
    expect(recompute.cosineForJobs).not.toHaveBeenCalled();
  });

  it('returns nothing when the user has no profile vector', async () => {
    // scoreJobs returns null for a user with no profile; cosineForJobs would already
    // have returned no rows. Either way the answer is "no matches", never a score
    // computed from a missing input.
    recompute.scoreJobs.mockResolvedValue(null);

    await expect(
      service.getScout('u1', 0, '2026-08-19T00:00:00.000Z'),
    ).resolves.toEqual([]);
  });

  it('drops a scored job whose row vanished between the two queries', async () => {
    recompute.scoreJobs.mockResolvedValue([
      { jobId: 'j-gone', score: 99, breakdown: {}, reasonExplanation: 'x' },
    ]);

    await expect(
      service.getScout('u1', 0, '2026-08-19T00:00:00.000Z'),
    ).resolves.toEqual([]);
  });

  it('prefers the external apply URL, and falls back to the web app job page', async () => {
    process.env.CORS_ORIGIN = 'https://app.example.com,http://localhost:3000';
    prisma.job.findMany.mockResolvedValue([
      job({ id: 'j-new', externalUrl: 'https://themuse.com/jobs/1', source: 'TheMuse' }),
    ]);

    const [external] = await service.getScout('u1', 0, '2026-08-19T00:00:00.000Z');
    expect(external.url).toBe('https://themuse.com/jobs/1');
    expect(external.source).toBe('themuse');

    prisma.job.findMany.mockResolvedValue([job()]);
    const [internal] = await service.getScout('u1', 0, '2026-08-19T00:00:00.000Z');
    expect(internal.url).toBe('https://app.example.com/jobs/j-new');
    expect(internal.source).toBe('jobfit');
  });

  it('orders by score, best first', async () => {
    prisma.job.findMany.mockResolvedValue([job({ id: 'a' }), job({ id: 'b' })]);
    recompute.cosineForJobs.mockResolvedValue([
      { id: 'a', cosine_sim: 0.1 },
      { id: 'b', cosine_sim: 0.9 },
    ]);
    recompute.scoreJobs.mockResolvedValue([
      { jobId: 'a', score: 40, breakdown: {}, reasonExplanation: 'x' },
      { jobId: 'b', score: 90, breakdown: {}, reasonExplanation: 'x' },
    ]);

    const result = await service.getScout('u1', 0, '2026-08-19T00:00:00.000Z');

    expect(result.map((r) => r.score)).toEqual([90, 40]);
  });
});
