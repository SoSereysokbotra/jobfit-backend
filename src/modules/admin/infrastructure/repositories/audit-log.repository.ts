// src/modules/admin/infrastructure/repositories/audit-log.repository.ts
//
// Prisma-backed persistence for the AuditLog table (basic admin action log).

import { Injectable } from '@nestjs/common';
import {
  AuditActionType,
  AuditLog,
  AuditResourceType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

export interface CreateAuditLogInput {
  adminId: string;
  actionType: AuditActionType;
  resourceType: AuditResourceType;
  resourceId?: string | null;
}

export type AuditLogWithAdmin = AuditLog & { admin: { email: string } | null };

@Injectable()
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreateAuditLogInput): Promise<AuditLog> {
    return this.prisma.auditLog.create({
      data: {
        adminId: input.adminId,
        actionType: input.actionType,
        resourceType: input.resourceType,
        resourceId: input.resourceId ?? null,
      },
    });
  }

  /** List logs newest-first, paginated, optionally filtered by admin or action type. */
  findMany(params: {
    skip: number;
    take: number;
    adminId?: string;
    actionType?: AuditActionType;
  }): Promise<AuditLogWithAdmin[]> {
    const where: Prisma.AuditLogWhereInput = {};
    if (params.adminId) where.adminId = params.adminId;
    if (params.actionType) where.actionType = params.actionType;

    return this.prisma.auditLog.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: 'desc' },
      include: { admin: { select: { email: true } } },
    });
  }
}
