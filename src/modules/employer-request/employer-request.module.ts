// src/modules/employer-request/employer-request.module.ts
//
// Employer onboarding (docs/EMPLOYER_ONBOARDING_PLAN.md Phases 2-3).
//
// The only path in the system to an EMPLOYER account. Public intake and activation, plus
// the admin review queue that decides between them.
//
// Reuse rather than reinvention:
//   - AuthModule    -> AuthDomainService, for the same 6-digit code generator and expiry
//                      helpers the email-verification and password-reset flows use.
//   - AdminModule   -> AuditLogService, so approvals land in the ONE audit trail.
//   - SharedModule  -> EmailService (global, but imported explicitly for readability).
// PrismaService is available globally (PrismaModule is @Global).

import { Module } from '@nestjs/common';

import { AuthModule } from '@modules/auth/auth.module';
import { AdminModule } from '@modules/admin/admin.module';

import { EmployerRequestController } from './presentation/controllers/employer-request.controller';
import { AdminEmployerRequestController } from './presentation/controllers/admin-employer-request.controller';
import { EmployerRequestService } from './application/services/employer-request.service';
import { EmployerApprovalService } from './application/services/employer-approval.service';
import { EmployerRequestRepository } from './infrastructure/repositories/employer-request.repository';

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [EmployerRequestController, AdminEmployerRequestController],
  providers: [
    EmployerRequestService,
    EmployerApprovalService,
    EmployerRequestRepository,
  ],
  // Phase 4 needs the repository: first-login company claim is checked against the
  // request's approvedCompanyId.
  exports: [EmployerRequestRepository],
})
export class EmployerRequestModule {}
