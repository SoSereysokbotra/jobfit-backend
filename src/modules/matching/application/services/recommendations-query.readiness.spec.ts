// src/modules/matching/application/services/recommendations-query.readiness.spec.ts
//
// docs/AI_DEGRADATION_PLAN.md §7 — the new-user case.
//
// An empty recommendations array has four causes and the client rendered them
// identically. Only ONE of them is about the user; the other three are onboarding being
// incomplete or us having failed. Telling a brand-new candidate in a market with 366 live
// postings that nothing matches them is not a degraded experience, it is a wrong one.
//
// The load-bearing assertion in each test is which STATE comes back, because that is what
// decides whether the UI says "no matches", "still working" or "something went wrong".

import { RecommendationsQueryService } from './recommendations-query.service';

describe('RecommendationsQueryService.getReadiness — why the list is empty', () => {
  const build = (row?: Record<string, unknown>) => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue(row ? [row] : []),
    };
    return {
      service: new RecommendationsQueryService(prisma as never, {} as never),
      prisma,
    };
  };

  it('NO_PROFILE when the user has not created one', async () => {
    const { service } = build(undefined);

    const r = await service.getReadiness('u1');

    expect(r.state).toBe('NO_PROFILE');
    expect(r.action).toBe('CREATE_PROFILE');
    // The next move is theirs, and it is not going to resolve by waiting.
    expect(r.transient).toBe(false);
  });

  it('READY when a usable vector exists', async () => {
    const { service } = build({
      embeddingStatus: 'SUCCESS',
      embeddedAt: new Date('2026-08-27T09:00:00Z'),
      embeddingError: null,
      hasEmbedding: true,
    });

    const r = await service.getReadiness('u1');

    expect(r.state).toBe('READY');
    expect(r.embeddedAt).toBe('2026-08-27T09:00:00.000Z');
  });

  it('EMBEDDING_PENDING while we are still working', async () => {
    const { service } = build({
      embeddingStatus: 'PENDING',
      embeddedAt: null,
      embeddingError: null,
      hasEmbedding: false,
    });

    const r = await service.getReadiness('u1');

    expect(r.state).toBe('EMBEDDING_PENDING');
    // The one state that resolves on its own — so this is the one where "check back in
    // a minute" is honest.
    expect(r.transient).toBe(true);
    expect(r.message).toMatch(/still setting up/i);
  });

  it('EMBEDDING_FAILED when we broke, and does not promise a retry that does not exist', async () => {
    const { service } = build({
      embeddingStatus: 'FAILED',
      embeddedAt: null,
      embeddingError: 'NETWORK: fetch failed',
      hasEmbedding: false,
    });

    const r = await service.getReadiness('u1');

    expect(r.state).toBe('EMBEDDING_FAILED');
    // The embed is a one-shot event listener with no retry, so "we'll try again shortly"
    // would be a lie. The honest action is the one that re-fires the event.
    expect(r.transient).toBe(false);
    expect(r.action).toBe('UPDATE_PROFILE');
    expect(r.detail).toBe('NETWORK: fetch failed');
  });

  it('treats a present vector as READY even if the last attempt FAILED', async () => {
    // A refresh failed but the old vector is still there. Matching works — on slightly
    // stale data, which beats not matching at all. Same call as serving stale
    // recommendations rather than an empty page.
    const { service } = build({
      embeddingStatus: 'FAILED',
      embeddedAt: new Date('2026-08-20T09:00:00Z'),
      embeddingError: 'TIMEOUT: timed out',
      hasEmbedding: true,
    });

    expect((await service.getReadiness('u1')).state).toBe('READY');
  });

  it('never leaks the internal error into the displayable message', async () => {
    const { service } = build({
      embeddingStatus: 'FAILED',
      embeddedAt: null,
      embeddingError: 'NETWORK: fetch failed at AiClient.send (ai.client.ts:196)',
      hasEmbedding: false,
    });

    const r = await service.getReadiness('u1');

    // `message` is shown to a candidate; `detail` is for support.
    expect(r.message).not.toMatch(/NETWORK|ai\.client/);
    expect(r.detail).toMatch(/ai\.client/);
  });

  it('scopes the lookup to the user and excludes soft-deleted profiles', async () => {
    const { service, prisma } = build(undefined);

    await service.getReadiness('u1');

    const [sql, param] = prisma.$queryRawUnsafe.mock.calls[0];
    expect(sql).toMatch(/"userId" = \$1/);
    expect(sql).toMatch(/"deletedAt" IS NULL/);
    expect(param).toBe('u1');
  });
});
