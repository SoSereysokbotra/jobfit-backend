// src/modules/matching/application/services/recommendations-query.readiness.spec.ts
//
// docs/AI_DEGRADATION_PLAN.md §7 — the new-user case.
//
// An empty recommendations array has five causes and the client rendered them
// identically. Only TWO of them are about the user; the rest are onboarding being
// incomplete or us having failed. Telling a brand-new candidate in a market with 366 live
// postings that nothing matches them is not a degraded experience, it is a wrong one.
//
// The fifth is NO_MATCHES_FOR_CONSTRAINTS: the candidate's own hard filter emptied the
// list. "Remote only" is enforced in retrieval now, and 4 of 368 published jobs are
// REMOTE, so retrieving nothing is a legitimate outcome of a setting they chose. Reported
// as READY it reads as a verdict on the candidate; it is a filter they can undo.
//
// The load-bearing assertion in each test is which STATE comes back, because that is what
// decides whether the UI says "no matches", "still working" or "something went wrong".

import { RecommendationsQueryService } from './recommendations-query.service';

describe('RecommendationsQueryService.getReadiness — why the list is empty', () => {
  /** No hard constraint set — the ordinary case, and what every pre-existing test wants. */
  const NO_CONSTRAINT = {
    remoteOnly: false,
    matchedWithConstraints: 0,
    matchedWithout: 0,
  };

  const build = (
    row?: Record<string, unknown>,
    impact: Record<string, unknown> = NO_CONSTRAINT,
  ) => {
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue(row ? [row] : []),
    };
    const recompute = { constraintImpact: jest.fn().mockResolvedValue(impact) };
    return {
      service: new RecommendationsQueryService(prisma as never, recompute as never),
      prisma,
      recompute,
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

  // ── the candidate's own filter emptied the list ────────────────────────────

  const WITH_VECTOR = {
    embeddingStatus: 'SUCCESS',
    embeddedAt: new Date('2026-08-27T09:00:00Z'),
    embeddingError: null,
    hasEmbedding: true,
  };

  it('NO_MATCHES_FOR_CONSTRAINTS when remote-only leaves the pool empty', async () => {
    const { service } = build(WITH_VECTOR, {
      remoteOnly: true,
      matchedWithConstraints: 0, // nothing survives the filter
      matchedWithout: 12, // but there would be plenty without it
    });

    const r = await service.getReadiness('u1');

    // NOT READY. Matching ran fine; the candidate's own setting is what emptied the list,
    // and "no jobs match you" would blame them for a filter they can undo.
    expect(r.state).toBe('NO_MATCHES_FOR_CONSTRAINTS');
    expect(r.action).toBe('WIDEN_PREFERENCES');
    expect(r.transient).toBe(false);
    // Machine-readable, so the client can link straight to the setting to relax rather
    // than parsing the sentence.
    expect(r.constraints).toEqual(['REMOTE_ONLY']);
    // Enough for "12 jobs matched you, but none are remote".
    expect(r.matchedIgnoringConstraints).toBe(12);
  });

  it('stays READY when the constraint is not what emptied the list', async () => {
    // Both sides empty: the filter is not the cause, and sending the user off to widen
    // preferences that would not help is worse than saying nothing matched.
    const { service } = build(WITH_VECTOR, {
      remoteOnly: true,
      matchedWithConstraints: 0,
      matchedWithout: 0,
    });

    const r = await service.getReadiness('u1');

    expect(r.state).toBe('READY');
  });

  it('stays READY for a remote-only candidate who does have matches', async () => {
    const { service } = build(WITH_VECTOR, {
      remoteOnly: true,
      matchedWithConstraints: 3,
      matchedWithout: 40,
    });

    const r = await service.getReadiness('u1');

    expect(r.state).toBe('READY');
    expect(r.constraints).toBeUndefined();
  });

  it('does not run the retrieval probe for a candidate with no hard constraint', async () => {
    // constraintImpact returns early for these, but the state must also be plain READY:
    // the probe costs two pgvector queries and only remote-only candidates can reach it.
    const { service, recompute } = build(WITH_VECTOR);

    const r = await service.getReadiness('u1');

    expect(r.state).toBe('READY');
    expect(recompute.constraintImpact).toHaveBeenCalledWith('u1');
  });

  it('never reports a constraint before the embedding exists', async () => {
    // Ordering: an un-embedded profile is OUR problem, and must not be reported as the
    // user's preferences being too narrow.
    const { service, recompute } = build(
      {
        embeddingStatus: 'PENDING',
        embeddedAt: null,
        embeddingError: null,
        hasEmbedding: false,
      },
      { remoteOnly: true, matchedWithConstraints: 0, matchedWithout: 12 },
    );

    const r = await service.getReadiness('u1');

    expect(r.state).toBe('EMBEDDING_PENDING');
    expect(recompute.constraintImpact).not.toHaveBeenCalled();
  });
});
