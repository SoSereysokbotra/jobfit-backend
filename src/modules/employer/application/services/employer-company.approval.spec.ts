// src/modules/employer/application/services/employer-company.approval.spec.ts
//
// Phase 4 composes two verification signals that used to be alternatives: an admin reading
// a business registration, and the automated email-domain match.
//
// The tests that matter are the ones where the two DISAGREE, because that is the case the
// composition exists for and the case a naive implementation gets wrong in both directions:
//
//   - too strict — a company row with no website 400s an employer a human already verified;
//   - too loose  — approval hands out an EMPLOYER account, and without a check on
//     approvedCompanyId the claim step would let it attach to any unclaimed company.
//
// The self-service path (no approved request) must be left exactly as it was: there the
// domain match is the only evidence, so it stays authoritative.

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { CompanyVerificationMethod, DomainCheckResult } from '@prisma/client';
import { EmployerCompanyService } from './employer-company.service';

const company = (over: Record<string, unknown> = {}) => ({
  id: 'company-1',
  name: 'TechCorp Inc',
  website: 'https://techcorp.com',
  isVerified: false,
  verificationMethod: null,
  verifiedAt: null,
  description: null,
  logoUrl: null,
  industry: null,
  size: null,
  foundedYear: null,
  city: null,
  state: null,
  country: null,
  ...over,
});

const approvedRequest = (over: Record<string, unknown> = {}) => ({
  id: 'req-1',
  approvedUserId: 'user-1',
  approvedCompanyId: 'company-1',
  ...over,
});

describe('EmployerCompanyService — approval composed with domain verification', () => {
  let profileRepo: {
    findByUserId: jest.Mock;
    isCompanyClaimed: jest.Mock;
    create: jest.Mock;
  };
  let companyRepo: { findById: jest.Mock; markVerified: jest.Mock };
  let context: { requireContext: jest.Mock; assertOwnsCompany: jest.Mock };
  let requests: {
    findApprovedByUserId: jest.Mock;
    recordDomainCheck: jest.Mock;
  };
  let service: EmployerCompanyService;

  const claimDto = {
    companyId: 'company-1',
    firstName: 'Jane',
    lastName: 'Doe',
  };

  beforeEach(() => {
    profileRepo = {
      findByUserId: jest.fn().mockResolvedValue(null),
      isCompanyClaimed: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockResolvedValue({}),
    };
    companyRepo = {
      findById: jest.fn().mockResolvedValue(company()),
      markVerified: jest
        .fn()
        .mockImplementation((id, method) =>
          Promise.resolve(
            company({ id, isVerified: true, verificationMethod: method }),
          ),
        ),
    };
    context = {
      requireContext: jest.fn().mockResolvedValue({ companyId: 'company-1' }),
      assertOwnsCompany: jest.fn(),
    };
    requests = {
      findApprovedByUserId: jest.fn().mockResolvedValue(null),
      recordDomainCheck: jest.fn().mockResolvedValue({}),
    };

    service = new EmployerCompanyService(
      profileRepo as never,
      companyRepo as never,
      context as never,
      requests as never,
    );
  });

  describe('claim', () => {
    // The load-bearing authorisation test. Approval grants an account; without this it
    // would effectively grant every unclaimed company on the platform.
    it('refuses a company the employer was not approved for', async () => {
      requests.findApprovedByUserId.mockResolvedValue(
        approvedRequest({ approvedCompanyId: 'company-other' }),
      );

      await expect(
        service.claim('user-1', 'jane@techcorp.com', claimDto),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(profileRepo.create).not.toHaveBeenCalled();
    });

    it('verifies on the approval, recording ADMIN_REVIEW rather than the domain match', async () => {
      requests.findApprovedByUserId.mockResolvedValue(approvedRequest());

      const result = await service.claim('user-1', 'jane@techcorp.com', claimDto);

      expect(companyRepo.markVerified).toHaveBeenCalledWith(
        'company-1',
        CompanyVerificationMethod.ADMIN_REVIEW,
      );
      expect(result.isVerified).toBe(true);
    });

    // The case the whole phase exists for: many seeded and ingested company rows have no
    // website, which the strict check answers with a 400.
    it('still verifies when the company has no website to check against', async () => {
      companyRepo.findById.mockResolvedValue(company({ website: null }));
      requests.findApprovedByUserId.mockResolvedValue(approvedRequest());

      await expect(
        service.claim('user-1', 'jane@techcorp.com', claimDto),
      ).resolves.toMatchObject({ isVerified: true });
      expect(requests.recordDomainCheck).toHaveBeenCalledWith(
        'req-1',
        DomainCheckResult.NO_WEBSITE,
      );
    });

    it('still verifies on a domain mismatch, but records it', async () => {
      requests.findApprovedByUserId.mockResolvedValue(approvedRequest());

      await service.claim('user-1', 'jane@techcorp-asia.com', claimDto);

      expect(requests.recordDomainCheck).toHaveBeenCalledWith(
        'req-1',
        DomainCheckResult.MISMATCH,
      );
      expect(companyRepo.markVerified).toHaveBeenCalled();
    });

    it('records a match when both signals agree', async () => {
      requests.findApprovedByUserId.mockResolvedValue(approvedRequest());

      await service.claim('user-1', 'jane@www.TechCorp.com', claimDto);

      expect(requests.recordDomainCheck).toHaveBeenCalledWith(
        'req-1',
        DomainCheckResult.MATCH,
      );
    });

    // Advisory data must never gate an authorised verification.
    it('verifies even if recording the domain signal fails', async () => {
      requests.findApprovedByUserId.mockResolvedValue(approvedRequest());
      requests.recordDomainCheck.mockRejectedValue(new Error('db down'));

      await expect(
        service.claim('user-1', 'jane@techcorp.com', claimDto),
      ).resolves.toMatchObject({ isVerified: true });
    });

    it('leaves a self-service claim unverified, exactly as before', async () => {
      const result = await service.claim('user-1', 'jane@techcorp.com', claimDto);

      expect(companyRepo.markVerified).not.toHaveBeenCalled();
      expect(requests.recordDomainCheck).not.toHaveBeenCalled();
      expect(result.isVerified).toBe(false);
    });
  });

  describe('verifyEmail', () => {
    // Reachable for an employer who claimed before this composition shipped. Without the
    // branch they are stuck behind a check their company data cannot pass.
    it('honours an approval for an employer who already claimed', async () => {
      companyRepo.findById.mockResolvedValue(company({ website: null }));
      requests.findApprovedByUserId.mockResolvedValue(approvedRequest());

      const result = await service.verifyEmail(
        'user-1',
        'jane@techcorp.com',
        'company-1',
      );

      expect(result.verificationMethod).toBe(
        CompanyVerificationMethod.ADMIN_REVIEW,
      );
    });

    it('keeps the strict domain check for a self-service employer', async () => {
      companyRepo.findById.mockResolvedValue(company({ website: null }));

      await expect(
        service.verifyEmail('user-1', 'jane@techcorp.com', 'company-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('still refuses a self-service mismatch', async () => {
      await expect(
        service.verifyEmail('user-1', 'jane@somewhere-else.com', 'company-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(companyRepo.markVerified).not.toHaveBeenCalled();
    });

    it('verifies a self-service match with EMAIL_DOMAIN, not ADMIN_REVIEW', async () => {
      const result = await service.verifyEmail(
        'user-1',
        'jane@techcorp.com',
        'company-1',
      );

      expect(result.verificationMethod).toBe(
        CompanyVerificationMethod.EMAIL_DOMAIN,
      );
    });
  });
});
