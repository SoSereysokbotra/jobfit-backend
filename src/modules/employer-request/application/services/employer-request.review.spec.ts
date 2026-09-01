// src/modules/employer-request/application/services/employer-request.review.spec.ts
//
// The admin review transitions, and specifically WHETHER THE EMPLOYER EVER HEARS ABOUT
// THEM.
//
// Before this, `review()` wrote `adminNotes` to the row and stopped. The rejection reason
// an admin was REQUIRED to type reached nobody, and PENDING_INFO asked a question through
// no channel at all: there is no account yet, so there was no screen it could appear on.
// `EmailService.sendEmployerRequestRejected` sat there the whole time with zero callers,
// which is exactly the kind of gap a unit test pins shut.
//
// Asserted here, in rough order of how badly each would fail in production:
//
//   1. REJECTED and PENDING_INFO each send their own mail, with the admin's words verbatim
//      — paraphrasing a rejection reason makes it unactionable;
//   2. REVIEWING sends nothing, so opening a ticket does not mail the applicant;
//   3. a bounced mail does NOT fail the request. This is not politeness: `assertNotDecided`
//      makes REJECTED final, so an admin who saw an error could never retry the rejection
//      that had in fact already been recorded;
//   4. the public status view withholds `adminNotes` on statuses that are not addressed to
//      the employer, because the id that authenticates that route is just a UUID.

import { BadRequestException } from '@nestjs/common';
import { EmployerRequestStatus } from '@prisma/client';
import { EmployerRequestService } from './employer-request.service';

const REQUEST = {
  id: '11111111-1111-4111-8111-111111111111',
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
  domainCheck: null,
  domainCheckedAt: null,
  createdAt: new Date('2026-08-27T00:00:00Z'),
  updatedAt: new Date('2026-08-27T00:00:00Z'),
};

const ADMIN_ID = 'admin-1';

describe('EmployerRequestService — review notifies the employer', () => {
  let repo: { findById: jest.Mock; updateStatus: jest.Mock };
  let email: {
    sendEmployerRequestRejected: jest.Mock;
    sendEmployerRequestMoreInfo: jest.Mock;
  };
  let service: EmployerRequestService;

  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue({ ...REQUEST }),
      // Echoes back what the route asked for, the way the real update would.
      updateStatus: jest
        .fn()
        .mockImplementation((id: string, input: Record<string, unknown>) =>
          Promise.resolve({ ...REQUEST, id, ...input, reviewedAt: new Date() }),
        ),
    };
    email = {
      sendEmployerRequestRejected: jest.fn().mockResolvedValue(undefined),
      sendEmployerRequestMoreInfo: jest.fn().mockResolvedValue(undefined),
    };
    service = new EmployerRequestService(repo as never, email as never);
  });

  it('emails the rejection reason verbatim', async () => {
    await service.review(REQUEST.id, ADMIN_ID, {
      status: EmployerRequestStatus.REJECTED,
      adminNotes: '  Company registration number did not match the registry.  ',
    });

    expect(email.sendEmployerRequestRejected).toHaveBeenCalledWith(
      'recruiting@techcorp.com',
      'TechCorp Inc',
      'Company registration number did not match the registry.',
    );
    expect(email.sendEmployerRequestMoreInfo).not.toHaveBeenCalled();
  });

  it('emails the question on PENDING_INFO, with the id so they can track it', async () => {
    await service.review(REQUEST.id, ADMIN_ID, {
      status: EmployerRequestStatus.PENDING_INFO,
      adminNotes: 'Please send a business registration document.',
    });

    expect(email.sendEmployerRequestMoreInfo).toHaveBeenCalledWith(
      'recruiting@techcorp.com',
      'TechCorp Inc',
      'Please send a business registration document.',
      REQUEST.id,
    );
    expect(email.sendEmployerRequestRejected).not.toHaveBeenCalled();
  });

  it('sends nothing on REVIEWING — internal triage is not news for the applicant', async () => {
    await service.review(REQUEST.id, ADMIN_ID, {
      status: EmployerRequestStatus.REVIEWING,
    });

    expect(repo.updateStatus).toHaveBeenCalled();
    expect(email.sendEmployerRequestRejected).not.toHaveBeenCalled();
    expect(email.sendEmployerRequestMoreInfo).not.toHaveBeenCalled();
  });

  it('refuses a rejection with no reason, and writes nothing', async () => {
    await expect(
      service.review(REQUEST.id, ADMIN_ID, {
        status: EmployerRequestStatus.REJECTED,
        adminNotes: '   ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repo.updateStatus).not.toHaveBeenCalled();
    expect(email.sendEmployerRequestRejected).not.toHaveBeenCalled();
  });

  it('refuses PENDING_INFO with no question — an unanswerable request', async () => {
    await expect(
      service.review(REQUEST.id, ADMIN_ID, {
        status: EmployerRequestStatus.PENDING_INFO,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repo.updateStatus).not.toHaveBeenCalled();
  });

  it('keeps a rejection that bounced — the decision is final and cannot be retried', async () => {
    email.sendEmployerRequestRejected.mockRejectedValue(new Error('SMTP down'));

    const result = await service.review(REQUEST.id, ADMIN_ID, {
      status: EmployerRequestStatus.REJECTED,
      adminNotes: 'Not a registered business.',
    });

    expect(result.status).toBe(EmployerRequestStatus.REJECTED);
    expect(repo.updateStatus).toHaveBeenCalledTimes(1);
  });
});

describe('EmployerRequestService.publicStatus — what the UUID buys you', () => {
  const build = (status: EmployerRequestStatus, adminNotes: string | null) => {
    const repo = {
      findById: jest.fn().mockResolvedValue({ ...REQUEST, status, adminNotes }),
      updateStatus: jest.fn(),
    };
    return new EmployerRequestService(repo as never, {} as never);
  };

  it('releases the admin message when it is addressed to the employer', async () => {
    for (const status of [
      EmployerRequestStatus.PENDING_INFO,
      EmployerRequestStatus.REJECTED,
    ]) {
      const dto = await build(
        status,
        'Send the registration document.',
      ).publicStatus(REQUEST.id);
      expect(dto.message).toBe('Send the registration document.');
      expect(dto.status).toBe(status);
    }
  });

  it('withholds an internal triage note on every other status', async () => {
    for (const status of [
      EmployerRequestStatus.SUBMITTED,
      EmployerRequestStatus.REVIEWING,
      EmployerRequestStatus.APPROVED,
    ]) {
      const dto = await build(
        status,
        'Looks like a shell company, digging.',
      ).publicStatus(REQUEST.id);
      expect(dto.message).toBeUndefined();
    }
  });

  it('never carries the contact email or anything else identifying', async () => {
    const dto = await build(EmployerRequestStatus.REJECTED, 'No.').publicStatus(
      REQUEST.id,
    );

    expect(Object.keys(dto).sort()).toEqual([
      'companyName',
      'id',
      'message',
      'status',
      'submittedAt',
    ]);
    expect(JSON.stringify(dto)).not.toContain('techcorp.com');
  });
});
