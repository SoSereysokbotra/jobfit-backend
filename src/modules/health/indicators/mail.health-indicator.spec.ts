import { HealthIndicatorService } from '@nestjs/terminus';
import {
  EmailService,
  type MailTransportStatus,
} from '@shared/services/email.service';
import { MailHealthIndicator } from './mail.health-indicator';

const makeHealthIndicatorService = () =>
  ({
    check: (key: string) => ({
      up: (data?: Record<string, unknown>) => ({
        [key]: { status: 'up', ...data },
      }),
      down: (data?: Record<string, unknown>) => ({
        [key]: { status: 'down', ...data },
      }),
    }),
  }) as unknown as HealthIndicatorService;

const makeEmail = (status: MailTransportStatus) =>
  ({ getStatus: () => status }) as unknown as EmailService;

describe('MailHealthIndicator (soft / annotated)', () => {
  it('reports up and undegraded when the transport is verified', () => {
    const indicator = new MailHealthIndicator(
      makeEmail({
        configured: true,
        host: 'smtp.example.com',
        verified: true,
        lastSentAt: '2026-08-20T00:00:00.000Z',
      }),
      makeHealthIndicatorService(),
    );

    const result = indicator.isHealthy('mail');

    expect(result.mail.status).toBe('up');
    expect(result.mail.verified).toBe(true);
    expect(result.mail.degraded).toBeUndefined();
  });

  it('stays up but degraded when SMTP is not configured', () => {
    const indicator = new MailHealthIndicator(
      makeEmail({ configured: false }),
      makeHealthIndicatorService(),
    );

    const result = indicator.isHealthy('mail');

    // Soft, like Redis: a broken mailer must not pull the instance out of the LB.
    expect(result.mail.status).toBe('up');
    expect(result.mail.degraded).toBe(true);
    expect(result.mail.impact).toContain('cannot sign in');
  });

  it('stays up but degraded, with the reason, when the handshake failed', () => {
    const indicator = new MailHealthIndicator(
      makeEmail({
        configured: true,
        host: 'smtp.example.com',
        verified: false,
        lastError: '535 bad credentials',
      }),
      makeHealthIndicatorService(),
    );

    const result = indicator.isHealthy('mail');

    expect(result.mail.status).toBe('up');
    expect(result.mail.degraded).toBe(true);
    expect(result.mail.lastError).toBe('535 bad credentials');
  });

  it('is not degraded while the boot-time handshake is still pending', () => {
    const indicator = new MailHealthIndicator(
      makeEmail({ configured: true, host: 'smtp.example.com' }),
      makeHealthIndicatorService(),
    );

    const result = indicator.isHealthy('mail');

    // `verified: undefined` = not resolved yet. A cold start must not read as broken.
    expect(result.mail.verified).toBe('pending');
    expect(result.mail.degraded).toBeUndefined();
  });
});
