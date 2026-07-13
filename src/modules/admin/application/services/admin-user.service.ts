// src/modules/admin/application/services/admin-user.service.ts
//
// User Management (Feature 2): search, view, reset-password, unlock, GDPR delete.
// Reuses existing building blocks:
//   - reset-password  -> auth's RequestPasswordResetCommand (emails a reset code)
//   - unlock          -> auth's AccountLockoutService.clearAttempts()
//   - every mutation  -> AuditLogService.record()

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { AuditActionType, AuditResourceType } from '@prisma/client';
import { RequestPasswordResetCommand } from '@modules/auth/application/commands/request-password-reset.command';
import {
  ACCOUNT_LOCKOUT_SERVICE,
  type IAccountLockoutService,
} from '@modules/auth/domain/services/iaccount-lockout.service.interface';
import { ERROR_MESSAGES } from '@common/constants/error-messages';
import { AdminUserRepository } from '../../infrastructure/repositories/admin-user.repository';
import { AuditLogService } from './audit-log.service';
import {
  AdminUserDetailDto,
  AdminUserListItemDto,
} from '../dtos/admin-user-response.dto';

export interface PaginatedUsers {
  data: AdminUserListItemDto[];
  total: number;
  skip: number;
  take: number;
}

@Injectable()
export class AdminUserService {
  constructor(
    private readonly userRepo: AdminUserRepository,
    private readonly commandBus: CommandBus,
    private readonly auditLog: AuditLogService,
    @Inject(ACCOUNT_LOCKOUT_SERVICE)
    private readonly lockout: IAccountLockoutService,
  ) {}

  async search(params: {
    email?: string;
    name?: string;
    signupFrom?: string;
    signupTo?: string;
    skip: number;
    take: number;
  }): Promise<PaginatedUsers> {
    const filter = {
      email: params.email,
      name: params.name,
      signupFrom: this.parseDate(params.signupFrom),
      signupTo: this.parseDate(params.signupTo),
    };
    const [rows, total] = await Promise.all([
      this.userRepo.search({ ...filter, skip: params.skip, take: params.take }),
      this.userRepo.count(filter),
    ]);
    return {
      data: rows.map((row) => new AdminUserListItemDto(row)),
      total,
      skip: params.skip,
      take: params.take,
    };
  }

  async getDetail(id: string): Promise<AdminUserDetailDto> {
    const user = await this.userRepo.findById(id);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    const [applicationsCount, resumesCount, isLocked] = await Promise.all([
      this.userRepo.countApplications(id),
      this.userRepo.countResumes(id),
      // isLocked is keyed by (email, ip); '' ip only probes the account-level lock.
      this.lockout.isLocked(user.email, ''),
    ]);

    return new AdminUserDetailDto(user, {
      applicationsCount,
      resumesCount,
      isLocked,
    });
  }

  /** Send the user a password-reset code (reuses the standard reset flow). */
  async resetPassword(adminId: string, userId: string): Promise<void> {
    const user = await this.requireUser(userId);
    await this.commandBus.execute(new RequestPasswordResetCommand(user.email));
    await this.auditLog.record({
      adminId,
      actionType: AuditActionType.USER_RESET_PASSWORD,
      resourceType: AuditResourceType.USER,
      resourceId: userId,
    });
  }

  /** Clear brute-force lockout counters for the user's account. */
  async unlock(adminId: string, userId: string): Promise<void> {
    const user = await this.requireUser(userId);
    await this.lockout.clearAttempts(user.email);
    await this.auditLog.record({
      adminId,
      actionType: AuditActionType.USER_UNLOCKED,
      resourceType: AuditResourceType.USER,
      resourceId: userId,
    });
  }

  /** GDPR soft delete. */
  async deleteAccount(adminId: string, userId: string): Promise<void> {
    await this.requireUser(userId);
    await this.userRepo.softDelete(userId);
    await this.auditLog.record({
      adminId,
      actionType: AuditActionType.USER_ACCOUNT_DELETED,
      resourceType: AuditResourceType.USER,
      resourceId: userId,
    });
  }

  private async requireUser(userId: string): Promise<{ email: string }> {
    const user = await this.userRepo.findEmailById(userId);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);
    return user;
  }

  private parseDate(value?: string): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
}
