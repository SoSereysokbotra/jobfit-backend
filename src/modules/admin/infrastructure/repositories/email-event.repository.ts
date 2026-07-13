// src/modules/admin/infrastructure/repositories/email-event.repository.ts
//
// Prisma-backed persistence for the EmailEvent table (delivery tracking, Feature 3).
// Rows are normally written by the email provider's webhook; the admin surface only reads
// them (metrics, bounces).

import { Injectable } from '@nestjs/common';
import { EmailEvent, EmailEventType } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

@Injectable()
export class EmailEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Count events in [since, now] grouped by event type. */
  async countByTypeSince(since: Date): Promise<Record<string, number>> {
    const rows = await this.prisma.emailEvent.groupBy({
      by: ['eventType'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const row of rows) out[row.eventType] = row._count._all;
    return out;
  }

  /** Most-recent bounces/complaints, newest-first. */
  findBounces(params: { skip: number; take: number }): Promise<EmailEvent[]> {
    return this.prisma.emailEvent.findMany({
      where: {
        eventType: {
          in: [
            EmailEventType.BOUNCED_SOFT,
            EmailEventType.BOUNCED_HARD,
            EmailEventType.COMPLAINED,
          ],
        },
      },
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: 'desc' },
    });
  }
}
