// src/modules/admin/presentation/controllers/admin-audit.controller.ts
//
// Admin Audit Logging (basic). Read-only view of the admin action log. Requires an
// ADMIN JWT (@Roles('ADMIN')).

import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuditActionType } from '@prisma/client';

import { Roles } from '@common/decorators/roles.decorator';
import { AuditLogService } from '../../application/services/audit-log.service';
import { AuditLogDto } from '../../application/dtos/audit-log-response.dto';

@ApiTags('Admin - Audit')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'List admin audit logs (newest first)' })
  @ApiOkResponse({ type: AuditLogDto, isArray: true })
  list(
    @Query('adminId') adminId?: string,
    @Query('actionType') actionType?: string,
    @Query('skip') skip = '0',
    @Query('take') take = '50',
  ): Promise<AuditLogDto[]> {
    return this.auditLog.list({
      skip: Math.max(parseInt(skip, 10) || 0, 0),
      take: Math.min(parseInt(take, 10) || 50, 100),
      adminId: adminId || undefined,
      actionType:
        actionType && actionType in AuditActionType
          ? (actionType as AuditActionType)
          : undefined,
    });
  }
}
