// src/modules/employer/application/services/employer-company.service.ts
//
// Company Profile Management (Feature 1): claim a company, verify ownership by email
// domain, and edit the company profile. "Claiming" creates the EmployerProfile that links
// the user to the company (the existing employer<->company model). One admin per company
// (MVP rule).

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Company,
  CompanyVerificationMethod,
  DomainCheckResult,
} from '@prisma/client';
import { EmployerRequestRepository } from '@modules/employer-request/infrastructure/repositories/employer-request.repository';
import { EmployerProfileRepository } from '../../infrastructure/repositories/employer-profile.repository';
import { EmployerCompanyRepository } from '../../infrastructure/repositories/employer-company.repository';
import { EmployerContextService } from './employer-context.service';
import { ClaimCompanyDto } from '../dtos/claim-company.dto';
import { UpdateCompanyDto } from '../dtos/update-company.dto';
import { EmployerCompanyResponseDto } from '../dtos/company-response.dto';

@Injectable()
export class EmployerCompanyService {
  private readonly logger = new Logger(EmployerCompanyService.name);

  constructor(
    private readonly profileRepo: EmployerProfileRepository,
    private readonly companyRepo: EmployerCompanyRepository,
    private readonly context: EmployerContextService,
    private readonly requests: EmployerRequestRepository,
  ) {}

  /**
   * Claim an existing company: link the acting user to it via a new EmployerProfile.
   *
   * For an admin-approved employer this is also where verification lands. The admin already
   * checked a business registration, so the approval IS the verification — the automated
   * domain check runs alongside it and is recorded, but it does not get a veto
   * (employer_logic.md v2.1 §6).
   */
  async claim(
    userId: string,
    userEmail: string,
    dto: ClaimCompanyDto,
  ): Promise<EmployerCompanyResponseDto> {
    const company = await this.companyRepo.findById(dto.companyId);
    if (!company) throw new NotFoundException('Company not found');

    const existingProfile = await this.profileRepo.findByUserId(userId);
    if (existingProfile) {
      throw new ConflictException('This account already manages a company.');
    }
    if (await this.profileRepo.isCompanyClaimed(dto.companyId)) {
      throw new ConflictException('This company has already been claimed.');
    }

    // An approved employer may claim ONLY the company they were approved for. Without this
    // the admin's decision is advisory: approval hands out an EMPLOYER account, and the
    // claim step would then let it attach to any unclaimed company on the platform.
    const approved = await this.requests.findApprovedByUserId(userId);
    if (
      approved?.approvedCompanyId &&
      approved.approvedCompanyId !== dto.companyId
    ) {
      throw new ForbiddenException(
        'Your account was approved for a different company. Contact JobFit support if that is wrong.',
      );
    }

    await this.profileRepo.create({
      userId,
      companyId: dto.companyId,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    if (approved?.approvedCompanyId === dto.companyId) {
      return new EmployerCompanyResponseDto(
        await this.verifyOnApproval(approved.id, userEmail, company),
      );
    }
    return new EmployerCompanyResponseDto(company);
  }

  /**
   * Verify company ownership.
   *
   * TWO PATHS, and which one applies is decided by whether an admin already vouched:
   *
   *  - ADMIN-APPROVED — the approval carries the verification. Normally claim() has
   *    already done this, so the call is a no-op; the branch remains for an employer who
   *    claimed before this composition existed, who would otherwise be permanently stuck
   *    behind a check their company data cannot pass.
   *  - SELF-SERVICE — unchanged. The domain match is the only evidence there is, so it
   *    stays authoritative and a mismatch is still a 400.
   */
  async verifyEmail(
    userId: string,
    userEmail: string,
    companyId: string,
  ): Promise<EmployerCompanyResponseDto> {
    const ctx = await this.context.requireContext(userId);
    this.context.assertOwnsCompany(ctx, companyId);

    const company = await this.companyRepo.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');
    if (company.isVerified) {
      return new EmployerCompanyResponseDto(company);
    }

    const approved = await this.requests.findApprovedByUserId(userId);
    if (approved?.approvedCompanyId === companyId) {
      return new EmployerCompanyResponseDto(
        await this.verifyOnApproval(approved.id, userEmail, company),
      );
    }

    if (!company.website) {
      throw new BadRequestException(
        'Company has no website to verify the email domain against.',
      );
    }

    const emailDomain = domainFromEmail(userEmail);
    const siteDomain = domainFromUrl(company.website);
    if (!emailDomain || !siteDomain || emailDomain !== siteDomain) {
      throw new BadRequestException(
        'Your email domain does not match the company website domain.',
      );
    }

    const updated = await this.companyRepo.markVerified(
      companyId,
      CompanyVerificationMethod.EMAIL_DOMAIN,
    );
    return new EmployerCompanyResponseDto(updated);
  }

  async getCompany(
    userId: string,
    companyId: string,
  ): Promise<EmployerCompanyResponseDto> {
    const ctx = await this.context.requireContext(userId);
    this.context.assertOwnsCompany(ctx, companyId);
    const company = await this.companyRepo.findById(companyId);
    if (!company) throw new NotFoundException('Company not found');
    return new EmployerCompanyResponseDto(company);
  }

  /**
   * The company the acting employer manages, resolved from their EmployerProfile —
   * so the frontend can bootstrap without already knowing the company id.
   */
  async getMyCompany(userId: string): Promise<EmployerCompanyResponseDto> {
    const ctx = await this.context.requireContext(userId);
    const company = await this.companyRepo.findById(ctx.companyId);
    if (!company) throw new NotFoundException('Company not found');
    return new EmployerCompanyResponseDto(company);
  }

  /**
   * Mark a company verified on the strength of an admin approval, and record separately
   * what the automated domain check thought.
   *
   * `verificationMethod` is set to ADMIN_REVIEW rather than EMAIL_DOMAIN even when the
   * domains happen to match, because the approval is what actually carried it. Collapsing
   * the two would leave an audit unable to tell which signal was relied on.
   */
  private async verifyOnApproval(
    requestId: string,
    userEmail: string,
    company: Company,
  ): Promise<Company> {
    await this.recordDomainSignal(requestId, userEmail, company.website);
    return this.companyRepo.markVerified(
      company.id,
      CompanyVerificationMethod.ADMIN_REVIEW,
    );
  }

  /**
   * Advisory only. A failure to write it must never block a verification the admin already
   * authorised — the point of the column is to inform a later review, not to gate anything.
   */
  private async recordDomainSignal(
    requestId: string,
    userEmail: string,
    website: string | null,
  ): Promise<void> {
    const emailDomain = domainFromEmail(userEmail);
    const siteDomain = website ? domainFromUrl(website) : null;

    const result = !siteDomain
      ? DomainCheckResult.NO_WEBSITE
      : emailDomain && emailDomain === siteDomain
        ? DomainCheckResult.MATCH
        : DomainCheckResult.MISMATCH;

    try {
      await this.requests.recordDomainCheck(requestId, result);
      if (result !== DomainCheckResult.MATCH) {
        this.logger.warn(
          `Employer request ${requestId} verified by admin approval, but the domain check ` +
            `returned ${result} (${emailDomain ?? 'no email domain'} vs ${siteDomain ?? 'no website'}).`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Could not record the domain check for request ${requestId}: ${(err as Error).message}`,
      );
    }
  }

  async updateProfile(
    userId: string,
    companyId: string,
    dto: UpdateCompanyDto,
  ): Promise<EmployerCompanyResponseDto> {
    const ctx = await this.context.requireContext(userId);
    this.context.assertOwnsCompany(ctx, companyId);
    // Ensure it exists (and is not soft-deleted) before updating.
    const existing = await this.companyRepo.findById(companyId);
    if (!existing) throw new NotFoundException('Company not found');

    const updated = await this.companyRepo.update(companyId, { ...dto });
    return new EmployerCompanyResponseDto(updated);
  }
}

/** `jane@Tech-Corp.com` -> `tech-corp.com` */
function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return normalizeHost(email.slice(at + 1));
}

/** `https://www.TechCorp.com/careers` -> `techcorp.com` */
function domainFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return normalizeHost(host);
  } catch {
    // Not a full URL — treat the raw value as a host.
    return normalizeHost(url);
  }
}

function normalizeHost(host: string): string | null {
  const cleaned = host
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  return cleaned.length > 0 ? cleaned : null;
}
