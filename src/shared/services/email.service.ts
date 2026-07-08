// src/shared/services/email.service.ts
//
// SMTP email delivery (nodemailer) for verification / password-reset codes.
// Config comes from EMAIL_HOST/EMAIL_PORT/EMAIL_USER/EMAIL_PASS/SMTP_FROM (see .env.local).
// If SMTP isn't configured, sends are skipped (logged) rather than throwing — email
// failures must never break the auth flow (they're triggered from an event listener).

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface MailBody {
  text: string;
  html: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter?: Transporter;
  private from = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const host = this.config.get<string>('EMAIL_HOST');
    const user = this.config.get<string>('EMAIL_USER');
    const pass = this.config.get<string>('EMAIL_PASS');
    const port = parseInt(this.config.get<string>('EMAIL_PORT') ?? '587', 10);
    this.from =
      this.config.get<string>('SMTP_FROM') ?? user ?? 'no-reply@localhost';

    if (!host || !user || !pass) {
      this.logger.warn(
        'Email not configured (EMAIL_HOST/EMAIL_USER/EMAIL_PASS missing) — emails will be skipped.',
      );
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
      auth: { user, pass },
    });
    this.logger.log(`Email transport configured (host=${host}, port=${port}).`);
  }

  /** Verify the SMTP connection/credentials. Returns false instead of throwing. */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.verify();
      return true;
    } catch (err) {
      this.logger.error(`SMTP verify failed: ${(err as Error).message}`);
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

  private async send(
    to: string,
    subject: string,
    body: MailBody,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Email skipped (SMTP not configured): "${subject}" -> ${to}`);
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
      this.logger.log(
        `Email sent: "${subject}" -> ${to} (messageId=${info.messageId})`,
      );
    } catch (err) {
      // Never rethrow — an email failure must not break registration / reset flows.
      this.logger.error(
        `Email send failed: "${subject}" -> ${to}: ${(err as Error).message}`,
      );
    }
  }

  private codeTemplate(title: string, intro: string, code: string): MailBody {
    const text = `${intro}\n\nYour code: ${code}\n\nThis code expires in 15 minutes.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="margin-bottom: 8px;">${title}</h2>
        <p style="color: #444;">${intro}</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px;
                    background: #f4f4f5; padding: 16px 0; text-align: center;
                    border-radius: 8px; margin: 16px 0;">${code}</div>
        <p style="color: #888; font-size: 13px;">This code expires in 15 minutes.</p>
      </div>`;
    return { text, html };
  }
}
