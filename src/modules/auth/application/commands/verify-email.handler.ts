// src/modules/auth/application/commands/verify-email.handler.ts
// Flow 2 — Email Verification.

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { VerifyEmailCommand } from './verify-email.command';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { AuthDomainService } from '../../domain/services/auth.domain.service';
import {
  CodeExpiredError,
  EmailAlreadyVerifiedError,
  InvalidCodeError,
} from '../errors/auth.errors';

@CommandHandler(VerifyEmailCommand)
export class VerifyEmailHandler implements ICommandHandler<VerifyEmailCommand> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly authDomain: AuthDomainService,
  ) {}

  async execute(command: VerifyEmailCommand): Promise<{ success: true }> {
    const user = await this.userRepo.findByEmail(command.email);
    if (!user) throw new InvalidCodeError();
    if (user.isVerified) throw new EmailAlreadyVerifiedError();
    if (user.verificationCode !== command.code) throw new InvalidCodeError();
    if (this.authDomain.isCodeExpired(user.verificationCodeExpiry)) {
      throw new CodeExpiredError();
    }

    user.markVerified();
    await this.userRepo.save(user);
    return { success: true };
  }
}
