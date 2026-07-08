// src/modules/auth/application/commands/reset-password.handler.ts
// Flow 3 step 3 — Reset password. Atomically updates the password AND revokes all
// refresh tokens (via userRepo.resetPassword), then emits PasswordResetSuccess.

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ResetPasswordCommand } from './reset-password.command';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../domain/repositories/user.repository.interface';
import { AuthDomainService } from '../../domain/services/auth.domain.service';
import { Password } from '../../domain/value-objects/password.value-object';
import { PasswordResetSuccessEvent } from '../../domain/events/password-reset-success.event';
import { UserNotFoundError, WeakPasswordError } from '../errors/auth.errors';

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler
  implements ICommandHandler<ResetPasswordCommand>
{
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly authDomain: AuthDomainService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: ResetPasswordCommand): Promise<{ success: true }> {
    const policy = this.authDomain.validatePasswordPolicy(command.newPassword);
    if (!policy.valid) throw new WeakPasswordError(policy.errors);

    const user = await this.userRepo.findByEmail(command.email);
    if (!user) throw new UserNotFoundError();

    const passwordHash = (await Password.fromPlain(command.newPassword)).value;
    user.changePassword(passwordHash); // sets hash + clears reset code

    // Atomic: persist new password AND delete every refresh token for this user.
    await this.userRepo.resetPassword(user);

    this.eventEmitter.emit(
      PasswordResetSuccessEvent.eventName,
      new PasswordResetSuccessEvent(user.id, user.email),
    );
    return { success: true };
  }
}
