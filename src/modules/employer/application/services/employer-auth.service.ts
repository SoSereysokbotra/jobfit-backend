// src/modules/employer/application/services/employer-auth.service.ts
//
// Employer portal authentication. Mirrors AdminAuthService exactly: it REUSES the auth
// module's CQRS LoginCommand (same password check, same Redis lockout, same token issuance
// and refresh rotation) and only enforces the role on top.
//
// Why a separate portal at all: role enforcement for the employer area is otherwise
// CLIENT-SIDE ONLY (`useRequireAuth({ roles: ["EMPLOYER"] })` in the layout). That guard
// stays, but it stops being the only check.

import { ForbiddenException, Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { UserRole } from '@prisma/client';
import { LoginCommand } from '@modules/auth/application/commands/login.command';
import { LogoutCommand } from '@modules/auth/application/commands/logout.command';
import { LoginResult } from '@modules/auth/application/commands/login.handler';

export interface EmployerLoginResult {
  accessToken: string;
  refreshToken: string; // raw — the controller sets it as an httpOnly cookie
}

@Injectable()
export class EmployerAuthService {
  constructor(private readonly commandBus: CommandBus) {}

  /**
   * Authenticate and require the EMPLOYER role.
   *
   * The message names the other portal on purpose. A job seeker who lands here has done
   * nothing wrong and has somewhere to go — "access denied" would leave them guessing,
   * and this is a mistake real users make when a company shares one link internally.
   *
   * A wrong password is still a flat 401 from the login command: this branch is reached
   * only AFTER the credentials were correct, so it reveals nothing about which addresses
   * exist that the caller did not already prove they control.
   */
  async login(
    email: string,
    password: string,
    ipAddress: string,
  ): Promise<EmployerLoginResult> {
    const result = (await this.commandBus.execute(
      new LoginCommand(email, password, ipAddress),
    )) as LoginResult;

    if (result.user.role !== UserRole.EMPLOYER) {
      throw new ForbiddenException(
        result.user.role === UserRole.JOB_SEEKER
          ? 'This is a job seeker account. Please use the main sign-in page.'
          : 'Employer access required.',
      );
    }

    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  async logout(
    refreshToken: string | undefined,
    accessToken: string | undefined,
  ): Promise<void> {
    await this.commandBus.execute(new LogoutCommand(refreshToken, accessToken));
  }
}
