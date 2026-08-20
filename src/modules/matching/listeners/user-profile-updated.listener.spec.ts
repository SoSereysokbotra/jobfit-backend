// src/modules/matching/listeners/user-profile-updated.listener.spec.ts
//
// MENTOR_REVIEW_2026-08-18 §6. This listener re-embedded the candidate on every
// profile / preference / résumé / default-résumé change — and stopped there. The new
// vector landed in `profiles.embedding`; the scores in `recommendations` were computed
// from the old one and nothing told them. That is why PHASE_DEFAULT_RESUME.md Step 3
// ("pick a different CV and your recommendations move") never actually worked.

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

  it('does NOT invalidate when the embed threw', async () => {
    embeddings.embedCandidate.mockRejectedValue(new Error('AI service down'));

    await expect(listener.onProfileChange({ aggregateId: 'u1' })).resolves
      .toBeUndefined();

    // The vector did not change, so the cached scores are still correct for it.
    // Marking them stale would loop the read path against an unchanged input.
    expect(staleness.markStale).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalled();
  });

  it('does NOT invalidate when there was nothing to embed', async () => {
    // embedCandidate returns false (not throws) when the user has no profile yet.
    embeddings.embedCandidate.mockResolvedValue(false);

    await listener.onProfileChange({ aggregateId: 'u1' });

    expect(staleness.markStale).not.toHaveBeenCalled();
  });

  it('swallows an invalidation failure — a profile edit must still succeed', async () => {
    staleness.markStale.mockRejectedValue(new Error('db blip'));

    await expect(listener.onProfileChange({ aggregateId: 'u1' })).resolves
      .toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining('could not mark recommendations stale'),
    );
  });
});
