// src/modules/admin/application/services/audit-log.service.ts
//
// Records and lists admin actions (basic audit log). Every mutating admin operation
// (reset-password, unlock, delete, suppress) calls record() so there is a compliance
// trail of who did what.

import { Injectable, Logger } from '@nestjs/common';
import { AuditActionType, AuditResourceType } from '@prisma/client';
import { AuditLogRepository } from '../../infrastructure/repositories/audit-log.repository';
import { AuditLogDto } from '../dtos/audit-log-response.dto';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly auditLogRepo: AuditLogRepository) {}

  /**
   * Persist an audit entry. Failures are swallowed (logged only): an audit-write problem
   * must never break the underlying admin action it is recording.
   */
  async record(input: {
    adminId: string;
    actionType: AuditActionType;
    resourceType: AuditResourceType;
    resourceId?: string | null;
  }): Promise<void> {
    try {
      await this.auditLogRepo.create(input);
    } catch (err) {
      this.logger.error(
        `Failed to write audit log (${input.actionType}) for admin ${input.adminId}: ${(err as Error).message}`,
      );
    }
  }

  async list(params: {
    skip: number;
    take: number;
    adminId?: string;
    actionType?: AuditActionType;
  }): Promise<AuditLogDto[]> {
    const rows = await this.auditLogRepo.findMany(params);
    return rows.map((row) => new AuditLogDto(row));
  }
}
