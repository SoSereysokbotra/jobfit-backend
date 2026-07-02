import { Injectable } from '@nestjs/common';

@Injectable()
export class MailerService {
  /**
   * Sends a transactional email.
   * Replace the console.log stub with Nodemailer / Resend / SendGrid in Phase 3.
   */
  async sendMail(options: {
    to: string;
    subject: string;
    template: string;
    context: Record<string, unknown>;
  }): Promise<void> {
    // TODO: integrate email provider (Resend recommended for Supabase projects)
    console.log(`[MailerService] Sending "${options.subject}" to ${options.to}`);
  }
}
