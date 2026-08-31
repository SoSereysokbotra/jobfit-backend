// src/modules/admin/application/services/email-tracking.service.ts
//
// Email Delivery Tracking (Feature 3): delivery metrics, bounce list and address
// suppression.
//
// Suppression itself lives in EmailSuppressionService (Postgres). It used to be a Redis
// key written here and read only HERE — to render a flag beside a bounce — while
// EmailService, the actual sender, never consulted it (Redis audit R3). One shared
// service now owns the question, because two copies of "is this address suppressed?" is
// how the sender and the admin view got out of step.

import { Injectable } from '@nestjs/common';
import {
  AuditActionType,
  AuditResourceType,
  EmailEventType,
} from '@prisma/client';
import { EmailSuppressionService } from '@shared/services/email-suppression.service';
import { EmailEventRepository } from '../../infrastructure/repositories/email-event.repository';
import { AuditLogService } from './audit-log.service';
import { BounceDto, EmailMetricsDto } from '../dtos/email-response.dto';

@Injectable()
export class EmailTrackingService {
  constructor(
    private readonly emailEventRepo: EmailEventRepository,
    private readonly suppression: EmailSuppressionService,
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
    // One lookup for the whole page. Asking per row was a query per row, and the page
    // is the only caller that needs many answers at once.
    const suppressed = await this.suppression.filterSuppressed(
      rows.map((r) => r.recipientEmail),
    );
    return rows.map(
      (row) =>
        new BounceDto({
          id: row.id,
          recipientEmail: row.recipientEmail,
          eventType: row.eventType,
          reason: row.reason,
          createdAt: row.createdAt,
          suppressed: suppressed.has(row.recipientEmail.toLowerCase().trim()),
        }),
    );
  }

  /**
   * Add an address to the suppression list.
   *
   * Suppress FIRST, then audit: an audit row for a suppression that did not happen is
   * worse than a suppression with no audit row. The write throws on failure so the admin
   * finds out (Redis audit R11 — this used to be the one write with no error handling,
   * which made it inconsistently fail-closed against neighbours that failed open).
   */
  async suppress(
    adminId: string,
    email: string,
    reason?: string,
  ): Promise<void> {
    await this.suppression.suppress(email, reason, adminId);
    await this.auditLog.record({
      adminId,
      actionType: AuditActionType.EMAIL_SUPPRESSED,
      resourceType: AuditResourceType.EMAIL,
      resourceId: email.toLowerCase().trim(),
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
