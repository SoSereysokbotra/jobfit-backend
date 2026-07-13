// src/modules/admin/application/services/email-tracking.service.ts
//
// Email Delivery Tracking (Feature 3): delivery metrics, bounce list and address
// suppression. Suppressed addresses are stored in Redis (`email:suppressed:{email}`),
// which the mail-sending layer can consult before dispatching.

import { Injectable, Logger } from '@nestjs/common';
import {
  AuditActionType,
  AuditResourceType,
  EmailEventType,
} from '@prisma/client';
import { RedisService } from '@shared/services/redis.service';
import { EmailEventRepository } from '../../infrastructure/repositories/email-event.repository';
import { AuditLogService } from './audit-log.service';
import { BounceDto, EmailMetricsDto } from '../dtos/email-response.dto';

const SUPPRESSION_KEY = (email: string) =>
  `email:suppressed:${email.toLowerCase().trim()}`;

@Injectable()
export class EmailTrackingService {
  private readonly logger = new Logger(EmailTrackingService.name);

  constructor(
    private readonly emailEventRepo: EmailEventRepository,
    private readonly redis: RedisService,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Delivery summary over the last 24 hours. */
  async getMetrics(): Promise<EmailMetricsDto> {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
    const counts = await this.emailEventRepo.countByTypeSince(windowStart);

    const sent = counts[EmailEventType.SENT] ?? 0;
    const delivered = counts[EmailEventType.DELIVERED] ?? 0;
    const bounced =
      (counts[EmailEventType.BOUNCED_SOFT] ?? 0) +
      (counts[EmailEventType.BOUNCED_HARD] ?? 0);
    const complained = counts[EmailEventType.COMPLAINED] ?? 0;

    const dto = new EmailMetricsDto();
    dto.windowStart = windowStart;
    dto.windowEnd = windowEnd;
    dto.sent = sent;
    dto.delivered = delivered;
    dto.bounced = bounced;
    dto.complained = complained;
    dto.deliveryRate = sent > 0 ? round2((delivered / sent) * 100) : 0;
    return dto;
  }

  /** Recent bounces/complaints, annotated with current suppression state. */
  async getBounces(skip: number, take: number): Promise<BounceDto[]> {
    const rows = await this.emailEventRepo.findBounces({ skip, take });
    return Promise.all(
      rows.map(async (row) => {
        const suppressed = await this.isSuppressed(row.recipientEmail);
        return new BounceDto({
          id: row.id,
          recipientEmail: row.recipientEmail,
          eventType: row.eventType,
          reason: row.reason,
          createdAt: row.createdAt,
          suppressed,
        });
      }),
    );
  }

  /** Add an address to the suppression list. */
  async suppress(adminId: string, email: string): Promise<void> {
    await this.redis.set(SUPPRESSION_KEY(email), '1');
    await this.auditLog.record({
      adminId,
      actionType: AuditActionType.EMAIL_SUPPRESSED,
      resourceType: AuditResourceType.EMAIL,
      resourceId: email.toLowerCase().trim(),
    });
  }

  /** Read-side suppression check — fails open (returns false) if Redis is unavailable. */
  private async isSuppressed(email: string): Promise<boolean> {
    try {
      return await this.redis.exists(SUPPRESSION_KEY(email));
    } catch (err) {
      this.logger.warn(
        `Suppression lookup failed (fail-open): ${(err as Error).message}`,
      );
      return false;
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
