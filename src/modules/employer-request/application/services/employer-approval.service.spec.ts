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
    user: { create: jest.Mock; update: jest.Mock };
    employerRequest: { update: jest.Mock };
    employerProfile: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    company: { updateMany: jest.Mock };
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
      user: {
        create: jest.fn().mockResolvedValue({ id: 'user-new' }),
        update: jest.fn().mockResolvedValue({}),
      },
      employerRequest: {
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve(request({ ...data, status: data.status })),
          ),
      },
      // activate() links the approved company inside the same transaction.
      employerProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'profile-1' }),
      },
      company: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
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

      const userUpdate = tx.user.update.mock.calls[0][0];
      expect(userUpdate.where).toEqual({ id: 'user-new' });
      expect(userUpdate.data.emailVerified).toBe(true);
      expect(userUpdate.data.passwordHash).toEqual(expect.stringMatching(/^\$2[aby]\$/));

      const reqUpdate = tx.employerRequest.update.mock.calls[0][0];
      expect(reqUpdate.data).toEqual({
        activationCode: null,
        activationCodeExpiry: null,
      });
    });

    // The gap that made an activated employer useless: approval writes the company onto
    // the REQUEST, but every employer feature reads EmployerProfile, and nothing created
    // it. §6 put the claim at first login and no first-login screen was ever built, so
    // the portal answered 403 everywhere with no way out. Activation links it now.
    it('links the account to the approved company, so the portal works immediately', async () => {
      repo.findApprovedByEmail.mockResolvedValue(
        request({
          status: EmployerRequestStatus.APPROVED,
          approvedUserId: 'user-new',
          approvedCompanyId: 'company-1',
          contactName: 'Jane Doe',
          activationCode: '048213',
        }),
      );

      await service.activate(dto);

      expect(tx.employerProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-new',
          companyId: 'company-1',
          firstName: 'Jane',
          lastName: 'Doe',
        },
      });
    });

    // Intake collects first and last separately now, so for a request submitted through
    // the form this is a read. The name below is the case the old split got wrong: it
    // reads everything after the first space as the surname, making "Mary Jane" a person
    // called Mary with the surname "Jane Watson".
    it('uses the name parts the employer gave, not a split of the display name', async () => {
      repo.findApprovedByEmail.mockResolvedValue(
        request({
          status: EmployerRequestStatus.APPROVED,
          approvedUserId: 'user-new',
          approvedCompanyId: 'company-1',
          contactName: 'Mary Jane Watson',
          contactFirstName: 'Mary Jane',
          contactLastName: 'Watson',
          activationCode: '048213',
        }),
      );

      await service.activate(dto);

      expect(tx.employerProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-new',
          companyId: 'company-1',
          firstName: 'Mary Jane',
          lastName: 'Watson',
        },
      });
    });

    // A row from before the columns existed, or one an admin transcribed from an email.
    // Half a pair is not a pair — one field alone tells you nothing about where the other
    // one ends, so it falls back rather than pairing a real name with an empty string.
    it('falls back to splitting when the parts are missing or half-present', async () => {
      repo.findApprovedByEmail.mockResolvedValue(
        request({
          status: EmployerRequestStatus.APPROVED,
          approvedUserId: 'user-new',
          approvedCompanyId: 'company-1',
          contactName: 'Sokha Chan',
          contactFirstName: 'Sokha',
          contactLastName: null,
          activationCode: '048213',
        }),
      );

      await service.activate(dto);

      expect(tx.employerProfile.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-new',
          companyId: 'company-1',
          firstName: 'Sokha',
          lastName: 'Chan',
        },
      });
    });

    // §6: the admin checked a business registration, so the approval IS the verification.
    it('stamps the company verified by ADMIN_REVIEW, but never re-stamps a verified one', async () => {
      repo.findApprovedByEmail.mockResolvedValue(
        request({
          status: EmployerRequestStatus.APPROVED,
          approvedUserId: 'user-new',
          approvedCompanyId: 'company-1',
          activationCode: '048213',
        }),
      );

      await service.activate(dto);

      const call = tx.company.updateMany.mock.calls[0][0];
      // The isVerified:false filter is what stops a company verified by a different
      // signal from having its method overwritten.
      expect(call.where).toEqual({ id: 'company-1', isVerified: false });
      expect(call.data.verificationMethod).toBe('ADMIN_REVIEW');
      expect(call.data.isVerified).toBe(true);
    });

    it('does not hand an employer a company another account already manages', async () => {
      repo.findApprovedByEmail.mockResolvedValue(
        request({
          status: EmployerRequestStatus.APPROVED,
          approvedUserId: 'user-new',
          approvedCompanyId: 'company-1',
          activationCode: '048213',
        }),
      );
      tx.employerProfile.findFirst.mockResolvedValue({ userId: 'someone-else' });

      await service.activate(dto);

      // Still activates — the password is set and the code burned — but the conflict is
      // left for an admin rather than resolved by giving two employers one pipeline.
      expect(tx.user.update).toHaveBeenCalled();
      expect(tx.employerProfile.create).not.toHaveBeenCalled();
      expect(tx.company.updateMany).not.toHaveBeenCalled();
    });

    it('activates normally when the request carries no company', async () => {
      repo.findApprovedByEmail.mockResolvedValue(
        request({
          status: EmployerRequestStatus.APPROVED,
          approvedUserId: 'user-new',
          approvedCompanyId: null,
          activationCode: '048213',
        }),
      );

      await expect(service.activate(dto)).resolves.toBeDefined();
      expect(tx.employerProfile.create).not.toHaveBeenCalled();
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
