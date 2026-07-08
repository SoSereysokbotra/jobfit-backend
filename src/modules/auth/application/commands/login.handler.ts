// src/modules/auth/application/commands/login.handler.ts
// Flow 4 — Login (with lockout, password check, token issuance + refresh persistence).

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { v4 as uuidv4 } from 'uuid';
import { LoginCommand } from './login.command';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from '../../domain/repositories/refresh-token.repository.interface';
import {
  ACCOUNT_LOCKOUT_SERVICE,
  type IAccountLockoutService,
} from '../../domain/services/iaccount-lockout.service.interface';
import { RefreshTokenEntity } from '../../domain/entities/refresh-token.entity';
import { SafeUser } from '../../domain/entities/safe-user.entity';
import { Password } from '../../domain/value-objects/password.value-object';
import { AuthTokenService } from '../../infrastructure/services/auth-token.service';
import {
  EmailNotVerifiedError,
  InvalidCredentialsError,
  LoginBlockedError,
} from '../errors/auth.errors';

export interface LoginResult {
  accessToken: string;
  refreshToken: string; // raw — controller sets it as an httpOnly cookie
  user: SafeUser;
}

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    @Inject(ACCOUNT_LOCKOUT_SERVICE)
    private readonly lockout: IAccountLockoutService,
    private readonly tokenService: AuthTokenService,
  ) {}

  async execute(command: LoginCommand): Promise<LoginResult> {
    const email = command.email.toLowerCase().trim();

    if (await this.lockout.isLocked(email, command.ipAddress)) {
      throw new LoginBlockedError();
    }

    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      await this.lockout.recordFailedAttempt(email, command.ipAddress);
      throw new InvalidCredentialsError();
    }

    const passwordOk = await Password.fromHash(user.passwordHash).compare(
      command.password,
    );
    if (!passwordOk) {
      await this.lockout.recordFailedAttempt(email, command.ipAddress);
      throw new InvalidCredentialsError();
    }

    if (!user.isVerified) {
      throw new EmailNotVerifiedError();
    }

    // Success — clear lockout counters and record the login.
    await this.lockout.clearAttempts(email);
    user.recordLogin();
    await this.userRepo.save(user);

    const { accessToken } = this.tokenService.signAccessToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });
    const { refreshToken, expiresAt } = this.tokenService.signRefreshToken(
      user.id,
    );

    // Hash + store the refresh token (DB + Redis) via the entity.
    const refreshEntity = RefreshTokenEntity.create({
      id: uuidv4(),
      userId: user.id,
      rawToken: refreshToken,
      expiresAt,
    });
    await this.refreshTokenRepo.save(refreshEntity);

    return { accessToken, refreshToken, user: user.toSafe() };
  }
}
