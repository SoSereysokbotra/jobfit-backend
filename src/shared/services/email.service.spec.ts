// src/shared/services/email.service.spec.ts
//
// Covers the two rules that make email delivery a critical path rather than a stub:
//   1. production + no SMTP config  => boot throws (no unverifiable registrations)
//   2. a send failure               => throws, so no caller mistakes a bounce for a send
// Plus the readiness snapshot the mail health indicator reads.
//
// And the suppression gate (Redis audit R3): the list was written but the sender never
// read it, so these tests exist to keep the sender reading it.

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailService } from './email.service';
import {
  EmailSuppressedError,
  EmailSuppressionService,
  SuppressionCheckUnavailableError,
} from './email-suppression.service';

jest.mock('nodemailer');

const mockedNodemailer = nodemailer as jest.Mocked<typeof nodemailer>;

/** ConfigService stand-in backed by a plain map. */
function configOf(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

const SMTP_ENV = {
  EMAIL_HOST: 'smtp.example.com',
  EMAIL_PORT: '587',
  EMAIL_USER: 'bot@example.com',
  EMAIL_PASS: 'app-password',
  SMTP_FROM: 'no-reply@example.com',
};

describe('EmailService', () => {
  let sendMail: jest.Mock;
  let verify: jest.Mock;
  let assertSendable: jest.Mock;
  let suppression: EmailSuppressionService;

  beforeEach(() => {
    jest.clearAllMocks();
    sendMail = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
    verify = jest.fn().mockResolvedValue(true);
    assertSendable = jest.fn().mockResolvedValue(undefined);
    suppression = { assertSendable } as unknown as EmailSuppressionService;
    mockedNodemailer.createTransport.mockReturnValue({
      sendMail,
      verify,
    } as unknown as ReturnType<typeof nodemailer.createTransport>);
    // Silence the expected warn/error logs on the unconfigured and failure paths.
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  describe('startup guard', () => {
    it('throws on boot when NODE_ENV=production and SMTP is not configured', () => {
      const service = new EmailService(configOf({ NODE_ENV: 'production' }), suppression);

      expect(() => service.onModuleInit()).toThrow(
        /Email delivery is not configured/,
      );
      expect(mockedNodemailer.createTransport).not.toHaveBeenCalled();
    });

    it.each(['EMAIL_HOST', 'EMAIL_USER', 'EMAIL_PASS'])(
      'throws in production when only %s is missing',
      (missing) => {
        const env: Record<string, string | undefined> = {
          NODE_ENV: 'production',
          ...SMTP_ENV,
        };
        delete env[missing];

        expect(() => new EmailService(configOf(env), suppression).onModuleInit()).toThrow(
          /Email delivery is not configured/,
        );
      },
    );

    it('boots and skips sends in development when SMTP is not configured', async () => {
      const service = new EmailService(configOf({ NODE_ENV: 'development' }), suppression);

      expect(() => service.onModuleInit()).not.toThrow();
      expect(service.isConfigured).toBe(false);
      // The skip must not throw — the test suite runs without a mail server.
      await expect(
        service.sendVerificationCode('user@example.com', '123456'),
      ).resolves.toBeUndefined();
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('builds the transport and boots when SMTP is configured in production', () => {
      const service = new EmailService(
        configOf({ NODE_ENV: 'production', ...SMTP_ENV }),
        suppression,
      );

      expect(() => service.onModuleInit()).not.toThrow();
      expect(service.isConfigured).toBe(true);
      expect(mockedNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          auth: { user: 'bot@example.com', pass: 'app-password' },
        }),
      );
    });

    it('uses implicit TLS on port 465', () => {
      const service = new EmailService(
        configOf({ NODE_ENV: 'production', ...SMTP_ENV, EMAIL_PORT: '465' }),
        suppression,
      );
      service.onModuleInit();

      expect(mockedNodemailer.createTransport).toHaveBeenCalledWith(
        expect.objectContaining({ port: 465, secure: true }),
      );
    });
  });

  describe('delivery', () => {
    let service: EmailService;

    beforeEach(() => {
      service = new EmailService(
        configOf({ NODE_ENV: 'production', ...SMTP_ENV }),
        suppression,
      );
      service.onModuleInit();
    });

    it('sends the verification code and includes it in both bodies', async () => {
      await service.sendVerificationCode('user@example.com', '482913');

      expect(sendMail).toHaveBeenCalledTimes(1);
      const mail = sendMail.mock.calls[0][0];
      expect(mail).toMatchObject({
        from: 'no-reply@example.com',
        to: 'user@example.com',
        subject: 'Verify your email address',
      });
      expect(mail.text).toContain('482913');
      expect(mail.html).toContain('482913');
    });

    it('throws when the transport rejects, rather than reporting success', async () => {
      sendMail.mockRejectedValueOnce(new Error('550 mailbox unavailable'));

      await expect(
        service.sendVerificationCode('user@example.com', '482913'),
      ).rejects.toThrow('550 mailbox unavailable');
      expect(service.getStatus().lastError).toBe('550 mailbox unavailable');
    });

    it('records the last send in the readiness snapshot', async () => {
      await service.sendPasswordResetCode('user@example.com', '111111');

      const status = service.getStatus();
      expect(status.configured).toBe(true);
      expect(status.host).toBe('smtp.example.com');
      expect(status.lastSentAt).toBeDefined();
      expect(status.lastError).toBeUndefined();
    });
  });

  describe('suppression gate (R3)', () => {
    let service: EmailService;

    beforeEach(() => {
      service = new EmailService(
        configOf({ NODE_ENV: 'production', ...SMTP_ENV }),
        suppression,
      );
      service.onModuleInit();
    });

    it('never sends to a suppressed address', async () => {
      assertSendable.mockRejectedValueOnce(
        new EmailSuppressedError('bounced@example.com'),
      );

      await expect(
        service.sendVerificationCode('bounced@example.com', '482913'),
      ).resolves.toBeUndefined();

      // The point of the whole finding: the transport is never reached.
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('consults the list on every send path, not just one of them', async () => {
      await service.sendVerificationCode('a@example.com', '111111');
      await service.sendPasswordResetCode('b@example.com', '222222');
      await service.sendPasswordResetSuccess('c@example.com');

      expect(assertSendable.mock.calls.map((c) => c[0])).toEqual([
        'a@example.com',
        'b@example.com',
        'c@example.com',
      ]);
      expect(sendMail).toHaveBeenCalledTimes(3);
    });

    it('checks suppression BEFORE the transport, so an unconfigured mailer cannot mask a missing gate', async () => {
      const unconfigured = new EmailService(
        configOf({ NODE_ENV: 'development' }),
        suppression,
      );
      unconfigured.onModuleInit();

      await unconfigured.sendVerificationCode('user@example.com', '482913');

      expect(assertSendable).toHaveBeenCalledWith('user@example.com');
    });

    it('fails closed when the list cannot be read, rather than sending anyway', async () => {
      assertSendable.mockRejectedValueOnce(
        new SuppressionCheckUnavailableError('connection terminated'),
      );

      await expect(
        service.sendVerificationCode('user@example.com', '482913'),
      ).rejects.toBeInstanceOf(SuppressionCheckUnavailableError);
      expect(sendMail).not.toHaveBeenCalled();
    });

    it('sends normally when the address is not suppressed', async () => {
      await service.sendVerificationCode('fine@example.com', '482913');

      expect(sendMail).toHaveBeenCalledTimes(1);
      expect(sendMail.mock.calls[0][0]).toMatchObject({
        to: 'fine@example.com',
      });
    });
  });

  describe('verifyConnection', () => {
    it('reports false and records the reason when the handshake fails', async () => {
      // Not `Once`: onModuleInit already fires one background handshake.
      verify.mockRejectedValue(new Error('535 bad credentials'));
      const service = new EmailService(
        configOf({ NODE_ENV: 'production', ...SMTP_ENV }),
        suppression,
      );
      service.onModuleInit();

      await expect(service.verifyConnection()).resolves.toBe(false);
      expect(service.getStatus()).toMatchObject({
        verified: false,
        lastError: '535 bad credentials',
      });
    });

    it('reports false when there is no transport at all', async () => {
      const service = new EmailService(configOf({ NODE_ENV: 'development' }), suppression);
      service.onModuleInit();

      await expect(service.verifyConnection()).resolves.toBe(false);
      expect(service.getStatus().configured).toBe(false);
    });
  });
});
