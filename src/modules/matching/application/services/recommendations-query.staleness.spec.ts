// src/modules/matching/application/services/recommendations-query.staleness.spec.ts
//
// MENTOR_REVIEW_2026-08-18 §6: getForUser recomputed ONLY when a user had zero rows, and
// there is no cron. Re-embedding on a profile/résumé change wrote a new
// `profiles.embedding` but nothing invalidated the cached scores, so "upload a better CV
// and your matches move" never worked for anyone who had loaded the page once.

import { RecommendationsQueryService } from './recommendations-query.service';

// Matches RECOMMENDATION_JOB_INCLUDE — the mapper reads every one of these.
const JOB = {
  id: 'j1',
  companyId: 'c1',
  title: 'Backend Engineer',
  description: 'Build things.',
  status: 'PUBLISHED',
  remoteType: 'REMOTE',
  location: 'Phnom Penh',
  minSalary: null,
  maxSalary: null,
  company: { name: 'Acme' },
  skills: [],
  createdAt: new Date('2026-07-01'),
  updatedAt: new Date('2026-07-01'),
};

const row = (over: Record<string, unknown> = {}) => ({
  id: 'rec1',
  userId: 'u1',
  jobId: 'j1',
  score: 77,
  breakdown: null,
  reasonExplanation: null,
  computedAt: new Date('2026-08-01'),
  staleAt: null,
  dismissedAt: null,
  job: JOB,
  ...over,
});

describe('RecommendationsQueryService.getForUser — when it recomputes', () => {
  let prisma: { recommendation: { findMany: jest.Mock } };
  let recompute: { execute: jest.Mock };
  let service: RecommendationsQueryService;

  beforeEach(() => {
    prisma = { recommendation: { findMany: jest.fn() } };
    recompute = { execute: jest.fn().mockResolvedValue(1) };
    service = new RecommendationsQueryService(prisma as never, recompute as never);
  });

  it('recomputes for a user who has none yet', async () => {
    prisma.recommendation.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([row()]);

    await service.getForUser('u1');

    expect(recompute.execute).toHaveBeenCalledWith('u1', 50);
  });

  it('recomputes when any row is marked stale', async () => {
    // The case that never worked: rows exist, so the old zero-row check never fired.
    prisma.recommendation.findMany
      .mockResolvedValueOnce([row({ staleAt: new Date('2026-08-19') })])
      .mockResolvedValueOnce([row()]);

    await service.getForUser('u1');

    expect(recompute.execute).toHaveBeenCalledWith('u1', 50);
  });

  it('does NOT recompute when the cache is fresh', async () => {
    prisma.recommendation.findMany.mockResolvedValue([row()]);

    await service.getForUser('u1');

    // Every read triggering a rebuild would put an LLM rerank on the request path.
    expect(recompute.execute).not.toHaveBeenCalled();
    expect(prisma.recommendation.findMany).toHaveBeenCalledTimes(1);
  });

  it('serves the stale rows when the recompute fails, rather than nothing', async () => {
    const stale = row({ staleAt: new Date('2026-08-19') });
    prisma.recommendation.findMany.mockResolvedValue([stale]);
    recompute.execute.mockRejectedValue(new Error('AI service down'));

    const result = await service.getForUser('u1');

    // The whole reason staleness is a MARKER and not a delete: a failed rebuild must not
    // turn "slightly old matches" into an empty page.
    expect(result).toHaveLength(1);
  });

  it('excludes dismissed rows from the read', async () => {
    prisma.recommendation.findMany.mockResolvedValue([row()]);

    await service.getForUser('u1');

    expect(prisma.recommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', dismissedAt: null } }),
    );
  });

  // getScout's own dismissal handling moved with it when it stopped reading this cache
  // (MENTOR_REVIEW_2026-08-18 §7) — covered in recommendations-query.scout.spec.ts.
});
