// src/modules/auth/infrastructure/event-handlers/auth-events.listener.ts
//
// Subscribes to auth domain events and sends the corresponding transactional emails via
// the shared EmailService (SMTP). Requires EventEmitterModule (registered globally by
// EventBusModule) and this listener registered as a provider in AuthModule.
//
// EmailService throws on a delivery failure so callers cannot mistake a bounce for a
// send. THIS listener is the one caller that must not propagate: it runs off an event
// emitted after the user row is already committed, so rethrowing would surface as an
// unhandled rejection without undoing anything. We swallow it HERE, loudly and at error
// level, naming the user-visible consequence — the code can still be re-requested via
// POST /auth/resend-email-verification.

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
    await this.deliver(
      () =>
        this.emailService.sendVerificationCode(
          event.email,
          event.verificationCode,
        ),
      `verification code to ${event.email}`,
      'that user cannot verify and therefore cannot log in until they resend',
    );
  }

  @OnEvent(PasswordResetRequestedEvent.eventName)
  async handlePasswordResetRequested(
    event: PasswordResetRequestedEvent,
  ): Promise<void> {
    this.logger.log(`Sending password-reset email to ${event.email}`);
    await this.deliver(
      () => this.emailService.sendPasswordResetCode(event.email, event.resetCode),
      `password-reset code to ${event.email}`,
      'that user cannot complete the reset until they request a new code',
    );
  }

  @OnEvent(PasswordResetSuccessEvent.eventName)
  async handlePasswordResetSuccess(
    event: PasswordResetSuccessEvent,
  ): Promise<void> {
    this.logger.log(`Sending password-reset confirmation to ${event.email}`);
    await this.deliver(
      () => this.emailService.sendPasswordResetSuccess(event.email),
      `password-reset confirmation to ${event.email}`,
      'the reset itself succeeded; only the notification was lost',
    );
  }

  /** Run a send, converting a throw into an error log that states what the user loses. */
  private async deliver(
    send: () => Promise<void>,
    what: string,
    consequence: string,
  ): Promise<void> {
    try {
      await send();
    } catch (err) {
      this.logger.error(
        `Failed to deliver ${what}: ${(err as Error).message} — ${consequence}.`,
        (err as Error).stack,
      );
    }
  }
}
