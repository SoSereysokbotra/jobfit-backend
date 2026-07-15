// src/modules/admin/application/services/system-health.service.ts
//
// System Health Monitoring & Alerting (Feature 1). Computes a live health snapshot from
// signals available in this backend (DB probe, active users, background-queue proxy,
// email delivery rate, open alerts), aggregates metrics over a time window, and lets
// admins list/acknowledge alerts stored in the system_events table.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  EmailEventType,
  ResumeParsingStatus,
  SystemEventSeverity,
} from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { SystemEventRepository } from '../../infrastructure/repositories/system-event.repository';
import { EmailEventRepository } from '../../infrastructure/repositories/email-event.repository';
import {
  AlertDto,
  SystemHealthDto,
  SystemMetricsDto,
} from '../dtos/system-response.dto';
import { MetricsPeriod } from '../dtos/metrics-query.dto';

const ACTIVE_WINDOW_MS = 15 * 60 * 1000; // "active" = logged in within 15 minutes
const DAY_MS = 24 * 60 * 60 * 1000;

const PERIOD_MS: Record<MetricsPeriod, number> = {
  '1h': 60 * 60 * 1000,
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
};

@Injectable()
export class SystemHealthService {
  private readonly logger = new Logger(SystemHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemEventRepo: SystemEventRepository,
    private readonly emailEventRepo: EmailEventRepository,
  ) {}

  async getHealth(): Promise<SystemHealthDto> {
    const now = new Date();
    const { databaseUp, databaseLatencyMs } = await this.probeDatabase();

    const [activeUsers, jobQueuePending, openAlerts, emailDeliveryRate] =
      await Promise.all([
        databaseUp ? this.countActiveUsers(now) : Promise.resolve(0),
        databaseUp ? this.countPendingQueue() : Promise.resolve(0),
        databaseUp
          ? this.systemEventRepo.countOpenBySeverity()
          : Promise.resolve({ CRITICAL: 0, WARNING: 0, INFO: 0 }),
        databaseUp ? this.computeEmailDeliveryRate(now) : Promise.resolve(0),
      ]);

    const dto = new SystemHealthDto();
    dto.status = this.deriveStatus(databaseUp, openAlerts);
    dto.uptimeSeconds = Math.floor(process.uptime());
    dto.databaseUp = databaseUp;
    dto.databaseLatencyMs = databaseLatencyMs;
    dto.activeUsers = activeUsers;
    dto.jobQueuePending = jobQueuePending;
    dto.emailDeliveryRate = emailDeliveryRate;
    dto.openAlerts = {
      critical: openAlerts.CRITICAL,
      warning: openAlerts.WARNING,
      info: openAlerts.INFO,
    };
    dto.generatedAt = now;
    return dto;
  }

  async getMetrics(period: MetricsPeriod): Promise<SystemMetricsDto> {
    const windowEnd = new Date();
    const windowStart = new Date(windowEnd.getTime() - PERIOD_MS[period]);

    const [eventsBySeverity, emailByType, newUsers, newApplications] =
      await Promise.all([
        this.systemEventRepo.countBySeveritySince(windowStart),
        this.emailEventRepo.countByTypeSince(windowStart),
        this.prisma.user.count({ where: { createdAt: { gte: windowStart } } }),
        this.prisma.application.count({
          where: { createdAt: { gte: windowStart } },
        }),
      ]);

    const dto = new SystemMetricsDto();
    dto.period = period;
    dto.windowStart = windowStart;
    dto.windowEnd = windowEnd;
    dto.eventsBySeverity = eventsBySeverity;
    dto.emailByType = emailByType;
    dto.newUsers = newUsers;
    dto.newApplications = newApplications;
    return dto;
  }

  async getAlerts(params: {
    skip: number;
    take: number;
    severity?: SystemEventSeverity;
    acknowledged?: boolean;
  }): Promise<AlertDto[]> {
    const rows = await this.systemEventRepo.findMany(params);
    return rows.map((row) => new AlertDto(row));
  }

  async acknowledgeAlert(id: string, adminId: string): Promise<AlertDto> {
    const row = await this.systemEventRepo.acknowledge(id, adminId);
    if (!row) {
      // Either the alert does not exist or it was already acknowledged.
      const exists = await this.systemEventRepo.findById(id);
      if (!exists) throw new NotFoundException('Alert not found');
      return new AlertDto(exists);
    }
    return new AlertDto(row);
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private async probeDatabase(): Promise<{
    databaseUp: boolean;
    databaseLatencyMs: number;
  }> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { databaseUp: true, databaseLatencyMs: Date.now() - start };
    } catch (err) {
      this.logger.error(`Database probe failed: ${(err as Error).message}`);
      return { databaseUp: false, databaseLatencyMs: Date.now() - start };
    }
  }

  private countActiveUsers(now: Date): Promise<number> {
    return this.prisma.user.count({
      where: { lastLogin: { gte: new Date(now.getTime() - ACTIVE_WINDOW_MS) } },
    });
  }

  /**
   * Proxy for the background job queue: resumes still awaiting parsing.
   * Resilient by design — a single unavailable metric (e.g. a schema/DB mismatch on the
   * resumes table) must never fail the whole health snapshot, so we log and return 0.
   */
  private async countPendingQueue(): Promise<number> {
    try {
      return await this.prisma.resume.count({
        where: {
          parsingStatus: {
            in: [ResumeParsingStatus.PENDING, ResumeParsingStatus.PROCESSING],
          },
        },
      });
    } catch (err) {
      this.logger.warn(
        `Queue-depth probe unavailable (returning 0): ${(err as Error).message}`,
      );
      return 0;
    }
  }

  private async computeEmailDeliveryRate(now: Date): Promise<number> {
    const counts = await this.emailEventRepo.countByTypeSince(
      new Date(now.getTime() - DAY_MS),
    );
    const sent = counts[EmailEventType.SENT] ?? 0;
    const delivered = counts[EmailEventType.DELIVERED] ?? 0;
    if (sent === 0) return 100; // nothing sent -> nothing failed
    return Math.round((delivered / sent) * 10000) / 100;
  }

  private deriveStatus(
    databaseUp: boolean,
    openAlerts: Record<SystemEventSeverity, number>,
  ): string {
    if (!databaseUp) return 'down';
    if (openAlerts.CRITICAL > 0) return 'down';
    if (openAlerts.WARNING > 0) return 'degraded';
    return 'ok';
  }
}
