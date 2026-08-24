// Deleting an account must free the address, or the user can never come back.
//
// MENTOR_REVIEW_2026-08-18 §14. `users.email` is @unique and soft delete only set
// `deletedAt`, so the address stayed occupied by a row nobody could log into. The only
// escape was a hard delete through the Supabase console — which cascades to
// `match_labels`, and is the documented cause of 50 hand-labelled evaluation pairs being
// destroyed. The re-registration bug and the lost eval set are the same bug.

import { AdminUserRepository } from './admin-user.repository';
import { authCacheKeys } from '@modules/auth/infrastructure/persistence/auth-cache.keys';

const EMAIL = 'someone@example.com';

function build(over: { existing?: { email: string } | null; count?: number; redisThrows?: boolean } = {}) {
  const existing = 'existing' in over ? over.existing : { email: EMAIL };
  const prisma = {
    user: {
      findFirst: jest.fn().mockResolvedValue(existing ?? null),
      updateMany: jest.fn().mockResolvedValue({ count: over.count ?? 1 }),
    },
  };
  const redis = {
    del: jest.fn(async (_key: string) => {
      if (over.redisThrows) throw new Error('redis down');
    }),
  };
  return { repo: new AdminUserRepository(prisma as never, redis as never), prisma, redis };
}

/** The data payload handed to updateMany. */
function written(prisma: { user: { updateMany: jest.Mock } }): Record<string, unknown> {
  return prisma.user.updateMany.mock.calls[0][0].data as Record<string, unknown>;
}

describe('AdminUserRepository.softDelete', () => {
  it('marks the account deleted and inactive', async () => {
    const { repo, prisma } = build();
    await expect(repo.softDelete('u1')).resolves.toBe(true);

    const data = written(prisma);
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(data.isActive).toBe(false);
  });

  it('RELEASES the email so the person can register again', async () => {
    const { repo, prisma } = build();
    await repo.softDelete('u1');

    const data = written(prisma);
    expect(data.email).not.toBe(EMAIL);
    expect(String(data.email)).toContain('u1');
  });

  it('moves the address to a domain that can never receive mail', async () => {
    // `.invalid` is reserved by RFC 2606, so a tombstone can never collide with a real
    // user's address and can never be mailed by accident.
    const { repo, prisma } = build();
    await repo.softDelete('u1');
    expect(String(written(prisma).email)).toMatch(/@deleted\.invalid$/);
  });

  it('keeps every tombstone unique by embedding the user id', async () => {
    // A fixed placeholder would let exactly ONE account be deleted — the second would
    // collide on the unique index.
    const a = build();
    await a.repo.softDelete('user-a');
    const b = build();
    await b.repo.softDelete('user-b');

    expect(written(a.prisma).email).not.toEqual(written(b.prisma).email);
  });

  it('retains the original address rather than discarding it', async () => {
    const { repo, prisma } = build();
    await repo.softDelete('u1');
    expect(written(prisma).deletedEmail).toBe(EMAIL);
  });

  it('invalidates the auth caches, which live in a different repository', async () => {
    // Without this the deleted user could still log in for the 300s TTL, because
    // findById serves from Redis and this write never goes through the auth repository.
    const { repo, redis } = build();
    await repo.softDelete('u1');

    const deleted = redis.del.mock.calls.map(([key]) => key);
    expect(deleted).toContain(authCacheKeys.authUserEntity('u1'));
    expect(deleted).toContain(authCacheKeys.safeUserEntity('u1'));
    expect(deleted).toContain(authCacheKeys.authUserEmailLookup(EMAIL));
  });

  it('still reports success when cache invalidation fails', async () => {
    // The account IS deleted; failing the whole operation would leave the caller
    // believing nothing happened when the row has already changed.
    const { repo } = build({ redisThrows: true });
    await expect(repo.softDelete('u1')).resolves.toBe(true);
  });

  describe('when there is nothing to delete', () => {
    it('returns false for an unknown user', async () => {
      const { repo, prisma } = build({ existing: null });
      await expect(repo.softDelete('nope')).resolves.toBe(false);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('returns false for an already-deleted user without re-tombstoning', async () => {
      // The lookup is scoped to `deletedAt: null`, so a second delete finds nothing.
      // That is what protects the saved original from being overwritten by a tombstone.
      const { repo, prisma } = build({ existing: null });
      await expect(repo.softDelete('u1')).resolves.toBe(false);
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('reads scoped to live rows only', async () => {
      const { repo, prisma } = build();
      await repo.softDelete('u1');
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'u1', deletedAt: null }),
        }),
      );
    });
  });
});
