// src/modules/auth/application/commands/logout.handler.ts
// Flow 6 — Logout: delete the refresh token, blacklist the access token's jti.

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { LogoutCommand } from './logout.command';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  type ITokenBlacklistService,
  TOKEN_BLACKLIST_SERVICE,
} from '../../domain/services/itoken-blacklist.service.interface';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import { AuthTokenService } from '../../infrastructure/services/auth-token.service';

@CommandHandler(LogoutCommand)
export class LogoutHandler implements ICommandHandler<LogoutCommand> {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    @Inject(TOKEN_BLACKLIST_SERVICE)
    private readonly tokenBlacklist: ITokenBlacklistService,
    private readonly tokenService: AuthTokenService,
  ) {}

  async execute(command: LogoutCommand): Promise<{ success: true }> {
    // Remove the current refresh token from the DB (deleteById also clears its cache).
    if (command.refreshToken) {
      const hash = RefreshTokenEntity.hash(command.refreshToken);
      const token = await this.refreshTokenRepo.findByHash(hash);
      if (token) {
        await this.refreshTokenRepo.deleteById(token.id);
      }
    }

    // Blacklist the access token's jti for its remaining lifetime.
    if (command.accessToken) {
      const decoded = this.tokenService.decodeAccessToken(command.accessToken);
      if (decoded?.jti && decoded.exp) {
        const remaining = decoded.exp - Math.floor(Date.now() / 1000);
        if (remaining > 0) {
          await this.tokenBlacklist.blacklist(decoded.jti, remaining);
        }
      }
    }

    return { success: true };
  }
}
