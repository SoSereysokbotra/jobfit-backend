// src/modules/employer-request/application/services/employer-request.service.ts
//
// Phase 2: public intake and admin review of the employer onboarding ticket.
// Approval and activation are deliberately NOT here — see EmployerApprovalService.

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EmployerRequest, EmployerRequestStatus } from '@prisma/client';

import { EmployerRequestRepository } from '../../infrastructure/repositories/employer-request.repository';
import { EmailService } from '@shared/services/email.service';
// Shared with company identity: the same list decides whether an email domain is a
// company's own or a consumer provider that identifies nobody.
import { isPublicDomain } from '@shared/utils/company-identity';
import {
  CreateEmployerRequestDto,
  EmployerRequestDto,
  EmployerRequestListDto,
  EmployerRequestReceiptDto,
  EmployerRequestStatusDto,
  ListEmployerRequestsQueryDto,
  ReviewEmployerRequestDto,
} from '../dtos/employer-request.dtos';


/** Requests older than this without a decision are surfaced to the admin as overdue. */
export const SLA_HOURS = 48;

/** Which statuses still await a human decision. */
const AWAITING_DECISION: EmployerRequestStatus[] = [
  EmployerRequestStatus.SUBMITTED,
  EmployerRequestStatus.REVIEWING,
  EmployerRequestStatus.PENDING_INFO,
];

@Injectable()
export class EmployerRequestService {
  private readonly logger = new Logger(EmployerRequestService.name);

  constructor(
    private readonly repo: EmployerRequestRepository,
    private readonly email: EmailService,
  ) {}

  /* ─────────────────────────── Public intake ─────────────────────────── */

  /**
   * Submit a request. Unauthenticated by design — the person filling this in has no
   * account and cannot have one until an admin says so.
   *
   * NOTE what this does NOT do: it does not check whether the address already exists as a
   * user. Answering that to an anonymous caller would turn this endpoint into an account
   * enumeration oracle. The real conflict check happens at approval, inside the
   * transaction, where the unique index can answer it atomically.
   */
  async submit(dto: CreateEmployerRequestDto): Promise<EmployerRequestReceiptDto> {
    const email = normalizeEmail(dto.companyEmail);

    // Duplicate OPEN tickets are refused, so one company cannot flood the queue. This is
    // safe to reveal: it says something about a request the caller themselves submitted,
    // not about whether an account exists.
    const open = await this.repo.findOpenByEmail(email);
    if (open) {
      throw new ConflictException(
        'A request for this email address is already being reviewed.',
      );
    }

    const first = dto.contactFirstName?.trim() || null;
    const last = dto.contactLastName?.trim() || null;

    const created = await this.repo.create({
      companyName: dto.companyName.trim(),
      companyEmail: email,
      // When the form gave both halves, the display name is BUILT from them rather than
      // taken from `contactName`, so the queue can never show one name while the account
      // gets another.
      contactName: first && last ? `${first} ${last}` : dto.contactName.trim(),
      contactFirstName: first,
      contactLastName: last,
      contactRole: dto.contactRole.trim(),
      description: dto.description.trim(),
      companyWebsite: dto.companyWebsite?.trim() || null,
      supportingDocsUrl: dto.supportingDocsUrl?.trim() || null,
    });

    return new EmployerRequestReceiptDto(created.id);
  }

  /* ─────────────────────────── Admin review ─────────────────────────── */

  async list(query: ListEmployerRequestsQueryDto): Promise<EmployerRequestListDto> {
    const { items, total } = await this.repo.findMany({
      status: query.status,
      search: query.search?.trim() || undefined,
      skip: query.skip ?? 0,
      take: query.take ?? 25,
    });
    return new EmployerRequestListDto(items.map(toDto), total);
  }

  async getById(id: string): Promise<EmployerRequestDto> {
    return toDto(await this.require(id));
  }

  /**
   * Move a request to REVIEWING, PENDING_INFO or REJECTED.
   *
   * APPROVED is not reachable here: approving creates an account, so it has its own route
   * with its own payload (the company being approved for) and its own transaction.
   *
   * TWO OF THE THREE TRANSITIONS SEND MAIL, and until now none of them did. `adminNotes`
   * was written to the row and left there: the rejection reason the admin was *required*
   * to type reached nobody, and PENDING_INFO asked a question through a channel the
   * employer cannot read — there is no account yet, so there was no screen it could ever
   * appear on. An employer who applied simply never heard back.
   *
   * REVIEWING sends nothing on purpose. It is an internal triage move with nothing for the
   * employer to act on, and mailing them every time an admin opens the ticket is noise.
   */
  async review(
    id: string,
    adminId: string,
    dto: ReviewEmployerRequestDto,
  ): Promise<EmployerRequestDto> {
    const request = await this.require(id);
    assertNotDecided(request);

    const notes = dto.adminNotes?.trim() || null;

    if (dto.status === EmployerRequestStatus.REJECTED && !notes) {
      throw new BadRequestException(
        'A rejection needs a reason — it is emailed to the employer.',
      );
    }
    if (dto.status === EmployerRequestStatus.PENDING_INFO && !notes) {
      throw new BadRequestException(
        'Say what is missing — the note is emailed to the employer as the question to ' +
          'answer, and without it they cannot tell what to send.',
      );
    }

    const updated = await this.repo.updateStatus(id, {
      status: dto.status,
      adminNotes: notes,
      reviewedByAdminId: adminId,
    });

    await this.notifyOfDecision(updated, notes);
    return toDto(updated);
  }

  /**
   * Tell the employer what just happened. AFTER the write, and never fatal.
   *
   * NON-FATAL IS LOAD-BEARING FOR REJECTION, not merely tidy. `assertNotDecided` makes a
   * REJECTED request final, so an admin whose rejection threw on a mail bounce could not
   * retry it — the decision is already recorded and the route now refuses. They would be
   * looking at an error for an action that in fact succeeded, with no way to reconcile the
   * two. Logging and moving on leaves the admin able to follow up by hand, which is the
   * same shape as the approval path's `deliverActivationCode`.
   */
  private async notifyOfDecision(
    request: EmployerRequest,
    notes: string | null,
  ): Promise<void> {
    try {
      if (request.status === EmployerRequestStatus.REJECTED) {
        await this.email.sendEmployerRequestRejected(
          request.companyEmail,
          request.companyName,
          notes as string, // Guaranteed by the guard above.
        );
      } else if (request.status === EmployerRequestStatus.PENDING_INFO) {
        await this.email.sendEmployerRequestMoreInfo(
          request.companyEmail,
          request.companyName,
          notes as string,
          request.id,
        );
      }
    } catch (err) {
      this.logger.error(
        `Recorded ${request.status} on request ${request.id} but could not email ` +
          `${request.companyEmail}: ${(err as Error).message}. The decision stands — ` +
          'follow up by hand.',
      );
    }
  }

  /**
   * What the employer themselves may see about their own request.
   *
   * THE REQUEST ID IS THE CREDENTIAL. It is a v4 UUID handed only to whoever submitted the
   * form, so holding it is the claim to read this. That is weaker than a login and is why
   * the response is deliberately thin: no contact email, no reviewer, no account id,
   * nothing that would make this worth guessing at. Unknown ids 404 like any other missing
   * resource.
   *
   * `adminNotes` is released for exactly the two statuses that are a message TO the
   * employer. On any other status it stays internal — an admin's triage note on a request
   * still under review is not something the applicant is owed a live feed of.
   */
  async publicStatus(id: string): Promise<EmployerRequestStatusDto> {
    const request = await this.require(id);

    const speaksToEmployer =
      request.status === EmployerRequestStatus.PENDING_INFO ||
      request.status === EmployerRequestStatus.REJECTED;

    return new EmployerRequestStatusDto({
      id: request.id,
      companyName: request.companyName,
      status: request.status,
      submittedAt: request.createdAt,
      message: speaksToEmployer ? (request.adminNotes ?? undefined) : undefined,
    });
  }

  /** Load or 404. Shared with EmployerApprovalService. */
  async require(id: string): Promise<EmployerRequest> {
    const request = await this.repo.findById(id);
    if (!request) throw new NotFoundException('Employer request not found.');
    return request;
  }
}

/* ─────────────────────────── helpers ─────────────────────────── */

export { isPublicDomain };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * A decided request is final. Re-deciding an APPROVED one would orphan the account it
 * already created; re-deciding a REJECTED one would resurrect a decision the employer has
 * already been told about.
 */
export function assertNotDecided(request: EmployerRequest): void {
  if (
    request.status === EmployerRequestStatus.APPROVED ||
    request.status === EmployerRequestStatus.REJECTED
  ) {
    throw new ConflictException(
      `This request was already ${request.status.toLowerCase()}.`,
    );
  }
}

export function toDto(row: EmployerRequest): EmployerRequestDto {
  const awaiting = AWAITING_DECISION.includes(row.status);
  const hours = awaiting
    ? Math.floor((Date.now() - row.createdAt.getTime()) / 3_600_000)
    : null;

  return new EmployerRequestDto({
    id: row.id,
    companyName: row.companyName,
    companyEmail: row.companyEmail,
    contactName: row.contactName,
    contactRole: row.contactRole,
    description: row.description,
    companyWebsite: row.companyWebsite ?? undefined,
    supportingDocsUrl: row.supportingDocsUrl ?? undefined,
    status: row.status,
    adminNotes: row.adminNotes ?? undefined,
    reviewedByAdminId: row.reviewedByAdminId ?? undefined,
    reviewedAt: row.reviewedAt?.toISOString(),
    approvedUserId: row.approvedUserId ?? undefined,
    approvedCompanyId: row.approvedCompanyId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    isPublicDomain: isPublicDomain(row.companyEmail),
    hoursAwaitingDecision: hours,
    breachesSla: hours !== null && hours > SLA_HOURS,
    domainCheck: row.domainCheck ?? undefined,
  });
}
