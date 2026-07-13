// src/modules/admin/application/dtos/audit-log-response.dto.ts
//
// Read model for GET /admin/audit-logs (basic admin action log).

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AuditActionType, AuditResourceType } from '@prisma/client';

export class AuditLogDto {
  @ApiProperty() id: string;
  @ApiProperty() adminId: string;
  @ApiPropertyOptional({ type: String, nullable: true }) adminEmail:
    string | null;
  @ApiProperty({ enum: AuditActionType }) actionType: AuditActionType;
  @ApiProperty({ enum: AuditResourceType }) resourceType: AuditResourceType;
  @ApiPropertyOptional({ type: String, nullable: true }) resourceId:
    string | null;
  @ApiProperty() createdAt: Date;

  constructor(row: {
    id: string;
    adminId: string;
    actionType: AuditActionType;
    resourceType: AuditResourceType;
    resourceId: string | null;
    createdAt: Date;
    admin?: { email: string } | null;
  }) {
    this.id = row.id;
    this.adminId = row.adminId;
    this.adminEmail = row.admin?.email ?? null;
    this.actionType = row.actionType;
    this.resourceType = row.resourceType;
    this.resourceId = row.resourceId;
    this.createdAt = row.createdAt;
  }
}
