// src/modules/admin/application/services/admin-user.status.spec.ts
//
// Account lifecycle (Phase 7). Three things here are load-bearing:
//
//   1. an admin cannot suspend themselves — there is no self-service reactivation, so the
//      panel that could undo it is the one they would be locked out of;
//   2. the two columns move together, because `isActive` still has readers and a row where
//      status says SUSPENDED and isActive says true is live to half the codebase;
//   3. the auth cache is invalidated with the write, or a suspended user keeps
//      authenticating for up to the 300s TTL.
//
// (3) lives in the repository and is asserted there, in admin-user.repository.status.spec.

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuditActionType, UserStatus } from '@prisma/client';
import { AdminUserService } from './admin-user.service';

describe('AdminUserService.setStatus', () => {
  let userRepo: { setStatus: jest.Mock; findEmailById: jest.Mock };
  let auditLog: { record: jest.Mock };
  let service: AdminUserService;

  beforeEach(() => {
    userRepo = {
      setStatus: jest.fn().mockResolvedValue({ email: 'jane@techcorp.com' }),
      findEmailById: jest.fn().mockResolvedValue({ email: 'jane@techcorp.com' }),
    };
    auditLog = { record: jest.fn().mockResolvedValue(undefined) };

    // Constructor order: userRepo, commandBus, auditLog, lockout.
    service = new AdminUserService(
      userRepo as never,
      { execute: jest.fn() } as never,
      auditLog as never,
      { clearAttempts: jest.fn() } as never,
    );
  });

  it('refuses an admin changing their own status', async () => {
    await expect(
      service.setStatus('admin-1', 'admin-1', UserStatus.SUSPENDED),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(userRepo.setStatus).not.toHaveBeenCalled();
  });

  it('404s for a user that does not exist or is already deleted', async () => {
    userRepo.setStatus.mockResolvedValue(null);

    await expect(
      service.setStatus('admin-1', 'ghost', UserStatus.SUSPENDED),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(auditLog.record).not.toHaveBeenCalled();
  });

  // Three distinct actions, not one STATUS_CHANGED: an audit answering "who turned this
  // account off" should not have to read a payload to learn which of them happened.
  it.each([
    [UserStatus.SUSPENDED, AuditActionType.USER_SUSPENDED],
    [UserStatus.ACTIVE, AuditActionType.USER_REACTIVATED],
    [UserStatus.DEACTIVATED, AuditActionType.USER_DEACTIVATED],
  ])('records %s as %s', async (status, action) => {
    await service.setStatus('admin-1', 'user-1', status);

    expect(userRepo.setStatus).toHaveBeenCalledWith('user-1', status);
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({
        adminId: 'admin-1',
        actionType: action,
        resourceId: 'user-1',
      }),
    );
  });
});
