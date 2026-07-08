// src/modules/auth/infrastructure/event-handlers/auth-events.listener.ts
//
// Subscribes to auth domain events and sends the corresponding transactional emails via
// the shared EmailService (SMTP). Email failures are swallowed inside EmailService so a
// delivery problem never breaks the auth flow. Requires EventEmitterModule (app.module)
// and this listener registered as a provider in AuthModule.

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailService } from '../../../../shared/services/email.service';
import { UserRegisteredEvent } from '../../domain/events/user-registered.event';
import { PasswordResetRequestedEvent } from '../../domain/events/password-reset-requested.event';
import { PasswordResetSuccessEvent } from '../../domain/events/password-reset-success.event';

@Injectable()
export class AuthEventsListener {
  private readonly logger = new Logger(AuthEventsListener.name);

  constructor(private readonly emailService: EmailService) {}

  @OnEvent(UserRegisteredEvent.eventName)
  async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    this.logger.log(`Sending verification email to ${event.email}`);
    await this.emailService.sendVerificationCode(
      event.email,
      event.verificationCode,
    );
  }

  @OnEvent(PasswordResetRequestedEvent.eventName)
  async handlePasswordResetRequested(
    event: PasswordResetRequestedEvent,
  ): Promise<void> {
    this.logger.log(`Sending password-reset email to ${event.email}`);
    await this.emailService.sendPasswordResetCode(event.email, event.resetCode);
  }

  @OnEvent(PasswordResetSuccessEvent.eventName)
  async handlePasswordResetSuccess(
    event: PasswordResetSuccessEvent,
  ): Promise<void> {
    this.logger.log(`Sending password-reset confirmation to ${event.email}`);
    await this.emailService.sendPasswordResetSuccess(event.email);
  }
}
