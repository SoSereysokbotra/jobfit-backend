import { Injectable } from '@nestjs/common';
import { CompanyRepository } from './infrastructure/repositories/company.repository';
import {
  CompanyIntelDto,
  HiringVelocity,
} from './dto/company-intel.dto';

@Injectable()
export class CompanyService {
  constructor(private readonly companies: CompanyRepository) {}

  /**
   * Company intelligence for the extension sidebar, looked up by display name.
   * Returns `null` (envelope `data: null`) when the company isn't in our database,
   * so the extension gets a clean empty state rather than a data-less envelope.
   */
  async getByName(name: string): Promise<CompanyIntelDto | null> {
    const company = await this.companies.findByNameInsensitive(name.trim());
    if (!company) return null;

    const openRoles = await this.companies.countOpenJobs(company.id);

    return {
      name: company.name,
      glassdoorRating: company.glassdoorRating ?? null,
      fundingStage: null, // not tracked on the Company model
      hiringVelocity: this.velocityFromOpenRoles(openRoles),
      openRoles,
      salaryRange: null, // no salary aggregate wired yet
      topMatches: [], // per-user matches not joined yet
    };
  }

  /** Coarse hiring signal derived from how many roles are currently open. */
  private velocityFromOpenRoles(openRoles: number): HiringVelocity | null {
    if (openRoles >= 8) return 'HIGH';
    if (openRoles >= 3) return 'MEDIUM';
    if (openRoles >= 1) return 'LOW';
    return null;
  }
}
