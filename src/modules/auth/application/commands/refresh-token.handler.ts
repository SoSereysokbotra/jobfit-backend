// src/modules/auth/application/commands/refresh-token.handler.ts
// Flow 5 — Token refresh with single-use rotation + theft detection.

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { v4 as uuidv4 } from 'uuid';
import { RefreshTokenCommand } from './refresh-token.command';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import { AuthTokenService } from '../../infrastructure/services/auth-token.service';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseDetectedError,
} from '../errors/auth.errors';

export interface RefreshResult {
  accessToken: string;
  refreshToken: string; // new raw token — controller replaces the cookie
}

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler
  implements ICommandHandler<RefreshTokenCommand>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly tokenService: AuthTokenService,
  ) {}

  async execute(command: RefreshTokenCommand): Promise<RefreshResult> {
    // 1. verify signature/expiry (JWT `exp` covers natural expiry)
    let payload;
    try {
      payload = this.tokenService.verifyRefreshToken(command.refreshToken);
    } catch {
      throw new InvalidRefreshTokenError();
    }

    // 2. resolve the user
    const user = await this.userRepo.findById(payload.sub);
    if (!user) throw new InvalidRefreshTokenError();

    // 3. sign the replacement tokens (discarded if rotation doesn't happen)
    const oldHash = RefreshTokenEntity.hash(command.refreshToken);
    const { accessToken } = this.tokenService.signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const { refreshToken: newRaw, expiresAt } =
      this.tokenService.signRefreshToken(user.id);
    const newEntity = RefreshTokenEntity.create({
      id: uuidv4(),
      userId: user.id,
      rawToken: newRaw,
      expiresAt,
    });

    // 4. atomic rotation with theft detection
    const outcome = await this.refreshTokenRepo.rotate(
      oldHash,
      user.id,
      newEntity,
    );

    if (outcome === 'reuse') {
      // A spent (already-rotated) token was replayed — treat as theft: revoke ALL of
      // the user's sessions, then surface a distinct security error.
      await this.refreshTokenRepo.deleteAllForUser(user.id);
      throw new RefreshTokenReuseDetectedError();
    }
    if (outcome === 'not_found') {
      throw new InvalidRefreshTokenError();
    }

    return { accessToken, refreshToken: newRaw };
  }
}
