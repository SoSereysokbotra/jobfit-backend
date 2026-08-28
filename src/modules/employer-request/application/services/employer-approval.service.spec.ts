// src/modules/employer-request/application/services/employer-approval.service.spec.ts
//
// This service is the ONLY thing in the codebase that creates an EMPLOYER account, and it
// creates one with an empty password hash. Four invariants below are what stop that row
// from being a hole:
//
//   1. approval leaves emailVerified FALSE — login's unverified refusal is the only guard
//      on a row with no password;
//   2. the email conflict is decided by the unique index, not a prior read;
//   3. a bounced activation mail does NOT roll back an approval that succeeded;
//   4. activation answers identically for a wrong code and an unknown address, so it
//      cannot be used to discover which employers were approved.

import { BadRequestException, ConflictException } from '@nestjs/common';
import { EmployerRequestStatus, Prisma } from '@prisma/client';
import { EmployerApprovalService } from './employer-approval.service';

const REQUEST = {
  id: 'req-1',
  companyName: 'TechCorp Inc',
  companyEmail: 'recruiting@techcorp.com',
  contactName: 'Jane Doe',
  contactRole: 'Head of Talent',
  description: 'We hire engineers.',
  companyWebsite: 'https://techcorp.com',
  supportingDocsUrl: null,
  status: EmployerRequestStatus.SUBMITTED,
  adminNotes: null,
  reviewedByAdminId: null,
  reviewedAt: null,
  approvedUserId: null,
  approvedCompanyId: null,
  activationCode: null,
  activationCodeExpiry: null,
  createdAt: new Date('2026-08-27T00:00:00Z'),
  updatedAt: new Date('2026-08-27T00:00:00Z'),
};

const uniqueViolation = () =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
  });

describe('EmployerApprovalService', () => {
  let prisma: {
    company: { findFirst: jest.Mock };
    user: { update: jest.Mock };
    employerRequest: { update: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: {
    user: { create: jest.Mock };
    employerRequest: { update: jest.Mock };
  };
  let repo: {
    findById: jest.Mock;
    findApprovedByEmail: jest.Mock;
    setActivationCode: jest.Mock;
  };
  let email: {
    sendEmployerActivationCode: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let authDomain: {
    generateNumericCode: jest.Mock;
    computeExpiry: jest.Mock;
    isCodeValid: jest.Mock;
  };
  let service: EmployerApprovalService;

  const request = (over: Record<string, unknown> = {}) => ({ ...REQUEST, ...over });

  beforeEach(() => {
    tx = {
      user: { create: jest.fn().mockResolvedValue({ id: 'user-new' }) },
      employerRequest: {
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve(request({ ...data, status: data.status })),
          ),
      },
    };
    prisma = {
      company: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'company-1', name: 'TechCorp Inc' }),
      },
      user: { update: jest.fn().mockResolvedValue({}) },
      employerRequest: { update: jest.fn().mockResolvedValue({}) },
      // approve() passes a callback; activate() passes an array of promises.
      $transaction: jest.fn((arg) =>
        typeof arg === 'function' ? arg(tx) : Promise.all(arg),
      ),
    };
    repo = {
      findById: jest.fn().mockResolvedValue(request()),
      findApprovedByEmail: jest.fn(),
      setActivationCode: jest.fn().mockResolvedValue(request()),
    };
    email = { sendEmployerActivationCode: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    authDomain = {
      generateNumericCode: jest.fn().mockReturnValue('048213'),
      computeExpiry: jest.fn().mockReturnValue(new Date('2026-08-29T00:00:00Z')),
      isCodeValid: jest.fn().mockReturnValue(true),
    };

    service = new EmployerApprovalService(
      prisma as never,
      repo as never,
      email as never,
      audit as never,
      authDomain as never,
    );
  });

  describe('approve', () => {
    // Invariant 1. If this ever flips to true, an account with an empty password hash
    // becomes reachable — the emailed code stops being what grants access.
    it('creates the account unverified and with no password', async () => {
      await service.approve('req-1', 'admin-1', { companyId: 'company-1' });

      expect(tx.user.create).toHaveBeenCalledTimes(1);
      const { data } = tx.user.create.mock.calls[0][0];
      expect(data.role).toBe('EMPLOYER');
      expect(data.emailVerified).toBe(false);
      expect(data.passwordHash).toBe('');
    });

    it('records which company the approval was for, so first-login claim can be checked', async () => {
      await service.approve('req-1', 'admin-1', { companyId: 'company-1' });

      const { data } = tx.employerRequest.update.mock.calls[0][0];
      expect(data.approvedCompanyId).toBe('company-1');
      expect(data.approvedUserId).toBe('user-new');
      expect(data.status).toBe(EmployerRequestStatus.APPROVED);
    });

    it('emails the activation code only after the transaction commits', async () => {
      await service.approve('req-1', 'admin-1', { companyId: 'company-1' });

      expect(email.sendEmployerActivationCode).toHaveBeenCalledWith(
        'recruiting@techcorp.com',
        '048213',
        'TechCorp Inc',
        expect.any(String),
      );
    });

    // Invariant 2. The check is the unique index, not a read-then-write.
    it('turns a unique-constraint violation into a conflict the admin UI can act on', async () => {
      tx.user.create.mockRejectedValue(uniqueViolation());

      await expect(
        service.approve('req-1', 'admin-1', { companyId: 'company-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    // Invariant 3. The account exists and the code is stored; Resend recovers delivery.
    // Throwing here would report failure for an approval that actually succeeded, and
    // invite a retry straight into the unique constraint.
    it('does not fail the approval when the activation mail bounces', async () => {
      email.sendEmployerActivationCode.mockRejectedValue(new Error('SMTP down'));

      await expect(
        service.approve('req-1', 'admin-1', { companyId: 'company-1' }),
      ).resolves.toBeDefined();
      expect(tx.user.create).toHaveBeenCalled();
    });

    it('refuses to re-decide a request that was already approved', async () => {
      repo.findById.mockResolvedValue(
        request({ status: EmployerRequestStatus.APPROVED }),
      );

      await expect(
        service.approve('req-1', 'admin-1', { companyId: 'company-1' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it('refuses an unknown company rather than approving into nothing', async () => {
      prisma.company.findFirst.mockResolvedValue(null);

      await expect(
        service.approve('req-1', 'admin-1', { companyId: 'nope' }),
      ).rejects.toThrow();
      expect(tx.user.create).not.toHaveBeenCalled();
    });
  });

  describe('activate', () => {
    const dto = {
      email: 'recruiting@techcorp.com',
      code: '048213',
      password: 'S3curePass',
    };

    it('sets the password, verifies the address and burns the code', async () => {
      repo.findApprovedByEmail.mockResolvedValue(
        request({
          status: EmployerRequestStatus.APPROVED,
          approvedUserId: 'user-new',
          activationCode: '048213',
        }),
      );

      await service.activate(dto);

      const userUpdate = prisma.user.update.mock.calls[0][0];
      expect(userUpdate.where).toEqual({ id: 'user-new' });
      expect(userUpdate.data.emailVerified).toBe(true);
      expect(userUpdate.data.passwordHash).toEqual(expect.stringMatching(/^\$2[aby]\$/));

      const reqUpdate = prisma.employerRequest.update.mock.calls[0][0];
      expect(reqUpdate.data).toEqual({
        activationCode: null,
        activationCodeExpiry: null,
      });
    });

    // Invariant 4. Both branches must be indistinguishable to the caller.
    it('answers a wrong code and an unknown address identically', async () => {
      repo.findApprovedByEmail.mockResolvedValue(
        request({
          status: EmployerRequestStatus.APPROVED,
          approvedUserId: 'user-new',
          activationCode: '048213',
        }),
      );
      authDomain.isCodeValid.mockReturnValue(false);
      const wrongCode = await service.activate(dto).catch((e) => e as Error);

      repo.findApprovedByEmail.mockResolvedValue(null);
      const unknown = await service.activate(dto).catch((e) => e as Error);

      expect(wrongCode).toBeInstanceOf(BadRequestException);
      expect(unknown).toBeInstanceOf(BadRequestException);
      expect(wrongCode.message).toBe(unknown.message);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses an approved request that somehow has no account behind it', async () => {
      repo.findApprovedByEmail.mockResolvedValue(
        request({
          status: EmployerRequestStatus.APPROVED,
          approvedUserId: null,
          activationCode: '048213',
        }),
      );

      await expect(service.activate(dto)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('resendActivation', () => {
    it('issues a fresh code, which invalidates the previous one', async () => {
      repo.findById.mockResolvedValue(
        request({
          status: EmployerRequestStatus.APPROVED,
          activationCode: 'old111',
        }),
      );
      authDomain.generateNumericCode.mockReturnValue('999888');

      await service.resendActivation('req-1', 'admin-1');

      expect(repo.setActivationCode).toHaveBeenCalledWith(
        'req-1',
        '999888',
        expect.any(Date),
      );
      expect(email.sendEmployerActivationCode).toHaveBeenCalled();
    });

    it('refuses to resend for a request that was never approved', async () => {
      repo.findById.mockResolvedValue(
        request({ status: EmployerRequestStatus.SUBMITTED }),
      );

      await expect(
        service.resendActivation('req-1', 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(email.sendEmployerActivationCode).not.toHaveBeenCalled();
    });
  });
});
