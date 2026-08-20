// src/modules/health/indicators/mail.health-indicator.ts
//
// Readiness visibility for email delivery. Email verification gates login, so a broken
// mailer means no new user can sign in — a silent failure that previously showed up
// nowhere but a log line.
//
// DESIGN: reports from the cached transport state (set at boot and on every send); it
// does NOT open an SMTP connection per probe. Soft, like the Redis indicator: it never
// marks readiness `down`, because an instance with a broken mailer still serves every
// other route correctly and pulling it out of the load balancer would not help. It
// annotates `degraded: true` instead, so /health/ready surfaces the problem.
//
// Production can only reach `configured: false` if EmailService's boot guard was
// bypassed — in production a missing SMTP config fails the boot outright.

import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';
import { EmailService } from '@shared/services/email.service';

@Injectable()
export class MailHealthIndicator {
  constructor(
    private readonly email: EmailService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  isHealthy(key = 'mail'): HealthIndicatorResult {
    const indicator = this.healthIndicatorService.check(key);
    const status = this.email.getStatus();

    // `verified === undefined` means the boot-time handshake has not resolved yet — not
    // a failure, so it must not read as degraded on a cold start.
    const degraded = !status.configured || status.verified === false;

    return indicator.up({
      configured: status.configured,
      host: status.host,
      verified: status.verified ?? 'pending',
      lastSentAt: status.lastSentAt,
      ...(status.lastError ? { lastError: status.lastError } : {}),
      ...(degraded
        ? {
            degraded: true,
            impact: 'email verification gates login — new users cannot sign in',
          }
        : {}),
    });
  }
}
