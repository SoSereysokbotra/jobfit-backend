// src/modules/auth/application/commands/resend-email-verification.handler.ts
// Resend verification code. Always reports success (email-enumeration protection).

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResendEmailVerificationCommand } from './resend-email-verification.command';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { AuthDomainService } from '../../domain/services/auth.domain.service';
import { UserRegisteredEvent } from '../../domain/events/user-registered.event';
import {
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_CODE_TTL_MINUTES,
} from '../auth.constants';

@CommandHandler(ResendEmailVerificationCommand)
export class ResendEmailVerificationHandler
  implements ICommandHandler<ResendEmailVerificationCommand>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly authDomain: AuthDomainService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    command: ResendEmailVerificationCommand,
  ): Promise<{ success: true }> {
    const user = await this.userRepo.findByEmail(command.email);
    // Only regenerate for an existing, still-unverified account.
    if (user && !user.isVerified) {
      const code = this.authDomain.generateNumericCode(VERIFICATION_CODE_LENGTH);
      const expiry = this.authDomain.computeExpiry(VERIFICATION_CODE_TTL_MINUTES);
      user.setVerificationCode(code, expiry);
      await this.userRepo.save(user);
      this.eventEmitter.emit(
        UserRegisteredEvent.eventName,
        new UserRegisteredEvent(user.id, user.email, user.name, code),
      );
    }
    // Never reveal whether the email exists.
    return { success: true };
  }
}
