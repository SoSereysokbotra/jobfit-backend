// src/modules/employer-request/application/services/employer-request.service.ts
//
// Phase 2: public intake and admin review of the employer onboarding ticket.
// Approval and activation are deliberately NOT here — see EmployerApprovalService.

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployerRequest, EmployerRequestStatus } from '@prisma/client';

import { EmployerRequestRepository } from '../../infrastructure/repositories/employer-request.repository';
import {
  CreateEmployerRequestDto,
  EmployerRequestDto,
  EmployerRequestListDto,
  EmployerRequestReceiptDto,
  ListEmployerRequestsQueryDto,
  ReviewEmployerRequestDto,
} from '../dtos/employer-request.dtos';

/**
 * Free consumer mail providers. A request from one of these is ALLOWED — plenty of small
 * Cambodian employers have no corporate domain — but it is flagged so the admin knows to
 * lean on the business documents instead of the address (employer_logic.md v2.1 §4.2).
 */
const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'aol.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'gmx.com',
  'mail.com',
  'yandex.com',
  'zoho.com',
  'qq.com',
  '163.com',
]);

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
  constructor(private readonly repo: EmployerRequestRepository) {}

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

    const created = await this.repo.create({
      companyName: dto.companyName.trim(),
      companyEmail: email,
      contactName: dto.contactName.trim(),
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
   */
  async review(
    id: string,
    adminId: string,
    dto: ReviewEmployerRequestDto,
  ): Promise<EmployerRequestDto> {
    const request = await this.require(id);
    assertNotDecided(request);

    if (
      dto.status === EmployerRequestStatus.REJECTED &&
      !dto.adminNotes?.trim()
    ) {
      throw new BadRequestException(
        'A rejection needs a reason — it is emailed to the employer.',
      );
    }

    const updated = await this.repo.updateStatus(id, {
      status: dto.status,
      adminNotes: dto.adminNotes?.trim() || null,
      reviewedByAdminId: adminId,
    });
    return toDto(updated);
  }

  /** Load or 404. Shared with EmployerApprovalService. */
  async require(id: string): Promise<EmployerRequest> {
    const request = await this.repo.findById(id);
    if (!request) throw new NotFoundException('Employer request not found.');
    return request;
  }
}

/* ─────────────────────────── helpers ─────────────────────────── */

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

export function isPublicDomain(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return PUBLIC_EMAIL_DOMAINS.has(email.slice(at + 1).toLowerCase());
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
  });
}
