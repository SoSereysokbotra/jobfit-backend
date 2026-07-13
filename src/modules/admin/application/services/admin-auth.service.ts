// src/modules/admin/application/services/admin-auth.service.ts
//
// Admin authentication. Rather than reimplement login, it REUSES the auth module's
// CQRS LoginCommand / LogoutCommand (same password check, lockout, token issuance and
// refresh-token rotation) and simply enforces that the authenticated principal is an
// ADMIN — non-admins are rejected with 403 and never receive tokens.

import { ForbiddenException, Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { UserRole } from '@prisma/client';
import { LoginCommand } from '@modules/auth/application/commands/login.command';
import { LogoutCommand } from '@modules/auth/application/commands/logout.command';
import { LoginResult } from '@modules/auth/application/commands/login.handler';

export interface AdminLoginResult {
  accessToken: string;
  refreshToken: string; // raw — controller sets it as an httpOnly cookie
}

@Injectable()
export class AdminAuthService {
  constructor(private readonly commandBus: CommandBus) {}

  /** Authenticate and require the ADMIN role. Throws 403 for non-admins. */
  async login(
    email: string,
    password: string,
    ipAddress: string,
  ): Promise<AdminLoginResult> {
    const result = (await this.commandBus.execute(
      new LoginCommand(email, password, ipAddress),
    )) as LoginResult;

    if (result.user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  /** Log out: revoke the refresh token and blacklist the access token's jti. */
  async logout(
    refreshToken: string | undefined,
    accessToken: string | undefined,
  ): Promise<void> {
    await this.commandBus.execute(new LogoutCommand(refreshToken, accessToken));
  }
}
