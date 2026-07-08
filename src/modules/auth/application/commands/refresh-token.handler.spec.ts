// src/modules/auth/application/commands/refresh-token.handler.spec.ts
//
// INTEGRATION test (hits the real DATABASE_URL). Redis is stubbed with a no-op — cache
// is fail-open and irrelevant to theft detection, which lives entirely in the DB via the
// `revokedAt` soft-delete column. Confirms:
//   1. rotating a token once succeeds,
//   2. replaying the same original token is detected as reuse (RefreshTokenReuseDetectedError),
//   3. and the reuse response actually WIPES every refresh token for that user in the DB,
//   4. a validly-signed but unknown token is a routine InvalidRefreshTokenError (not reuse).

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
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseDetectedError,
} from '../errors/auth.errors';

jest.setTimeout(30000);

// No-op Redis so cache ops are inert (fail-open path).
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

describe('RefreshTokenHandler — rotation theft detection (integration)', () => {
  const prisma = new PrismaClient();
  const tokenService = new AuthTokenService(new JwtService({}), config);
  const userRepo = new UserRepository(prisma as any, noopRedis);
  const refreshRepo = new RefreshTokenRepository(prisma as any, noopRedis);
  const handler = new RefreshTokenHandler(
    userRepo as any,
    refreshRepo as any,
    tokenService,
  );

  const userId = randomUUID();
  const email = `theft_${Date.now()}@example.com`;

  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: userId,
        email,
        name: 'Theft Test',
        passwordHash: 'hash',
        emailVerified: true,
      },
    });
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('rotates once, detects replay as reuse, and wipes all of the user\'s tokens', async () => {
    // Issue + persist an initial refresh token.
    const first = tokenService.signRefreshToken(userId);
    await refreshRepo.save(
      RefreshTokenEntity.create({
        id: randomUUID(),
        userId,
        rawToken: first.refreshToken,
        expiresAt: first.expiresAt,
      }),
    );

    // 1) First rotation succeeds.
    const rotated = await handler.execute(
      new RefreshTokenCommand(first.refreshToken),
    );
    expect(typeof rotated.accessToken).toBe('string');
    expect(typeof rotated.refreshToken).toBe('string');
    expect(rotated.refreshToken).not.toBe(first.refreshToken);

    // After rotation: old token soft-revoked + new token live => 2 rows.
    expect(await prisma.refreshToken.count({ where: { userId } })).toBe(2);

    // 2) Replaying the ORIGINAL token is reuse -> RefreshTokenReuseDetectedError.
    await expect(
      handler.execute(new RefreshTokenCommand(first.refreshToken)),
    ).rejects.toBeInstanceOf(RefreshTokenReuseDetectedError);

    // 3) The wipe actually happened: zero refresh tokens remain for the user.
    expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);
  });

  it('treats a validly-signed but unknown token as InvalidRefreshTokenError (not reuse)', async () => {
    const unknown = tokenService.signRefreshToken(userId); // signed, never stored
    await expect(
      handler.execute(new RefreshTokenCommand(unknown.refreshToken)),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    // no rows were created
    expect(await prisma.refreshToken.count({ where: { userId } })).toBe(0);
  });
});
