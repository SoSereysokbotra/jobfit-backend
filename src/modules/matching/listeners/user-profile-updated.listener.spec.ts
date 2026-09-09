// src/modules/matching/listeners/user-profile-updated.listener.spec.ts
//
// MENTOR_REVIEW_2026-08-18 §6. This listener re-embedded the candidate on every
// profile / preference / résumé / default-résumé change — and stopped there. The new
// vector landed in `profiles.embedding`; the scores in `recommendations` were computed
// from the old one and nothing told them. That is why PHASE_DEFAULT_RESUME.md Step 3
// ("pick a different CV and your recommendations move") never actually worked.
//
// The pairing that fixed it then CHAINED the two: marking ran only if the embed returned
// true. That lost the invalidation for a location change — the one edit that does not
// touch the embedding text at all — whenever the AI service happened to be down, and the
// event has no queue and no retry, so it was lost permanently. The two steps are now
// independent, which is what most of the cases below pin.

import { Logger } from '@nestjs/common';
import { UserProfileUpdatedListener } from './user-profile-updated.listener';

describe('UserProfileUpdatedListener', () => {
  let embeddings: {
    embedCandidate: jest.Mock;
    embedCandidateByResume: jest.Mock;
  };
  let staleness: { markStale: jest.Mock; markStaleByResume: jest.Mock };
  let errorLog: jest.SpyInstance;
  let listener: UserProfileUpdatedListener;

  beforeEach(() => {
    embeddings = {
      embedCandidate: jest.fn().mockResolvedValue(true),
      embedCandidateByResume: jest.fn().mockResolvedValue(true),
    };
    staleness = {
      markStale: jest.fn().mockResolvedValue(3),
      markStaleByResume: jest.fn().mockResolvedValue(3),
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    listener = new UserProfileUpdatedListener(
      embeddings as never,
      staleness as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('marks recommendations stale after re-embedding on a profile change', async () => {
    await listener.onProfileChange({ aggregateId: 'u1' });

    expect(embeddings.embedCandidate).toHaveBeenCalledWith('u1');
    expect(staleness.markStale).toHaveBeenCalledWith('u1');
  });

  it('marks them stale after a résumé is parsed, resolving the owner', async () => {
    await listener.onResumeParsed({ aggregateId: 'r1' });

    expect(embeddings.embedCandidateByResume).toHaveBeenCalledWith('r1');
    expect(staleness.markStaleByResume).toHaveBeenCalledWith('r1');
  });

  it('STILL invalidates when the embed threw — the scores depend on more than the vector', async () => {
    embeddings.embedCandidate.mockRejectedValue(new Error('AI service down'));

    await expect(listener.onProfileChange({ aggregateId: 'u1' })).resolves
      .toBeUndefined();

    // THE REGRESSION THIS FILE EXISTS TO CATCH. This assertion used to be
    // `not.toHaveBeenCalled()`, on the reasoning that an unchanged vector means unchanged
    // scores. It does not: the location sub-score is computed at score time from
    // `profiles.city`/`country`, which is exactly what a "I moved to Cambodia" edit
    // changes and exactly what the embedding text does not contain. Skipping the mark
    // here is how a location change was silently dropped whenever the AI service was down.
    expect(staleness.markStale).toHaveBeenCalledWith('u1');
    expect(errorLog).toHaveBeenCalled();
  });

  it('STILL invalidates when there was nothing to embed', async () => {
    // embedCandidate returns false (not throws) when the user has no profile yet.
    embeddings.embedCandidate.mockResolvedValue(false);

    await listener.onProfileChange({ aggregateId: 'u1' });

    // Harmless when there really is nothing: a user with no profile has no live rows, so
    // markStale is a zero-row no-op rather than something worth branching on.
    expect(staleness.markStale).toHaveBeenCalledWith('u1');
  });

  it('marks a résumé-owner stale even when that embed failed', async () => {
    embeddings.embedCandidateByResume.mockResolvedValue(false);

    await listener.onResumeParsed({ aggregateId: 'r1' });

    expect(staleness.markStaleByResume).toHaveBeenCalledWith('r1');
  });

  it('invalidates AFTER the embed attempt, not before', async () => {
    // Order matters: a read landing between the two would otherwise recompute against
    // the old vector and clear the flag, stranding the new one.
    const calls: string[] = [];
    embeddings.embedCandidate.mockImplementation(async () => {
      calls.push('embed');
      return true;
    });
    staleness.markStale.mockImplementation(async () => {
      calls.push('markStale');
      return 3;
    });

    await listener.onProfileChange({ aggregateId: 'u1' });

    expect(calls).toEqual(['embed', 'markStale']);
  });

  it('swallows an invalidation failure — a profile edit must still succeed', async () => {
    staleness.markStale.mockRejectedValue(new Error('db blip'));

    await expect(listener.onProfileChange({ aggregateId: 'u1' })).resolves
      .toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('Could not mark recommendations stale'),
    );
  });
});
