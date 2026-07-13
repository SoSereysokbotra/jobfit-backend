// src/modules/employer/infrastructure/repositories/employer-company.repository.ts
//
// Prisma-backed access to the `companies` table for employer-facing reads/writes
// (profile edits + ownership verification). Kept employer-owned (like the admin module's
// repositories) so the employer surface does not depend on the partially-built company
// module.

import { Injectable } from '@nestjs/common';
import { Company, CompanyVerificationMethod, Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

@Injectable()
export class EmployerCompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<Company | null> {
    return this.prisma.company.findFirst({ where: { id, deletedAt: null } });
  }

  update(id: string, data: Prisma.CompanyUpdateInput): Promise<Company> {
    return this.prisma.company.update({ where: { id }, data });
  }

  markVerified(
    id: string,
    method: CompanyVerificationMethod,
  ): Promise<Company> {
    return this.prisma.company.update({
      where: { id },
      data: {
        isVerified: true,
        verificationMethod: method,
        verifiedAt: new Date(),
      },
    });
  }
}
