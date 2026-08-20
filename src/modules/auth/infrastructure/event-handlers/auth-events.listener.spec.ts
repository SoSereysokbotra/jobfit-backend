// src/modules/auth/infrastructure/event-handlers/auth-events.listener.spec.ts
//
// EmailService throws on a bounce so no caller mistakes a failure for a send. This
// listener is the one caller that must absorb it: it runs after the user row is already
// committed, so rethrowing would only produce an unhandled rejection. These tests pin
// both halves — the mail is actually requested, and a failure is logged, not propagated.

import { Logger } from '@nestjs/common';
import { EmailService } from '../../../../shared/services/email.service';
import { AuthEventsListener } from './auth-events.listener';
import { UserRegisteredEvent } from '../../domain/events/user-registered.event';
import { PasswordResetRequestedEvent } from '../../domain/events/password-reset-requested.event';
import { PasswordResetSuccessEvent } from '../../domain/events/password-reset-success.event';

describe('AuthEventsListener', () => {
  let emailService: jest.Mocked<
    Pick<
      EmailService,
      | 'sendVerificationCode'
      | 'sendPasswordResetCode'
      | 'sendPasswordResetSuccess'
    >
  >;
  let listener: AuthEventsListener;
  let errorLog: jest.SpyInstance;

  beforeEach(() => {
    emailService = {
      sendVerificationCode: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetCode: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetSuccess: jest.fn().mockResolvedValue(undefined),
    };
    listener = new AuthEventsListener(emailService as unknown as EmailService);
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('sends the verification code carried by UserRegisteredEvent', async () => {
    await listener.handleUserRegistered(
      new UserRegisteredEvent('u1', 'new@example.com', 'New User', '482913'),
    );

    expect(emailService.sendVerificationCode).toHaveBeenCalledWith(
      'new@example.com',
      '482913',
    );
  });

  it('logs, and does not rethrow, when the verification email bounces', async () => {
    emailService.sendVerificationCode.mockRejectedValueOnce(
      new Error('550 mailbox unavailable'),
    );

    await expect(
      listener.handleUserRegistered(
        new UserRegisteredEvent('u1', 'new@example.com', 'New User', '482913'),
      ),
    ).resolves.toBeUndefined();

    const message = errorLog.mock.calls[0][0] as string;
    expect(message).toContain('550 mailbox unavailable');
    // The log must name the user-visible consequence, not just the SMTP error.
    expect(message).toContain('cannot log in');
  });

  it('sends the reset code, and absorbs a failure', async () => {
    await listener.handlePasswordResetRequested(
      new PasswordResetRequestedEvent('u1', 'user@example.com', '111111'),
    );
    expect(emailService.sendPasswordResetCode).toHaveBeenCalledWith(
      'user@example.com',
      '111111',
    );

    emailService.sendPasswordResetCode.mockRejectedValueOnce(new Error('smtp down'));
    await expect(
      listener.handlePasswordResetRequested(
        new PasswordResetRequestedEvent('u1', 'user@example.com', '111111'),
      ),
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
  });

  it('sends the reset confirmation, and absorbs a failure', async () => {
    await listener.handlePasswordResetSuccess(
      new PasswordResetSuccessEvent('u1', 'user@example.com'),
    );
    expect(emailService.sendPasswordResetSuccess).toHaveBeenCalledWith(
      'user@example.com',
    );

    emailService.sendPasswordResetSuccess.mockRejectedValueOnce(
      new Error('smtp down'),
    );
    await expect(
      listener.handlePasswordResetSuccess(
        new PasswordResetSuccessEvent('u1', 'user@example.com'),
      ),
    ).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalled();
  });
});
