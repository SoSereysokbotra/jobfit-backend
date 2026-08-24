// A deleted account must not be able to authenticate — from ANY source, including cache.
//
// MENTOR_REVIEW_2026-08-18 §14. `UserRepository.delete` sets `deletedAt`; `LoginHandler`
// checks lockout, password and isVerified and never `deletedAt`, and neither did any
// lookup here. A deleted account kept working indefinitely.
//
// The cache tests are the ones that matter most. `findById` serves from Redis for 300s
// and the entry was written while the user was still live, so a `deletedAt: null` filter
// in SQL alone leaves a five-minute window where a deleted account still logs in.

import { UserRepository } from './user.repository';
import { authCacheKeys } from './auth-cache.keys';

const NOW = new Date('2026-08-20T00:00:00Z');

function props(over: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    email: 'someone@example.com',
    name: 'Someone',
    passwordHash: 'hash',
    role: 'JOB_SEEKER',
    isVerified: true,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
    ...over,
  };
}

/** A repository over stub Prisma/Redis; `cache` seeds what Redis will return. */
function build(over: { row?: Record<string, unknown> | null; cache?: Record<string, string> } = {}) {
  const row = 'row' in over ? over.row : props();
  const store = over.cache ?? {};

  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(row ?? null),
      findFirst: jest.fn().mockResolvedValue(row ?? null),
    },
  };
  const redis = {
    get: jest.fn(async (key: string) => store[key] ?? null),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    deleteByPrefix: jest.fn(),
  };

  return {
    repo: new UserRepository(prisma as never, redis as never),
    prisma,
    redis,
  };
}

describe('UserRepository — a deleted account is not an account', () => {
  it('returns the user when the account is live', () => {
    const { repo } = build();
    return expect(repo.findByEmail('someone@example.com')).resolves.not.toBeNull();
  });

  it('returns null from findById when the row is soft-deleted', async () => {
    const { repo } = build({ row: props({ deletedAt: NOW }) });
    await expect(repo.findById('u1')).resolves.toBeNull();
  });

  it('returns null from findByEmail when the row is soft-deleted', async () => {
    // This is the login path. Before the fix it returned the user, and LoginHandler
    // happily checked their password and issued tokens.
    const { repo } = build({ row: props({ deletedAt: NOW }) });
    await expect(repo.findByEmail('someone@example.com')).resolves.toBeNull();
  });

  it('returns null for a deactivated account even when it is not deleted', async () => {
    // An admin can deactivate without deleting, and login never checked isActive either.
    const { repo } = build({ row: props({ isActive: false }) });
    await expect(repo.findByEmail('someone@example.com')).resolves.toBeNull();
  });

  describe('the cached path — where a SQL-only filter would have leaked', () => {
    it('refuses a CACHED entity that is soft-deleted', async () => {
      // The entry was cached while the user was live; the row was then deleted. Serving
      // it would authenticate a deleted account for up to the 300s TTL.
      const cached = JSON.stringify(props({ deletedAt: NOW.toISOString() }));
      const { repo, prisma } = build({
        cache: { [authCacheKeys.authUserEntity('u1')]: cached },
      });

      await expect(repo.findById('u1')).resolves.toBeNull();
      // Proves the answer came from the cache branch, not from the database.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('refuses a CACHED entity that is deactivated', async () => {
      const cached = JSON.stringify(props({ isActive: false }));
      const { repo } = build({
        cache: { [authCacheKeys.authUserEntity('u1')]: cached },
      });
      await expect(repo.findById('u1')).resolves.toBeNull();
    });

    it('still serves a cached entity that is live', async () => {
      const cached = JSON.stringify(props());
      const { repo, prisma } = build({
        cache: { [authCacheKeys.authUserEntity('u1')]: cached },
      });

      await expect(repo.findById('u1')).resolves.not.toBeNull();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('does not resurrect a deleted user through the email→id lookup', async () => {
      // findByEmail can resolve an id from cache and then call findById. Both hops have
      // to refuse, or the indirection becomes a bypass.
      const { repo } = build({
        row: props({ deletedAt: NOW }),
        cache: {
          [authCacheKeys.authUserEmailLookup('someone@example.com')]: 'u1',
          [authCacheKeys.authUserEntity('u1')]: JSON.stringify(
            props({ deletedAt: NOW.toISOString() }),
          ),
        },
      });
      await expect(repo.findByEmail('someone@example.com')).resolves.toBeNull();
    });
  });

  describe('code lookups — the routes that could revive a deleted account', () => {
    it('will not find a deleted user by password-reset code', async () => {
      // §3 traced the escalation chain through request-password-reset. A deleted account
      // must not be reachable by it.
      const { repo, prisma } = build();
      await repo.findByPasswordResetCode('123456');
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('will not find a deleted user by verification code', async () => {
      const { repo, prisma } = build();
      await repo.findByVerificationCode('123456');
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });
  });

  describe('existsByEmail — deliberately NOT filtered', () => {
    it('reports an address as taken while any row still holds it', async () => {
      // It answers a question about the UNIQUE INDEX, not about who may log in. Filtering
      // `deletedAt` here would turn a clean "already registered" into a 500 at the
      // constraint. Re-registration works because soft delete RELEASES the address.
      const { repo, prisma } = build({ row: props({ deletedAt: NOW }) });

      await expect(repo.existsByEmail('someone@example.com')).resolves.toBe(true);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ deletedAt: null }),
        }),
      );
    });

    it('reports a free address as free', async () => {
      const { repo } = build({ row: null });
      await expect(repo.existsByEmail('nobody@example.com')).resolves.toBe(false);
    });
  });
});
