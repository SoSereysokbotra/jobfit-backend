// src/modules/employer/application/services/employer-context.service.ts
//
// Resolves the acting employer's context — their EmployerProfile and the company they
// manage — from the authenticated userId. The company is the authorization boundary for
// every employer feature: an employer may only touch jobs/applications for THEIR company.

import { ForbiddenException, Injectable } from '@nestjs/common';
import { EmployerProfileRepository } from '../../infrastructure/repositories/employer-profile.repository';

export interface EmployerContext {
  employerProfileId: string;
  companyId: string;
}

@Injectable()
export class EmployerContextService {
  constructor(private readonly profileRepo: EmployerProfileRepository) {}

  /**
   * Resolve the employer's company. Throws 403 if the user has not claimed a company yet
   * (i.e. has no EmployerProfile) — they must claim one before using employer features.
   */
  async requireContext(userId: string): Promise<EmployerContext> {
    const profile = await this.profileRepo.findByUserId(userId);
    if (!profile) {
      throw new ForbiddenException(
        'No company associated with this account. Claim a company first.',
      );
    }
    return { employerProfileId: profile.id, companyId: profile.companyId };
  }

  /** Assert the employer's company matches `companyId`; throws 403 otherwise. */
  assertOwnsCompany(context: EmployerContext, companyId: string): void {
    if (context.companyId !== companyId) {
      throw new ForbiddenException('You do not manage this company.');
    }
  }
}
