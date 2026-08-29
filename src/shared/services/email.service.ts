// src/shared/services/email.service.ts
//
// SMTP email delivery (nodemailer) for verification / password-reset codes.
// Config comes from EMAIL_HOST/EMAIL_PORT/EMAIL_USER/EMAIL_PASS/SMTP_FROM (see .env.example).
//
// DELIVERY IS A CRITICAL PATH, NOT A NICE-TO-HAVE. Login refuses unverified accounts
// (login.handler.ts), and the only way to verify is the code in this email — so an
// unconfigured mailer in production means no new user can ever sign in. Two rules follow:
//
//   1. FAIL TO BOOT in production when SMTP is not configured. Accepting registrations we
//      cannot complete is worse than refusing to start. Dev/test still fail open (skip +
//      warn) so nobody needs an SMTP server to run the suite.
//   2. `send()` THROWS on a delivery failure. Swallowing it here would make every caller
//      believe the mail went out. Callers that must not break on a bounce (the auth event
//      listener) catch it themselves, visibly.
//
// Delivery state (configured / verified / last error) is exposed for the readiness probe
// via MailHealthIndicator.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface MailBody {
  text: string;
  html: string;
}

/** Snapshot of transport state, for the readiness probe. */
export interface MailTransportStatus {
  configured: boolean;
  host?: string;
  /** Result of the last SMTP handshake; undefined until the boot-time check resolves. */
  verified?: boolean;
  lastError?: string;
  lastSentAt?: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter?: Transporter;
  private from = '';
  /**
   * Where the app lives, for links in email.
   *
   * Only the employer flows need this. Every seeker code is requested while the user is
   * ALREADY on the site, so the page they came from is where they type it. An approved
   * employer receives their code cold, with nothing open — a code and no destination is
   * not an instruction.
   *
   * Falls back to CORS_ORIGIN, which is already the front end's address, then to localhost
   * so development works with no extra configuration. Production should set FRONTEND_URL.
   */
  private appUrl = '';
  private host?: string;
  private verified?: boolean;
  private lastError?: string;
  private lastSentAt?: Date;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const host = this.config.get<string>('EMAIL_HOST');
    const user = this.config.get<string>('EMAIL_USER');
    const pass = this.config.get<string>('EMAIL_PASS');
    const port = parseInt(this.config.get<string>('EMAIL_PORT') ?? '587', 10);
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? 'development';
    this.from =
      this.config.get<string>('SMTP_FROM') ?? user ?? 'no-reply@localhost';
    this.appUrl = (
      this.config.get<string>('FRONTEND_URL') ??
      this.config.get<string>('CORS_ORIGIN') ??
      'http://localhost:3000'
    )
      // A trailing slash would produce '//employer/activate'.
      .replace(/\/+$/, '');

    if (!host || !user || !pass) {
      if (nodeEnv === 'production') {
        // Rule 1: refuse to start rather than accept unverifiable registrations.
        throw new Error(
          'Email delivery is not configured (EMAIL_HOST/EMAIL_USER/EMAIL_PASS missing) ' +
            'and NODE_ENV=production. Email verification is required to log in, so the app ' +
            'would accept registrations it can never complete. Set the SMTP variables ' +
            '(see .env.example) or run with NODE_ENV=development.',
        );
      }
      this.logger.warn(
        'Email not configured (EMAIL_HOST/EMAIL_USER/EMAIL_PASS missing) — emails will be ' +
          `skipped. Allowed because NODE_ENV=${nodeEnv}; in production this is a boot error.`,
      );
      return;
    }

    this.host = host;
    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
      auth: { user, pass },
    });
    this.logger.log(`Email transport configured (host=${host}, port=${port}).`);

    // Handshake in the background: bad credentials should be loud at boot, but a transient
    // SMTP outage must not stop the container starting (Cloud Run cold starts).
    void this.verifyConnection();
  }

  /** True once SMTP credentials are present and a transport exists. */
  get isConfigured(): boolean {
    return this.transporter !== undefined;
  }

  /** Transport state for the readiness probe. */
  getStatus(): MailTransportStatus {
    return {
      configured: this.isConfigured,
      host: this.host,
      verified: this.verified,
      lastError: this.lastError,
      lastSentAt: this.lastSentAt?.toISOString(),
    };
  }

  /** Verify the SMTP connection/credentials. Returns false instead of throwing. */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) {
      this.verified = false;
      return false;
    }
    try {
      await this.transporter.verify();
      this.verified = true;
      this.lastError = undefined;
      this.logger.log('SMTP handshake OK.');
      return true;
    } catch (err) {
      this.verified = false;
      this.lastError = (err as Error).message;
      this.logger.error(`SMTP verify failed: ${this.lastError}`);
      return false;
    }
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    await this.send(
      to,
      'Verify your email address',
      this.codeTemplate(
        'Verify your email',
        'Use the code below to verify your email address.',
        code,
      ),
    );
  }

  async sendPasswordResetCode(to: string, code: string): Promise<void> {
    await this.send(
      to,
      'Reset your password',
      this.codeTemplate(
        'Reset your password',
        'Use the code below to reset your password. If you did not request this, ignore this email.',
        code,
      ),
    );
  }

  async sendPasswordResetSuccess(to: string): Promise<void> {
    await this.send(to, 'Your password was changed', {
      text:
        'Your password was changed successfully. ' +
        "If this wasn't you, contact support immediately.",
      html:
        '<p>Your password was changed successfully.</p>' +
        "<p>If this wasn't you, please contact support immediately.</p>",
    });
  }

  /**
   * The employer's account has been approved - here is the code that activates it.
   *
   * NO PASSWORD IS SENT. The code proves the recipient controls this inbox; the
   * employer chooses their own password during activation. That is why the account is
   * created with `emailVerified: false` and an empty hash - this mail, and only this
   * mail, is what turns an approved row into a usable account
   * (employer_logic.md v2.1 section 4.3).
   */
  async sendEmployerActivationCode(
    to: string,
    code: string,
    companyName: string,
    ttlText: string,
  ): Promise<void> {
    // The address is carried in the link so they do not retype it, and so the page can
    // tell them which account they are activating.
    const url = `${this.appUrl}/employer/activate?email=${encodeURIComponent(to)}`;
    await this.send(
      to,
      'Your JobFit employer account is approved',
      this.codeTemplate(
        'Activate your employer account',
        `Your request for ${companyName} has been approved. Use the code below to set ` +
          'your password and sign in. By activating this account you agree to the ' +
          'JobFit Employer Terms of Service.',
        code,
        ttlText,
        { url, label: 'Activate my account' },
      ),
    );
  }

  /**
   * A rejected request. `reason` is the admin's own words and is shown verbatim,
   * because a rejection with no reason is one the employer cannot act on.
   */
  async sendEmployerRequestRejected(
    to: string,
    companyName: string,
    reason: string,
  ): Promise<void> {
    await this.send(to, 'About your JobFit employer request', {
      text:
        `We reviewed the employer request for ${companyName} and cannot approve it ` +
        `at this time.\n\nReason: ${reason}\n\n` +
        'If you believe this is a mistake, reply to this email with more detail.',
      html:
        `<p>We reviewed the employer request for <strong>${companyName}</strong> and ` +
        'cannot approve it at this time.</p>' +
        `<p><strong>Reason:</strong> ${reason}</p>` +
        '<p>If you believe this is a mistake, reply to this email with more detail.</p>',
    });
  }

  /**
   * Deliver one mail. Throws on failure (rule 2) — callers decide whether a bounce is
   * fatal to their flow. In dev/test with no SMTP configured the send is skipped rather
   * than thrown, so the suite runs without a mail server.
   */
  private async send(
    to: string,
    subject: string,
    body: MailBody,
  ): Promise<void> {
    if (!this.transporter) {
      // Only reachable outside production — onModuleInit throws there.
      this.logger.warn(
        `Email skipped (SMTP not configured): "${subject}" -> ${to}`,
      );
      return;
    }
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text: body.text,
        html: body.html,
      });
      this.lastSentAt = new Date();
      this.lastError = undefined;
      this.logger.log(
        `Email sent: "${subject}" -> ${to} (messageId=${info.messageId})`,
      );
    } catch (err) {
      this.lastError = (err as Error).message;
      this.logger.error(
        `Email send failed: "${subject}" -> ${to}: ${this.lastError}`,
      );
      throw err;
    }
  }

  private codeTemplate(
    title: string,
    intro: string,
    code: string,
    // Employer activation codes live far longer than a verification code, so the
    // sentence has to be told rather than assumed. The default keeps every
    // existing caller byte-identical.
    ttlText = '15 minutes',
    /**
     * Where to use the code. Optional because the seeker flows do not need it — the user
     * is already on the page that asked for the code.
     */
    action?: { url: string; label: string },
  ): MailBody {
    const text =
      `${intro}\n\nYour code: ${code}\n\nThis code expires in ${ttlText}.` +
      (action ? `\n\n${action.label}: ${action.url}` : '');
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="margin-bottom: 8px;">${title}</h2>
        <p style="color: #444;">${intro}</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px;
                    background: #f4f4f5; padding: 16px 0; text-align: center;
                    border-radius: 8px; margin: 16px 0;">${code}</div>
        ${
          action
            ? `<p style="text-align: center; margin: 20px 0;">
                 <a href="${action.url}"
                    style="display: inline-block; background: #5A189A; color: #ffffff;
                           text-decoration: none; padding: 12px 24px; border-radius: 8px;
                           font-weight: 700;">${action.label}</a>
               </p>
               <p style="color: #888; font-size: 12px; word-break: break-all;">
                 Or paste this into your browser: ${action.url}
               </p>`
            : ''
        }
        <p style="color: #888; font-size: 13px;">This code expires in ${ttlText}.</p>
      </div>`;
    return { text, html };
  }
}
