// src/modules/admin/infrastructure/repositories/system-event.repository.ts
//
// Prisma-backed persistence for the SystemEvent table (health alerts, Feature 1).

import { Injectable } from '@nestjs/common';
import {
  Prisma,
  SystemEvent,
  SystemEventSeverity,
  SystemEventType,
} from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

@Injectable()
export class SystemEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    eventType: SystemEventType;
    severity: SystemEventSeverity;
    message: string;
    details?: Prisma.InputJsonValue;
  }): Promise<SystemEvent> {
    return this.prisma.systemEvent.create({
      data: {
        eventType: input.eventType,
        severity: input.severity,
        message: input.message,
        details: input.details,
      },
    });
  }

  findById(id: string): Promise<SystemEvent | null> {
    return this.prisma.systemEvent.findUnique({ where: { id } });
  }

  /** List alerts newest-first, optionally filtered by severity / acknowledgement state. */
  findMany(params: {
    skip: number;
    take: number;
    severity?: SystemEventSeverity;
    acknowledged?: boolean;
  }): Promise<SystemEvent[]> {
    const where: Prisma.SystemEventWhereInput = {};
    if (params.severity) where.severity = params.severity;
    if (params.acknowledged === true) where.acknowledgedAt = { not: null };
    if (params.acknowledged === false) where.acknowledgedAt = null;

    return this.prisma.systemEvent.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Mark an alert acknowledged. Returns null if already acknowledged / not found. */
  async acknowledge(id: string, adminId: string): Promise<SystemEvent | null> {
    // Only transition rows that are still open, so a second ack is a no-op (count 0).
    const result = await this.prisma.systemEvent.updateMany({
      where: { id, acknowledgedAt: null },
      data: { acknowledgedAt: new Date(), acknowledgedByAdminId: adminId },
    });
    if (result.count === 0) return null;
    return this.findById(id);
  }

  /** Count unacknowledged alerts grouped by severity. */
  async countOpenBySeverity(): Promise<Record<SystemEventSeverity, number>> {
    const rows = await this.prisma.systemEvent.groupBy({
      by: ['severity'],
      where: { acknowledgedAt: null },
      _count: { _all: true },
    });
    const out: Record<SystemEventSeverity, number> = {
      INFO: 0,
      WARNING: 0,
      CRITICAL: 0,
    };
    for (const row of rows) out[row.severity] = row._count._all;
    return out;
  }

  /** Count events in [since, now] grouped by severity. */
  async countBySeveritySince(since: Date): Promise<Record<string, number>> {
    const rows = await this.prisma.systemEvent.groupBy({
      by: ['severity'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    const out: Record<string, number> = {};
    for (const row of rows) out[row.severity] = row._count._all;
    return out;
  }
}
