// src/modules/notification/slack-notifier.service.ts
//
// Phase 4 — Slack alert transport. Posts a Block Kit message to SLACK_WEBHOOK_URL.
//
// FAIL-OPEN: a Slack outage / missing webhook must NEVER break request handling — every
// path is wrapped, times out fast, and returns a boolean instead of throwing. If no webhook
// is configured (dev), it is a silent no-op.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface SlackAlert {
  title: string;
  message: string;
  severity: AlertSeverity;
  fields?: Record<string, string | number | undefined>;
}

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  info: 'ℹ️',
  warning: '⚠️',
  critical: '🚨',
};

const POST_TIMEOUT_MS = 3000;

@Injectable()
export class SlackNotifierService {
  private readonly logger = new Logger(SlackNotifierService.name);
  private readonly webhookUrl?: string;
  private missingWebhookLogged = false;

  constructor(config: ConfigService) {
    this.webhookUrl = config.get<string>('app.slackWebhookUrl');
  }

  get configured(): boolean {
    return Boolean(this.webhookUrl);
  }

  /** Post an alert. Returns true on a 2xx, false on any failure / no webhook. Never throws. */
  async send(alert: SlackAlert): Promise<boolean> {
    if (!this.webhookUrl) {
      if (!this.missingWebhookLogged) {
        this.logger.debug('SLACK_WEBHOOK_URL not set — Slack alerts disabled.');
        this.missingWebhookLogged = true;
      }
      return false;
    }

    try {
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.buildPayload(alert)),
        signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`Slack webhook returned ${res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`Slack alert failed (fail-open): ${(err as Error).message}`);
      return false;
    }
  }

  private buildPayload(alert: SlackAlert): Record<string, unknown> {
    const emoji = SEVERITY_EMOJI[alert.severity];
    const fields = Object.entries(alert.fields ?? {})
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => ({ type: 'mrkdwn', text: `*${k}*\n${String(v)}` }));

    return {
      text: `${emoji} ${alert.title}`, // fallback / notification text
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `${emoji} ${alert.title}`, emoji: true },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '```' + alert.message + '```' },
        },
        ...(fields.length ? [{ type: 'section', fields }] : []),
        {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `severity: *${alert.severity}* · ${new Date().toISOString()}` },
          ],
        },
      ],
    };
  }
}
