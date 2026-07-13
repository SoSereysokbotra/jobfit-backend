// src/modules/admin/application/dtos/email-response.dto.ts
//
// Read models for the Email Delivery Tracking endpoints (Feature 3).

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmailEventType } from '@prisma/client';

/** GET /admin/email/metrics — delivery summary over the last 24h. */
export class EmailMetricsDto {
  @ApiProperty() windowStart: Date;
  @ApiProperty() windowEnd: Date;
  @ApiProperty() sent: number;
  @ApiProperty() delivered: number;
  @ApiProperty({ description: 'Soft + hard bounces.' }) bounced: number;
  @ApiProperty() complained: number;
  @ApiProperty({ description: 'Delivered / sent as a percentage (0-100).' })
  deliveryRate: number;
}

/** A bounced-email row (GET /admin/email/bounces). */
export class BounceDto {
  @ApiProperty() id: string;
  @ApiProperty() recipientEmail: string;
  @ApiProperty({ enum: EmailEventType }) eventType: EmailEventType;
  @ApiPropertyOptional({ type: String, nullable: true }) reason: string | null;
  @ApiProperty({
    description: 'Whether this address is currently on the suppression list.',
  })
  suppressed: boolean;
  @ApiProperty() createdAt: Date;

  constructor(row: {
    id: string;
    recipientEmail: string;
    eventType: EmailEventType;
    reason: string | null;
    createdAt: Date;
    suppressed: boolean;
  }) {
    this.id = row.id;
    this.recipientEmail = row.recipientEmail;
    this.eventType = row.eventType;
    this.reason = row.reason;
    this.createdAt = row.createdAt;
    this.suppressed = row.suppressed;
  }
}
