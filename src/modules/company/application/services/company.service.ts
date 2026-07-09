// src/modules/company/application/services/company.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CompanyRepository,
  CompanySearchFilters,
} from '../../infrastructure/repositories/company.repository';
import { Company } from '../../domain/entities/company.entity';
import { CreateCompanyDto } from '../dtos/create-company.dto';
import { Location } from '@shared/kernel/value-objects/location.vo';

@Injectable()
export class CompanyService {
  constructor(private readonly companyRepository: CompanyRepository) {}

  async createCompany(dto: CreateCompanyDto): Promise<Company> {
    const existing = await this.companyRepository.findByName(dto.name);
    if (existing) {
      throw new BadRequestException(
        `A company named "${dto.name}" already exists`,
      );
    }

    const location =
      dto.city && dto.country
        ? Location.create(dto.city, dto.state ?? '', dto.country)
        : undefined;

    const company = Company.create({
      name: dto.name,
      description: dto.description,
      website: dto.website,
      logoUrl: dto.logoUrl,
      industry: dto.industry,
      size: dto.size,
      foundedYear: dto.foundedYear,
      location,
      glassdoorId: dto.glassdoorId,
      glassdoorRating: dto.glassdoorRating,
      glassdoorReviews: dto.glassdoorReviews,
    });
    await this.companyRepository.save(company);
    return company;
  }

  async getCompanyById(id: string): Promise<Company> {
    const company = await this.companyRepository.findById(id);
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async searchCompanies(
    query: string,
    filters?: CompanySearchFilters,
  ): Promise<Company[]> {
    return this.companyRepository.search(query, filters);
  }

  async getCompanyStats(
    id: string,
  ): Promise<{ jobCount: number; reviews: number }> {
    const company = await this.getCompanyById(id);
    const jobCount = await this.companyRepository.countJobs(company.id);
    return { jobCount, reviews: company.glassdoorReviews ?? 0 };
  }

  async deleteCompany(id: string): Promise<void> {
    await this.getCompanyById(id); // verify exists (throws NotFound)
    await this.companyRepository.delete(id);
  }
}
