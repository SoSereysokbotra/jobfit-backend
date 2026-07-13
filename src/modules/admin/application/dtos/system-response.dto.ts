// src/modules/admin/application/dtos/system-response.dto.ts
//
// Read models for the System Health Monitoring endpoints (Feature 1).

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SystemEventSeverity, SystemEventType } from '@prisma/client';

/** GET /admin/system/health — a point-in-time snapshot of platform health. */
export class SystemHealthDto {
  @ApiProperty({ example: 'ok', enum: ['ok', 'degraded', 'down'] })
  status: string;

  @ApiProperty({ description: 'Process uptime in seconds.' })
  uptimeSeconds: number;

  @ApiProperty({ description: 'Database round-trip latency in milliseconds.' })
  databaseLatencyMs: number;

  @ApiProperty({
    description: 'Whether the database responded to a probe query.',
  })
  databaseUp: boolean;

  @ApiProperty({
    description: 'Users seen active (logged in) in the last 15 minutes.',
  })
  activeUsers: number;

  @ApiProperty({
    description: 'Resume-parsing jobs still pending/processing (queue proxy).',
  })
  jobQueuePending: number;

  @ApiProperty({
    description: 'Email delivery rate over the last 24h (0-100).',
  })
  emailDeliveryRate: number;

  @ApiProperty({ description: 'Count of unacknowledged alerts by severity.' })
  openAlerts: { critical: number; warning: number; info: number };

  @ApiProperty() generatedAt: Date;
}

/** GET /admin/system/metrics — counts aggregated over the requested window. */
export class SystemMetricsDto {
  @ApiProperty({ enum: ['1h', '24h', '7d'] })
  period: string;

  @ApiProperty() windowStart: Date;
  @ApiProperty() windowEnd: Date;

  @ApiProperty({
    description: 'System events emitted in the window, grouped by severity.',
  })
  eventsBySeverity: Record<string, number>;

  @ApiProperty({ description: 'Email events in the window, grouped by type.' })
  emailByType: Record<string, number>;

  @ApiProperty({ description: 'New user signups in the window.' })
  newUsers: number;

  @ApiProperty({ description: 'New applications submitted in the window.' })
  newApplications: number;
}

/** A single system alert (row from system_events). */
export class AlertDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: SystemEventType }) eventType: SystemEventType;
  @ApiProperty({ enum: SystemEventSeverity }) severity: SystemEventSeverity;
  @ApiProperty() message: string;
  @ApiPropertyOptional() details?: unknown;
  @ApiPropertyOptional({ type: String, nullable: true })
  acknowledgedAt: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) acknowledgedByAdminId:
    string | null;
  @ApiProperty() createdAt: Date;

  constructor(row: {
    id: string;
    eventType: SystemEventType;
    severity: SystemEventSeverity;
    message: string;
    details: unknown;
    acknowledgedAt: Date | null;
    acknowledgedByAdminId: string | null;
    createdAt: Date;
  }) {
    this.id = row.id;
    this.eventType = row.eventType;
    this.severity = row.severity;
    this.message = row.message;
    this.details = row.details ?? undefined;
    this.acknowledgedAt = row.acknowledgedAt;
    this.acknowledgedByAdminId = row.acknowledgedByAdminId;
    this.createdAt = row.createdAt;
  }
}
