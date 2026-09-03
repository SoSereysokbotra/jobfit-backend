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

  // ── retry cooldown ────────────────────────────────────────────────────────
  //
  // `execute` returns 0 without clearing `staleAt` when retrieval comes back empty or the
  // user has no profile — correctly, the rows ARE still stale. But the trigger above is
  // "any row is stale", so the two looped: every request re-ran the whole retriever and
  // ended in the same place. The flag stays (it is the only record that a recompute is
  // owed); the retry RATE is what is bounded.

  it('does not retry immediately after a recompute that produced nothing', async () => {
    prisma.recommendation.findMany.mockResolvedValue([
      row({ staleAt: new Date('2026-08-19') }),
    ]);
    recompute.execute.mockResolvedValue(0);

    await service.getForUser('u1');
    expect(recompute.execute).toHaveBeenCalledTimes(1);

    await service.getForUser('u1');
    await service.getForUser('u1');

    // Still one. Without the cooldown this is one full retrieval per request, forever.
    expect(recompute.execute).toHaveBeenCalledTimes(1);
  });

  it('does not retry immediately after a recompute that threw', async () => {
    prisma.recommendation.findMany.mockResolvedValue([
      row({ staleAt: new Date('2026-08-19') }),
    ]);
    recompute.execute.mockRejectedValue(new Error('AI service down'));

    await service.getForUser('u1');
    await service.getForUser('u1');

    expect(recompute.execute).toHaveBeenCalledTimes(1);
  });

  it('retries once the cooldown has elapsed', async () => {
    prisma.recommendation.findMany.mockResolvedValue([
      row({ staleAt: new Date('2026-08-19') }),
    ]);
    recompute.execute.mockResolvedValue(0);

    await service.getForUser('u1');
    expect(recompute.execute).toHaveBeenCalledTimes(1);

    // Five minutes and a second later. The flag is still set, so the work is still owed.
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 5 * 60 * 1000 + 1000);
    await service.getForUser('u1');

    expect(recompute.execute).toHaveBeenCalledTimes(2);
  });

  it('holds off one user without affecting another', async () => {
    prisma.recommendation.findMany.mockResolvedValue([
      row({ staleAt: new Date('2026-08-19') }),
    ]);
    recompute.execute.mockResolvedValue(0);

    await service.getForUser('u1');
    await service.getForUser('u1'); // suppressed
    await service.getForUser('u2'); // different user — must still be attempted

    expect(recompute.execute).toHaveBeenCalledTimes(2);
    expect(recompute.execute).toHaveBeenLastCalledWith('u2', 50);
  });

  it('clears the hold after a recompute that wrote rows', async () => {
    prisma.recommendation.findMany.mockResolvedValue([
      row({ staleAt: new Date('2026-08-19') }),
    ]);
    recompute.execute.mockResolvedValueOnce(0).mockResolvedValue(7);

    await service.getForUser('u1'); // writes nothing -> hold
    jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 6 * 60 * 1000);
    await service.getForUser('u1'); // cooldown over, writes 7 -> hold cleared
    await service.getForUser('u1'); // rows still read back stale, so attempt again

    expect(recompute.execute).toHaveBeenCalledTimes(3);
  });

  it('excludes dismissed and non-published jobs from the read', async () => {
    prisma.recommendation.findMany.mockResolvedValue([row()]);

    await service.getForUser('u1');

    expect(prisma.recommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', dismissedAt: null, job: { status: 'PUBLISHED' } },
      }),
    );
  });

  it('orders by score first, with locationKnown only as a tiebreaker', async () => {
    prisma.recommendation.findMany.mockResolvedValue([row()]);

    await service.getForUser('u1');

    // `locationKnown` used to LEAD, which sorted on a property of the listing ("did this
    // posting state a place?") rather than of the match. A user who moved country kept
    // seeing the old country's tidily-formatted postings on top, because being
    // well-formed outranked being a good match.
    expect(prisma.recommendation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ score: 'desc' }, { locationKnown: 'desc' }, { jobId: 'asc' }],
      }),
    );
  });

  // getScout's own dismissal handling moved with it when it stopped reading this cache
  // (MENTOR_REVIEW_2026-08-18 §7) — covered in recommendations-query.scout.spec.ts.
});
