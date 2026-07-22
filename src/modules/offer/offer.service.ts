// src/modules/offer/offer.service.ts
//
// Offers & Decisions. Employers extend/edit/withdraw offers on applications for their
// company; seekers list their offers and accept/decline/negotiate. Accepting one offer
// auto-archives the seeker's other active offers (business rule).

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import {
  CreateOfferDto,
  NegotiateOfferDto,
  UpdateOfferDto,
} from './dtos/offer-request.dtos';
import {
  EmployerOfferResponseDto,
  OfferResponseDto,
} from './dtos/offer-response.dto';

// Shared include: the seeker view needs the job (+ company name); the employer view
// additionally needs the candidate. Selecting exactly what the DTOs read.
const JOB_SELECT = {
  id: true,
  title: true,
  companyId: true,
  location: true,
  remoteType: true,
  minSalary: true,
  maxSalary: true,
  company: { select: { name: true } },
} as const;

const SEEKER_INCLUDE = {
  application: { select: { id: true, userId: true, job: { select: JOB_SELECT } } },
} as const;

const EMPLOYER_INCLUDE = {
  application: {
    select: {
      id: true,
      userId: true,
      job: { select: JOB_SELECT },
      user: { select: { id: true, name: true, email: true } },
    },
  },
} as const;

const DECIDABLE = ['EXTENDED', 'NEGOTIATING'] as const;

@Injectable()
export class OfferService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Employer side ───────────────────────────────────────────────────────────

  /** Extend (or re-extend) an offer on an application for the employer's company. */
  async extendOffer(
    userId: string,
    applicationId: string,
    dto: CreateOfferDto,
  ): Promise<EmployerOfferResponseDto> {
    const profile = await this.prisma.employerProfile.findUnique({
      where: { userId },
      select: { companyId: true },
    });
    if (!profile) throw new ForbiddenException('You do not manage a company.');

    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, job: { select: { companyId: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.job.companyId !== profile.companyId) {
      throw new ForbiddenException('This application is for another company.');
    }

    const comp = {
      baseSalary: dto.baseSalary,
      currency: dto.currency ?? 'USD',
      ...this.optionalData(dto),
    };
    await this.prisma.offer.upsert({
      where: { applicationId },
      create: { applicationId, ...comp, status: 'EXTENDED', extendedByEmployerId: userId },
      update: { ...comp, status: 'EXTENDED', decidedAt: null, extendedByEmployerId: userId },
    });
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { status: 'OFFER' },
    });

    return this.employerOfferByApplication(applicationId);
  }

  /** Edit an offer that hasn't been decided yet. */
  async updateOffer(
    userId: string,
    applicationId: string,
    dto: UpdateOfferDto,
  ): Promise<EmployerOfferResponseDto> {
    await this.assertEmployerOwnsApplication(userId, applicationId);
    const offer = await this.prisma.offer.findUnique({ where: { applicationId } });
    if (!offer) throw new NotFoundException('No offer on this application');
    if (!DECIDABLE.includes(offer.status as (typeof DECIDABLE)[number])) {
      throw new BadRequestException('This offer can no longer be edited.');
    }
    const data = {
      ...(dto.baseSalary !== undefined && { baseSalary: dto.baseSalary }),
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...this.optionalData(dto),
    };
    await this.prisma.offer.update({ where: { applicationId }, data });
    return this.employerOfferByApplication(applicationId);
  }

  /** Rescind an offer; the candidate returns to a rejected state. */
  async withdrawOffer(
    userId: string,
    applicationId: string,
  ): Promise<EmployerOfferResponseDto> {
    await this.assertEmployerOwnsApplication(userId, applicationId);
    const offer = await this.prisma.offer.findUnique({ where: { applicationId } });
    if (!offer) throw new NotFoundException('No offer on this application');
    await this.prisma.$transaction([
      this.prisma.offer.update({
        where: { applicationId },
        data: { status: 'WITHDRAWN', decidedAt: new Date() },
      }),
      this.prisma.application.update({ where: { id: applicationId }, data: { status: 'REJECTED' } }),
    ]);
    return this.employerOfferByApplication(applicationId);
  }

  // ── Seeker side ─────────────────────────────────────────────────────────────

  /** All offers extended to the current user, newest first. */
  async listMyOffers(userId: string): Promise<OfferResponseDto[]> {
    const rows = await this.prisma.offer.findMany({
      where: { application: { userId } },
      include: SEEKER_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => new OfferResponseDto(r as never));
  }

  async getMyOffer(userId: string, offerId: string): Promise<OfferResponseDto> {
    const offer = await this.loadOwnedOffer(userId, offerId);
    return new OfferResponseDto(offer as never);
  }

  /** Accept an offer: also archives the user's other active offers. */
  async accept(userId: string, offerId: string): Promise<OfferResponseDto> {
    const offer = await this.loadOwnedOffer(userId, offerId);
    this.assertDecidable(offer.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.offer.update({ where: { id: offerId }, data: { status: 'ACCEPTED', decidedAt: new Date() } });
      await tx.application.update({ where: { id: offer.applicationId }, data: { status: 'ACCEPTED' } });

      const others = await tx.offer.findMany({
        where: { id: { not: offerId }, status: { in: ['EXTENDED', 'NEGOTIATING'] }, application: { userId } },
        select: { id: true, applicationId: true },
      });
      for (const o of others) {
        await tx.offer.update({ where: { id: o.id }, data: { status: 'WITHDRAWN', decidedAt: new Date() } });
        await tx.application.update({ where: { id: o.applicationId }, data: { status: 'ARCHIVED' } });
      }
    });

    return this.getMyOffer(userId, offerId);
  }

  /** Decline an offer; the application is rejected. */
  async decline(userId: string, offerId: string): Promise<OfferResponseDto> {
    const offer = await this.loadOwnedOffer(userId, offerId);
    this.assertDecidable(offer.status);
    await this.prisma.$transaction([
      this.prisma.offer.update({ where: { id: offerId }, data: { status: 'DECLINED', decidedAt: new Date() } }),
      this.prisma.application.update({ where: { id: offer.applicationId }, data: { status: 'REJECTED' } }),
    ]);
    return this.getMyOffer(userId, offerId);
  }

  /** Open negotiation: records the seeker's note and flips both statuses to NEGOTIATING. */
  async negotiate(
    userId: string,
    offerId: string,
    dto: NegotiateOfferDto,
  ): Promise<OfferResponseDto> {
    const offer = await this.loadOwnedOffer(userId, offerId);
    this.assertDecidable(offer.status);
    const note = `[Candidate] ${dto.notes}`;
    const notes = offer.notes ? `${offer.notes}\n${note}` : note;
    await this.prisma.$transaction([
      this.prisma.offer.update({ where: { id: offerId }, data: { status: 'NEGOTIATING', notes } }),
      this.prisma.application.update({ where: { id: offer.applicationId }, data: { status: 'NEGOTIATING' } }),
    ]);
    return this.getMyOffer(userId, offerId);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** The seven optional compensation fields, only those provided. */
  private optionalData(dto: UpdateOfferDto) {
    return {
      ...(dto.signingBonus !== undefined && { signingBonus: dto.signingBonus }),
      ...(dto.annualBonusPct !== undefined && { annualBonusPct: dto.annualBonusPct }),
      ...(dto.equityShares !== undefined && { equityShares: dto.equityShares }),
      ...(dto.equityPrice !== undefined && { equityPrice: dto.equityPrice }),
      ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
      ...(dto.responseDeadline !== undefined && { responseDeadline: new Date(dto.responseDeadline) }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    };
  }

  private assertDecidable(status: string): void {
    if (!DECIDABLE.includes(status as (typeof DECIDABLE)[number])) {
      throw new BadRequestException(`This offer is already ${status.toLowerCase()}.`);
    }
  }

  private async loadOwnedOffer(userId: string, offerId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      include: SEEKER_INCLUDE,
    });
    if (!offer) throw new NotFoundException('Offer not found');
    if (offer.application.userId !== userId) {
      throw new ForbiddenException('You can only act on your own offers.');
    }
    return offer;
  }

  private async assertEmployerOwnsApplication(userId: string, applicationId: string): Promise<void> {
    const profile = await this.prisma.employerProfile.findUnique({
      where: { userId },
      select: { companyId: true },
    });
    if (!profile) throw new ForbiddenException('You do not manage a company.');
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { job: { select: { companyId: true } } },
    });
    if (!app) throw new NotFoundException('Application not found');
    if (app.job.companyId !== profile.companyId) {
      throw new ForbiddenException('This application is for another company.');
    }
  }

  private async employerOfferByApplication(applicationId: string): Promise<EmployerOfferResponseDto> {
    const offer = await this.prisma.offer.findUnique({
      where: { applicationId },
      include: EMPLOYER_INCLUDE,
    });
    if (!offer) throw new NotFoundException('Offer not found');
    return new EmployerOfferResponseDto(offer as never);
  }
}
