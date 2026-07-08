// src/modules/auth/application/commands/request-password-reset.handler.ts
// Flow 3 step 1 — Request password reset. Always reports success (enumeration protection).

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RequestPasswordResetCommand } from './request-password-reset.command';
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

@CommandHandler(RequestPasswordResetCommand)
export class RequestPasswordResetHandler
  implements ICommandHandler<RequestPasswordResetCommand>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly authDomain: AuthDomainService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(
    command: RequestPasswordResetCommand,
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
