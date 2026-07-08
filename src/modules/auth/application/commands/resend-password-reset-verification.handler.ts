// src/modules/auth/application/commands/resend-password-reset-verification.handler.ts
// Resend password-reset code. Always reports success (enumeration protection).

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResendPasswordResetVerificationCommand } from './resend-password-reset-verification.command';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { AuthDomainService } from '../../domain/services/auth.domain.service';
import { PasswordResetRequestedEvent } from '../../domain/events/password-reset-requested.event';
import {
  PASSWORD_RESET_CODE_TTL_MINUTES,
  VERIFICATION_CODE_LENGTH,
} from '../auth.constants';

@CommandHandler(ResendPasswordResetVerificationCommand)
export class ResendPasswordResetVerificationHandler
  implements ICommandHandler<ResendPasswordResetVerificationCommand>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly authDomain: AuthDomainService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    command: ResendPasswordResetVerificationCommand,
  ): Promise<{ success: true }> {
    const user = await this.userRepo.findByEmail(command.email);
    if (user) {
      const code = this.authDomain.generateNumericCode(VERIFICATION_CODE_LENGTH);
      const expiry = this.authDomain.computeExpiry(
        PASSWORD_RESET_CODE_TTL_MINUTES,
      );
      user.setPasswordResetCode(code, expiry);
      await this.userRepo.save(user);
      this.eventEmitter.emit(
        PasswordResetRequestedEvent.eventName,
        new PasswordResetRequestedEvent(user.id, user.email, code),
      );
    }
    return { success: true };
  }
}
