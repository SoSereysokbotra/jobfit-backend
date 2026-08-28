// src/modules/employer-request/application/services/employer-approval.service.ts
//
// Phase 3: approval creates the account, and activation makes it usable.
//
// This is the only place in the codebase that assigns `role = EMPLOYER`. Before it existed
// there was no runtime path to an employer account at all — the public signup DTO has no
// role field and the admin panel has no create-user endpoint, so every employer came from
// prisma/seed.ts (docs/EMPLOYER_ONBOARDING_PLAN.md, "Why now").

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditActionType,
  AuditResourceType,
  EmployerRequest,
  EmployerRequestStatus,
  Prisma,
  UserRole,
  UserStatus,
} from '@prisma/client';

import { PrismaService } from '@infra/prisma/prisma.service';
import { EmailService } from '@shared/services/email.service';
import { AuditLogService } from '@modules/admin/application/services/audit-log.service';
import { AuthDomainService } from '@modules/auth/domain/services/auth.domain.service';
import { Password } from '@modules/auth/domain/value-objects/password.value-object';

import { EmployerRequestRepository } from '../../infrastructure/repositories/employer-request.repository';
import {
  ActivateEmployerAccountDto,
  ApproveEmployerRequestDto,
  EmployerRequestDto,
  EmployerRequestMessageDto,
} from '../dtos/employer-request.dtos';
import {
  assertNotDecided,
  normalizeEmail,
  toDto,
} from './employer-request.service';

/**
 * How long an activation code lives.
 *
 * Far longer than the 15-minute verification code, because nobody is sitting at the screen
 * waiting for this one — it lands in a shared recruiting inbox and may not be read until
 * the next working day. v2.0 specified 24 hours for the equivalent link; the code inherits
 * it. An expired code is not a dead end: the admin can resend.
 */
const ACTIVATION_TTL_MINUTES = 24 * 60;
const ACTIVATION_TTL_TEXT = '24 hours';

/** Postgres unique-constraint violation, surfaced by Prisma. */
const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class EmployerApprovalService {
  private readonly logger = new Logger(EmployerApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly repo: EmployerRequestRepository,
    private readonly email: EmailService,
    private readonly audit: AuditLogService,
    private readonly authDomain: AuthDomainService,
  ) {}

  /* ─────────────────────────── Approval ─────────────────────────── */

  /**
   * Approve a request: create the account and issue an activation code.
   *
   * ONE TRANSACTION, for a specific reason. The email-conflict check and the account
   * creation cannot be separate statements — a check-then-create pair is a race, and
   * `users.email @unique` is the only thing that can answer atomically. So we simply
   * attempt the insert and translate P2002 into the conflict the admin UI renders
   * (employer_logic.md v2.1 §4.2).
   *
   * The mail is sent AFTER the transaction commits. Sending inside it would mean a rollback
   * after a successful send, leaving an employer holding a code for an account that does
   * not exist.
   */
  async approve(
    requestId: string,
    adminId: string,
    dto: ApproveEmployerRequestDto,
  ): Promise<EmployerRequestDto> {
    const request = await this.requireRequest(requestId);
    assertNotDecided(request);

    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException('Company not found.');

    const code = this.authDomain.generateNumericCode(6);
    const expiry = this.authDomain.computeExpiry(ACTIVATION_TTL_MINUTES);
    const email = normalizeEmail(request.companyEmail);

    let updated: EmployerRequest;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email,
            name: request.contactName,
            role: UserRole.EMPLOYER,
            status: UserStatus.ACTIVE,
            // ⚠️ FALSE UNTIL THE CODE IS USED, and this is load-bearing.
            //
            // The row below has an EMPTY password hash. The login path refuses unverified
            // accounts, and that refusal is the only thing standing between this row and a
            // sign-in. Activation is what proves inbox control, so activation is what flips
            // this — approval never does.
            emailVerified: false,
            passwordHash: '',
          },
          select: { id: true },
        });

        return tx.employerRequest.update({
          where: { id: requestId },
          data: {
            status: EmployerRequestStatus.APPROVED,
            reviewedByAdminId: adminId,
            reviewedAt: new Date(),
            approvedUserId: user.id,
            approvedCompanyId: company.id,
            activationCode: code,
            activationCodeExpiry: expiry,
          },
        });
      });
    } catch (err) {
      throw this.translateEmailConflict(err, email);
    }

    await this.audit.record({
      adminId,
      actionType: AuditActionType.EMPLOYER_REQUEST_APPROVED,
      resourceType: AuditResourceType.EMPLOYER_REQUEST,
      resourceId: requestId,
    });

    await this.deliverActivationCode(email, code, request.companyName);
    return toDto(updated);
  }

  /**
   * Re-issue an activation code for an already-approved request — v2.1's expired-code path.
   * The previous code stops working the moment this one is written.
   */
  async resendActivation(
    requestId: string,
    adminId: string,
  ): Promise<EmployerRequestMessageDto> {
    const request = await this.requireRequest(requestId);
    if (request.status !== EmployerRequestStatus.APPROVED) {
      throw new ConflictException(
        'Only an approved request has credentials to resend.',
      );
    }

    const code = this.authDomain.generateNumericCode(6);
    await this.repo.setActivationCode(
      requestId,
      code,
      this.authDomain.computeExpiry(ACTIVATION_TTL_MINUTES),
    );

    await this.audit.record({
      adminId,
      actionType: AuditActionType.EMPLOYER_ACTIVATION_RESENT,
      resourceType: AuditResourceType.EMPLOYER_REQUEST,
      resourceId: requestId,
    });

    await this.deliverActivationCode(
      request.companyEmail,
      code,
      request.companyName,
    );
    return new EmployerRequestMessageDto(
      `A new activation code was sent to ${request.companyEmail}.`,
    );
  }

  /* ─────────────────────────── Activation ─────────────────────────── */

  /**
   * Turn an approved row into a usable account: verify the code, set the password the
   * employer chose, and mark the address verified.
   *
   * Every failure answers with the SAME message. Distinguishing "no such request" from
   * "wrong code" would let anyone probe which company addresses have been approved.
   */
  async activate(
    dto: ActivateEmployerAccountDto,
  ): Promise<EmployerRequestMessageDto> {
    const email = normalizeEmail(dto.email);
    const request = await this.repo.findApprovedByEmail(email);

    const codeOk =
      request !== null &&
      request.approvedUserId !== null &&
      this.authDomain.isCodeValid(
        request.activationCode,
        request.activationCodeExpiry,
        dto.code,
      );

    if (!request || !codeOk) {
      throw new BadRequestException(
        'That activation code is not valid or has expired. Ask your JobFit contact to resend it.',
      );
    }

    const password = await Password.fromPlain(dto.password);

    // One transaction: an account whose password was set but whose code was not cleared
    // could be activated twice, and a verified flag without a password would be a
    // sign-in with an empty hash.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: request.approvedUserId as string },
        data: {
          passwordHash: password.value,
          emailVerified: true,
        },
      }),
      this.prisma.employerRequest.update({
        where: { id: request.id },
        data: { activationCode: null, activationCodeExpiry: null },
      }),
    ]);

    this.logger.log(`Employer account activated: ${email}`);
    return new EmployerRequestMessageDto(
      'Your account is active. You can now sign in to the employer portal.',
    );
  }

  /* ─────────────────────────── internals ─────────────────────────── */

  private async requireRequest(id: string): Promise<EmployerRequest> {
    const request = await this.repo.findById(id);
    if (!request) throw new NotFoundException('Employer request not found.');
    return request;
  }

  /**
   * Approval must not be undone by a bounce.
   *
   * `EmailService.send` throws by design so callers decide whether delivery is fatal. Here
   * it is not: the account exists and the code is stored, so the admin can resend. Throwing
   * would report failure for an approval that actually succeeded, and tempt a retry that
   * would then hit the unique constraint.
   */
  private async deliverActivationCode(
    to: string,
    code: string,
    companyName: string,
  ): Promise<void> {
    try {
      await this.email.sendEmployerActivationCode(
        to,
        code,
        companyName,
        ACTIVATION_TTL_TEXT,
      );
    } catch (err) {
      this.logger.error(
        `Approved ${companyName} but could not email the activation code to ${to}: ` +
          `${(err as Error).message}. Use Resend once mail is working.`,
      );
    }
  }

  /** P2002 on users.email is the conflict the admin UI has a dialog for. */
  private translateEmailConflict(err: unknown, email: string): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === UNIQUE_VIOLATION
    ) {
      return new ConflictException(
        `${email} already has an account. Ask the employer for a different address, or reject this request.`,
      );
    }
    return err;
  }
}
