// src/modules/employer/application/services/employer-company.service.ts
//
// Company Profile Management (Feature 1): claim a company, verify ownership by email
// domain, and edit the company profile. "Claiming" creates the EmployerProfile that links
// the user to the company (the existing employer<->company model). One admin per company
// (MVP rule).

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanyVerificationMethod } from '@prisma/client';
import { EmployerProfileRepository } from '../../infrastructure/repositories/employer-profile.repository';
import { EmployerCompanyRepository } from '../../infrastructure/repositories/employer-company.repository';
import { EmployerContextService } from './employer-context.service';
import { ClaimCompanyDto } from '../dtos/claim-company.dto';
import { UpdateCompanyDto } from '../dtos/update-company.dto';
import { EmployerCompanyResponseDto } from '../dtos/company-response.dto';

@Injectable()
export class EmployerCompanyService {
  constructor(
    private readonly profileRepo: EmployerProfileRepository,
    private readonly companyRepo: EmployerCompanyRepository,
    private readonly context: EmployerContextService,
  ) {}

  /** Claim an existing company: link the acting user to it via a new EmployerProfile. */
  async claim(
    userId: string,
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

    await this.profileRepo.create({
      userId,
      companyId: dto.companyId,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    return new EmployerCompanyResponseDto(company);
  }

  /**
   * Verify company ownership by matching the employer's email domain against the
   * company's website domain. On success marks the company verified (EMAIL_DOMAIN).
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
