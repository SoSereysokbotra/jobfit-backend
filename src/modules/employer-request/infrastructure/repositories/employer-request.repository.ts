// src/modules/employer-request/infrastructure/repositories/employer-request.repository.ts
//
// Prisma access for the employer onboarding ticket. The approval write is NOT here — it
// creates a User and mutates the request together and must be one transaction, so it lives
// in EmployerApprovalService where that atomicity is visible at the call site.

import { Injectable } from '@nestjs/common';
import {
  EmployerRequest,
  EmployerRequestStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

@Injectable()
export class EmployerRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(input: {
    companyName: string;
    companyEmail: string;
    contactName: string;
    contactRole: string;
    description: string;
    companyWebsite?: string | null;
    supportingDocsUrl?: string | null;
  }): Promise<EmployerRequest> {
    return this.prisma.employerRequest.create({ data: input });
  }

  findById(id: string): Promise<EmployerRequest | null> {
    return this.prisma.employerRequest.findUnique({ where: { id } });
  }

  /**
   * The one approved request for an address, if any.
   *
   * `companyEmail` is not unique (a rejected request must not block an address forever),
   * so this filters to APPROVED — of which there can be at most one per account, because
   * `approvedUserId` is unique and `users.email` is unique.
   */
  findApprovedByEmail(email: string): Promise<EmployerRequest | null> {
    return this.prisma.employerRequest.findFirst({
      where: {
        companyEmail: email,
        status: EmployerRequestStatus.APPROVED,
      },
    });
  }

  /** Is there already an open ticket for this address? Blocks duplicate submissions. */
  findOpenByEmail(email: string): Promise<EmployerRequest | null> {
    return this.prisma.employerRequest.findFirst({
      where: {
        companyEmail: email,
        status: {
          in: [
            EmployerRequestStatus.SUBMITTED,
            EmployerRequestStatus.REVIEWING,
            EmployerRequestStatus.PENDING_INFO,
          ],
        },
      },
    });
  }

  async findMany(params: {
    status?: EmployerRequestStatus;
    search?: string;
    skip: number;
    take: number;
  }): Promise<{ items: EmployerRequest[]; total: number }> {
    const where: Prisma.EmployerRequestWhereInput = {};
    if (params.status) where.status = params.status;
    if (params.search) {
      where.OR = [
        { companyName: { contains: params.search, mode: 'insensitive' } },
        { companyEmail: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.employerRequest.findMany({
        where,
        // Oldest first: the queue is worked front to back, and that is also the order the
        // 48-hour SLA cares about.
        orderBy: { createdAt: 'asc' },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.employerRequest.count({ where }),
    ]);
    return { items, total };
  }

  updateStatus(
    id: string,
    input: {
      status: EmployerRequestStatus;
      adminNotes?: string | null;
      reviewedByAdminId: string;
    },
  ): Promise<EmployerRequest> {
    return this.prisma.employerRequest.update({
      where: { id },
      data: { ...input, reviewedAt: new Date() },
    });
  }

  setActivationCode(
    id: string,
    code: string,
    expiry: Date,
  ): Promise<EmployerRequest> {
    return this.prisma.employerRequest.update({
      where: { id },
      data: { activationCode: code, activationCodeExpiry: expiry },
    });
  }

  clearActivationCode(id: string): Promise<EmployerRequest> {
    return this.prisma.employerRequest.update({
      where: { id },
      data: { activationCode: null, activationCodeExpiry: null },
    });
  }
}
