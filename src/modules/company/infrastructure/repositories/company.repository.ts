// src/modules/company/infrastructure/repositories/company.repository.ts
//
// Prisma-backed persistence for the Company entity. Implements IRepository<Company> and
// adds finders + search. Maps rows to the domain entity (Location VO <-> flat columns).
// Soft delete via deletedAt.
//
// SEARCH: uses case-insensitive `contains` on name/description (Prisma cannot express
// PostgreSQL full-text search in the schema). For production FTS, add a tsvector GIN index
// via a raw migration and switch this method to a parameterised $queryRaw.

import { Injectable } from '@nestjs/common';
import { Company as PrismaCompany, Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { IRepository } from '@common/abstracts/repository';
import { Company } from '../../domain/entities/company.entity';
import { Location } from '@shared/kernel/value-objects/location.vo';

export interface CompanySearchFilters {
  industry?: string;
  size?: string;
}

@Injectable()
export class CompanyRepository implements IRepository<Company> {
  constructor(private readonly prisma: PrismaService) {}

  async save(company: Company): Promise<void> {
    const data = this.toPersistence(company);
    await this.prisma.company.upsert({
      where: { id: company.id },
      update: { ...data, updatedAt: company.updatedAt },
      create: { id: company.id, createdAt: company.createdAt, ...data },
    });
  }

  async findById(id: string): Promise<Company | null> {
    const row = await this.prisma.company.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  async findByName(name: string): Promise<Company | null> {
    const row = await this.prisma.company.findFirst({
      where: { name, deletedAt: null },
    });
    return row ? this.mapToDomain(row) : null;
  }

  async findAll(skip = 0, take = 20): Promise<Company[]> {
    const rows = await this.prisma.company.findMany({
      where: { deletedAt: null },
      skip,
      take,
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.mapToDomain(row));
  }

  async search(
    query: string,
    filters: CompanySearchFilters = {},
  ): Promise<Company[]> {
    const where: Prisma.CompanyWhereInput = { deletedAt: null };
    if (filters.industry) where.industry = filters.industry;
    if (filters.size) where.size = filters.size;
    if (query && query.trim().length > 0) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ];
    }
    const rows = await this.prisma.company.findMany({
      where,
      take: 50,
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => this.mapToDomain(row));
  }

  /** Soft delete — sets deletedAt. */
  async delete(id: string): Promise<void> {
    await this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Number of jobs posted by a company. */
  async countJobs(companyId: string): Promise<number> {
    return this.prisma.job.count({ where: { companyId } });
  }

  private toPersistence(
    company: Company,
  ): Omit<Prisma.CompanyUncheckedCreateInput, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      name: company.name,
      description: company.description ?? null,
      website: company.website ?? null,
      logoUrl: company.logoUrl ?? null,
      industry: company.industry ?? null,
      size: company.size ?? null,
      foundedYear: company.foundedYear ?? null,
      city: company.location?.city ?? null,
      state: company.location?.state ?? null,
      country: company.location?.country ?? null,
      glassdoorId: company.glassdoorId ?? null,
      glassdoorRating: company.glassdoorRating ?? null,
      glassdoorReviews: company.glassdoorReviews ?? null,
    };
  }

  private mapToDomain(raw: PrismaCompany): Company {
    const location =
      raw.city && raw.country
        ? Location.create(raw.city, raw.state ?? '', raw.country)
        : undefined;
    return new Company(
      {
        name: raw.name,
        description: raw.description ?? undefined,
        website: raw.website ?? undefined,
        logoUrl: raw.logoUrl ?? undefined,
        industry: raw.industry ?? undefined,
        size: raw.size ?? undefined,
        foundedYear: raw.foundedYear ?? undefined,
        location,
        glassdoorId: raw.glassdoorId ?? undefined,
        glassdoorRating: raw.glassdoorRating ?? undefined,
        glassdoorReviews: raw.glassdoorReviews ?? undefined,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      raw.id,
    );
  }
}
