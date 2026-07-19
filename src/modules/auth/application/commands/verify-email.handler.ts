// src/modules/auth/application/commands/verify-email.handler.ts
// Flow 2 — Email Verification.
//
// On success we also mint a session (access + refresh token), so verifying your
// email logs you straight in — the client can proceed to onboarding without a
// separate login round-trip. Mirrors the token issuance in LoginHandler.

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { v4 as uuidv4 } from 'uuid';
import { VerifyEmailCommand } from './verify-email.command';
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
import { AuthDomainService } from '../../domain/services/auth.domain.service';
import {
  CodeExpiredError,
  EmailAlreadyVerifiedError,
  InvalidCodeError,
} from '../errors/auth.errors';

export interface VerifyEmailResult {
  accessToken: string;
  refreshToken: string; // raw — controller sets it as an httpOnly cookie
}

@CommandHandler(VerifyEmailCommand)
export class VerifyEmailHandler implements ICommandHandler<VerifyEmailCommand> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly tokenService: AuthTokenService,
    private readonly authDomain: AuthDomainService,
  ) {}

  async execute(command: VerifyEmailCommand): Promise<VerifyEmailResult> {
    const user = await this.userRepo.findByEmail(command.email);
    if (!user) throw new InvalidCodeError();
    if (user.isVerified) throw new EmailAlreadyVerifiedError();
    if (user.verificationCode !== command.code) throw new InvalidCodeError();
    if (this.authDomain.isCodeExpired(user.verificationCodeExpiry)) {
      throw new CodeExpiredError();
    }

    user.markVerified();
    // Verifying doubles as the first login — record it so lastLogin is set.
    user.recordLogin();
    await this.userRepo.save(user);

    // Issue the session, exactly as LoginHandler does.
    const { accessToken } = this.tokenService.signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const { refreshToken, expiresAt } = this.tokenService.signRefreshToken(
      user.id,
    );

    const refreshEntity = RefreshTokenEntity.create({
      id: uuidv4(),
      userId: user.id,
      rawToken: refreshToken,
      expiresAt,
    });
    await this.refreshTokenRepo.save(refreshEntity);

    return { accessToken, refreshToken };
  }
}
