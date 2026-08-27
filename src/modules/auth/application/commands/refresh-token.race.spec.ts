// src/modules/auth/application/commands/refresh-token.race.spec.ts
//
// INTEGRATION test (hits the real DATABASE_URL), companion to
// refresh-token.handler.spec.ts. That file proves theft detection still bites; this one
// proves it does NOT bite the honest user.
//
// Two legitimate refreshes can hit one cookie at the same moment (two open tabs, a
// retried request). Both carry the SAME token, exactly one can win the rotation, and
// before the grace window the loser was indistinguishable from an attacker — so the
// theft response wiped every session and logged the user out of everything. These tests
// pin the corrected behaviour:
//   1. concurrent rotation leaves the user logged in, with a live token,
//   2. the loser gets RefreshTokenRaceError (retryable), never a session wipe,
//   3. a replay OUTSIDE the grace window is still theft and still wipes everything.

import 'dotenv/config';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { RefreshTokenHandler } from './refresh-token.handler';
import { RefreshTokenCommand } from './refresh-token.command';
import { UserRepository } from '../../infrastructure/persistence/user.repository';
import { RefreshTokenRepository } from '../../infrastructure/persistence/refresh-token.repository';
import { AuthTokenService } from '../../infrastructure/services/auth-token.service';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import { REFRESH_ROTATION_GRACE_SECONDS } from '../auth.constants';
import {
  RefreshTokenRaceError,
  RefreshTokenReuseDetectedError,
} from '../errors/auth.errors';

jest.setTimeout(30000);

// No-op Redis — cache is fail-open and irrelevant here; the race verdict is decided
// entirely in the DB from `revokedAt`.
const noopRedis = {
  get: async () => null,
  set: async () => undefined,
  del: async () => undefined,
  deleteByPrefix: async () => undefined,
} as any;

const config = {
  get: (k: string) =>
    k === 'JWT_SECRET' || k === 'JWT_REFRESH_SECRET' ? 'test-secret' : undefined,
} as any;

describe('RefreshTokenHandler — concurrent rotation is a race, not theft (integration)', () => {
  const prisma = new PrismaClient();
  const tokenService = new AuthTokenService(new JwtService({}), config);
  const refreshRepo = new RefreshTokenRepository(prisma as any, noopRedis);
  const handler = new RefreshTokenHandler(
    new UserRepository(prisma as any, noopRedis) as any,
    refreshRepo as any,
    tokenService,
  );

  const userId = randomUUID();
  const email = `race_${Date.now()}@example.com`;

  /** Issue + persist a live refresh token for the user, from a clean slate. */
  const seedLiveToken = async (): Promise<string> => {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    const issued = tokenService.signRefreshToken(userId);
    await refreshRepo.save(
      RefreshTokenEntity.create({
        id: randomUUID(),
        userId,
        rawToken: issued.refreshToken,
        expiresAt: issued.expiresAt,
      }),
    );
    return issued.refreshToken;
  };

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        email,
        name: 'Race Test',
        passwordHash: 'hash',
        emailVerified: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('keeps the session alive when two refreshes race on the same token', async () => {
    const token = await seedLiveToken();

    const results = await Promise.allSettled([
      handler.execute(new RefreshTokenCommand(token)),
      handler.execute(new RefreshTokenCommand(token)),
    ]);

    // Exactly one winner, and it really did mint a usable session.
    const winners = results.filter((r) => r.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    const winner = (winners[0] as PromiseFulfilledResult<any>).value;
    expect(typeof winner.accessToken).toBe('string');
    expect(winner.refreshToken).not.toBe(token);

    // The loser is told to retry — NOT accused of theft.
    const losers = results.filter((r) => r.status === 'rejected');
    expect(losers).toHaveLength(1);
    const reason = (losers[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(RefreshTokenRaceError);
    expect(reason).not.toBeInstanceOf(RefreshTokenReuseDetectedError);

    // THE REGRESSION THIS FILE EXISTS FOR: the user is still logged in. Before the fix
    // this was 0 — the race wiped every session on both devices.
    const live = await prisma.refreshToken.count({
      where: { userId, revokedAt: null },
    });
    expect(live).toBe(1);
  });

  it('lets the loser retry successfully with the winning token', async () => {
    const token = await seedLiveToken();

    const winner = await handler.execute(new RefreshTokenCommand(token));
    // The loser replays the spent token and is refused, without damage.
    await expect(
      handler.execute(new RefreshTokenCommand(token)),
    ).rejects.toBeInstanceOf(RefreshTokenRaceError);

    // It then retries with the cookie the winner set — which must still work. This is
    // what makes the race invisible to the user.
    const retried = await handler.execute(
      new RefreshTokenCommand(winner.refreshToken),
    );
    expect(typeof retried.accessToken).toBe('string');
    expect(
      await prisma.refreshToken.count({ where: { userId, revokedAt: null } }),
    ).toBe(1);
  });

  it('still treats a replay OUTSIDE the grace window as theft and wipes every session', async () => {
    const token = await seedLiveToken();
    await handler.execute(new RefreshTokenCommand(token));

    // Age the spent row past the grace window — a stolen token replayed later, which is
    // the case theft detection must keep catching.
    await prisma.refreshToken.updateMany({
      where: { userId, revokedAt: { not: null } },
      data: {
        revokedAt: new Date(
          Date.now() - (REFRESH_ROTATION_GRACE_SECONDS + 5) * 1000,
        ),
      },
    });

    await expect(
      handler.execute(new RefreshTokenCommand(token)),
    ).rejects.toBeInstanceOf(RefreshTokenReuseDetectedError);

    expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);
  });
});
