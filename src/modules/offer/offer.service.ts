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
// Every status write in this file goes through the chokepoint. This module used to write
// status straight through Prisma in six places — which is how an employer could skip the
// interview stage, and why accepting an offer left no audit row anywhere.
import { ApplicationTransitionService } from '@modules/application/domain/services/application-transition.service';
import { WITHDRAWABLE_FROM } from '@modules/application/domain/entities/application.entity';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';
import { TransitionActor } from '@shared/kernel/enums/transition-actor.enum';
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

// Oldest first: a conversation reads top to bottom.
const MESSAGES_INCLUDE = {
  select: { id: true, authorRole: true, body: true, readAt: true, createdAt: true },
  orderBy: { createdAt: 'asc' },
} as const;

const SEEKER_INCLUDE = {
  application: { select: { id: true, userId: true, job: { select: JOB_SELECT } } },
  messages: MESSAGES_INCLUDE,
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
  messages: MESSAGES_INCLUDE,
} as const;

const DECIDABLE = ['EXTENDED', 'NEGOTIATING'] as const;

@Injectable()
export class OfferService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transitions: ApplicationTransitionService,
  ) {}

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
      select: { id: true, status: true, job: { select: { companyId: true } } },
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

    await this.prisma.$transaction(async (tx) => {
      const offer = await tx.offer.upsert({
        where: { applicationId },
        create: { applicationId, ...comp, status: 'EXTENDED', extendedByEmployerId: userId },
        update: { ...comp, status: 'EXTENDED', decidedAt: null, extendedByEmployerId: userId },
        select: { id: true },
      });

      // A note attached to the offer is a message now. Writing it to the column meant
      // re-extending wiped whatever the candidate had said.
      if (dto.notes?.trim()) {
        await tx.offerMessage.create({
          data: {
            offerId: offer.id,
            authorRole: 'EMPLOYER',
            authorUserId: userId,
            body: dto.notes.trim(),
          },
        });
      }

      // Re-extending an offer already on the table revises the money, not the stage.
      // OFFER -> OFFER is not a transition, and asking for one would fail.
      if (app.status === 'OFFER') return;

      // Extending to someone previously closed out reopens them into the pipeline rather
      // than teleporting them to the end. Two audited steps, so the record shows it.
      if (app.status === 'REJECTED') {
        await this.transitions.transition(
          {
            applicationId,
            newStatus: ApplicationStatus.SCREENING,
            actor: TransitionActor.EMPLOYER,
            actorUserId: userId,
            eventType: 'REOPENED',
            description: 'Reopened by the employer to extend a new offer',
          },
          tx,
        );
      }

      await this.transitions.transition(
        {
          applicationId,
          newStatus: ApplicationStatus.OFFER,
          actor: TransitionActor.EMPLOYER,
          actorUserId: userId,
          eventType: 'OFFER_EXTENDED',
          description: 'Offer extended',
        },
        tx,
      );
    });

    return this.employerOfferByApplication(applicationId);
  }

  /**
   * The offer on one of this company's applications, including its note thread.
   *
   * The employer could write offers but never read one back: there was no GET at all, so
   * when a candidate opened a negotiation their message landed in `notes` where nobody on
   * the employer side could reach it. Extending and editing returned the offer, but only
   * as the response to a write they had already decided to make.
   */
  async getOfferForEmployer(
    userId: string,
    applicationId: string,
  ): Promise<EmployerOfferResponseDto> {
    await this.assertEmployerOwnsApplication(userId, applicationId);
    const offer = await this.prisma.offer.findUnique({
      where: { applicationId },
      select: { id: true },
    });
    if (!offer) throw new NotFoundException('No offer on this application');
    // Opening the thread is reading it.
    await this.markThreadRead(offer.id, 'EMPLOYER');
    return this.employerOfferByApplication(applicationId);
  }

  /** Reply to the candidate. Says nothing about the offer's state — it is a message. */
  async postEmployerMessage(
    userId: string,
    applicationId: string,
    body: string,
  ): Promise<EmployerOfferResponseDto> {
    await this.assertEmployerOwnsApplication(userId, applicationId);
    const offer = await this.prisma.offer.findUnique({
      where: { applicationId },
      select: { id: true },
    });
    if (!offer) throw new NotFoundException('No offer on this application');

    await this.prisma.offerMessage.create({
      data: {
        offerId: offer.id,
        authorRole: 'EMPLOYER',
        authorUserId: userId,
        body,
      },
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
    await this.prisma.$transaction(async (tx) => {
      await tx.offer.update({
        where: { applicationId },
        data: { status: 'WITHDRAWN', decidedAt: new Date() },
      });
      await this.transitions.transition(
        {
          applicationId,
          newStatus: ApplicationStatus.REJECTED,
          actor: TransitionActor.EMPLOYER,
          actorUserId: userId,
          eventType: 'OFFER_RESCINDED',
          description: 'Offer rescinded by the employer',
        },
        tx,
      );
    });
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
    await this.markThreadRead(offerId, 'CANDIDATE');
    return new OfferResponseDto(offer as never);
  }

  /** Accept an offer: also archives the user's other active offers. */
  async accept(userId: string, offerId: string): Promise<OfferResponseDto> {
    const offer = await this.loadOwnedOffer(userId, offerId);
    this.assertDecidable(offer.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.offer.update({ where: { id: offerId }, data: { status: 'ACCEPTED', decidedAt: new Date() } });
      await this.transitions.transition(
        {
          applicationId: offer.applicationId,
          newStatus: ApplicationStatus.ACCEPTED,
          actor: TransitionActor.CANDIDATE,
          actorUserId: userId,
          eventType: 'OFFER_ACCEPTED',
          description: 'Candidate accepted the offer',
        },
        tx,
      );

      const others = await tx.offer.findMany({
        where: {
          id: { not: offerId },
          status: { in: ['EXTENDED', 'NEGOTIATING'] },
          application: {
            userId,
            // Only applications this can legally close.
            //
            // A live-looking offer row can sit on an application that is already finished
            // — the two were written independently before the lifecycle was enforced, so
            // ACCEPTED applications still carry EXTENDED offers. Sweeping one of those up
            // asks for ACCEPTED -> WITHDRAWN, which is refused, and because this runs in a
            // transaction the refusal rolled back the accept the candidate actually asked
            // for: clicking Accept failed outright.
            status: { in: WITHDRAWABLE_FROM as unknown as ApplicationStatus[] },
          },
        },
        select: { id: true, applicationId: true },
      });
      for (const o of others) {
        await tx.offer.update({ where: { id: o.id }, data: { status: 'WITHDRAWN', decidedAt: new Date() } });
        // Was ARCHIVED, which the lifecycle does not permit from OFFER or NEGOTIATING —
        // ARCHIVED is reachable only from a terminal state. WITHDRAWN is both legal and
        // truthful: the candidate walked away from these because they took another job.
        await this.transitions.transition(
          {
            applicationId: o.applicationId,
            newStatus: ApplicationStatus.WITHDRAWN,
            actor: TransitionActor.CANDIDATE,
            actorUserId: userId,
            eventType: 'AUTO_WITHDRAWN',
            description: 'Withdrawn automatically: the candidate accepted an offer elsewhere',
          },
          tx,
        );
      }
    });

    return this.getMyOffer(userId, offerId);
  }

  /**
   * Decline an offer; the candidate leaves the process.
   *
   * The application was previously set to REJECTED, which reads as "the employer rejected
   * this candidate" — the opposite of what happened, and not a status a candidate is
   * entitled to assert about themselves. WITHDRAWN is the truthful one and is theirs to
   * set. The decline itself is not lost: the Offer row records DECLINED.
   */
  async decline(userId: string, offerId: string): Promise<OfferResponseDto> {
    const offer = await this.loadOwnedOffer(userId, offerId);
    this.assertDecidable(offer.status);
    await this.prisma.$transaction(async (tx) => {
      await tx.offer.update({ where: { id: offerId }, data: { status: 'DECLINED', decidedAt: new Date() } });
      await this.transitions.transition(
        {
          applicationId: offer.applicationId,
          newStatus: ApplicationStatus.WITHDRAWN,
          actor: TransitionActor.CANDIDATE,
          actorUserId: userId,
          eventType: 'OFFER_DECLINED',
          description: 'Candidate declined the offer',
        },
        tx,
      );
    });
    return this.getMyOffer(userId, offerId);
  }

  /**
   * The candidate writes to the employer about this offer.
   *
   * The FIRST message opens the negotiation — that is the one moment the offer's state
   * actually changes. Every message after it is a message: asking the lifecycle for
   * NEGOTIATING -> NEGOTIATING is not a real transition, and it is what limited the
   * candidate to exactly one message before this. Same judgement extendOffer already makes
   * when it skips OFFER -> OFFER.
   */
  async postCandidateMessage(
    userId: string,
    offerId: string,
    body: string,
  ): Promise<OfferResponseDto> {
    const offer = await this.loadOwnedOffer(userId, offerId);
    this.assertDecidable(offer.status);

    await this.prisma.$transaction(async (tx) => {
      await tx.offerMessage.create({
        data: { offerId, authorRole: 'CANDIDATE', authorUserId: userId, body },
      });

      if (offer.status === 'NEGOTIATING') return; // already open; nothing moves

      await tx.offer.update({ where: { id: offerId }, data: { status: 'NEGOTIATING' } });
      await this.transitions.transition(
        {
          applicationId: offer.applicationId,
          newStatus: ApplicationStatus.NEGOTIATING,
          actor: TransitionActor.CANDIDATE,
          actorUserId: userId,
          eventType: 'OFFER_NEGOTIATION_OPENED',
          description: 'Candidate opened a negotiation on the offer',
        },
        tx,
      );
    });
    return this.getMyOffer(userId, offerId);
  }

  /** Kept for the existing `/offers/:id/negotiate` route; a message like any other. */
  negotiate(
    userId: string,
    offerId: string,
    dto: NegotiateOfferDto,
  ): Promise<OfferResponseDto> {
    return this.postCandidateMessage(userId, offerId, dto.notes);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * The optional compensation fields, only those provided.
   *
   * `notes` is deliberately NOT here any more. It used to write the column outright, which
   * meant an employer adding a note deleted whatever the candidate had said — the column
   * was carrying the conversation. An employer's note is now a message.
   */
  private optionalData(dto: UpdateOfferDto) {
    return {
      ...(dto.signingBonus !== undefined && { signingBonus: dto.signingBonus }),
      ...(dto.annualBonusPct !== undefined && { annualBonusPct: dto.annualBonusPct }),
      ...(dto.equityShares !== undefined && { equityShares: dto.equityShares }),
      ...(dto.equityPrice !== undefined && { equityPrice: dto.equityPrice }),
      ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
      ...(dto.responseDeadline !== undefined && { responseDeadline: new Date(dto.responseDeadline) }),
    };
  }

  /** Stamp the other party's unread messages as seen. */
  private async markThreadRead(
    offerId: string,
    viewer: 'CANDIDATE' | 'EMPLOYER',
  ): Promise<void> {
    await this.prisma.offerMessage.updateMany({
      where: {
        offerId,
        readAt: null,
        authorRole: viewer === 'EMPLOYER' ? 'CANDIDATE' : 'EMPLOYER',
      },
      data: { readAt: new Date() },
    });
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
