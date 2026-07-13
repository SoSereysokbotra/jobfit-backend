// src/modules/employer/infrastructure/repositories/employer-profile.repository.ts
//
// Prisma-backed access to EmployerProfile — the existing employer<->company link (one
// profile per user, one company per employer). Used to resolve the acting employer's
// company (the authorization boundary for all employer features) and to "claim" a company.

import { Injectable } from '@nestjs/common';
import { EmployerProfile } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

@Injectable()
export class EmployerProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUserId(userId: string): Promise<EmployerProfile | null> {
    return this.prisma.employerProfile.findUnique({ where: { userId } });
  }

  /** True if any employer has already claimed this company (one-admin-per-company MVP rule). */
  async isCompanyClaimed(companyId: string): Promise<boolean> {
    const count = await this.prisma.employerProfile.count({
      where: { companyId },
    });
    return count > 0;
  }

  create(input: {
    userId: string;
    companyId: string;
    firstName: string;
    lastName: string;
  }): Promise<EmployerProfile> {
    return this.prisma.employerProfile.create({ data: input });
  }
}
