// src/modules/auth/application/commands/verify-password-reset.handler.ts
// Flow 3 step 2 — Verify password-reset code, then consume it (clear from DB).

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { VerifyPasswordResetCommand } from './verify-password-reset.command';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { AuthDomainService } from '../../domain/services/auth.domain.service';
import { CodeExpiredError, InvalidCodeError } from '../errors/auth.errors';

@CommandHandler(VerifyPasswordResetCommand)
export class VerifyPasswordResetHandler
  implements ICommandHandler<VerifyPasswordResetCommand>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly authDomain: AuthDomainService,
  ) {}

  async execute(
    command: VerifyPasswordResetCommand,
  ): Promise<{ success: true }> {
    const user = await this.userRepo.findByEmail(command.email);
    if (!user) throw new InvalidCodeError();
    if (user.passwordResetCode !== command.code) throw new InvalidCodeError();
    if (this.authDomain.isCodeExpired(user.passwordResetCodeExpiry)) {
      throw new CodeExpiredError();
    }

    // Consume the code — authorisation to actually reset now rests on the session cookie.
    user.clearPasswordResetCode();
    await this.userRepo.save(user);
    return { success: true };
  }
}
