// src/modules/employer/employer.module.ts
//
// Employer backend module (Employer Phase 2 — 3 core features):
//   1. Company Profile Management (claim / verify / edit)
//   2. Job Posting (create / edit / publish / analytics)
//   3. Application Pipeline (list / status + stage history / notes)
//
// Reuse:
//   - JobModule -> JobService, to reuse the full job create/update/publish lifecycle.
//   - EmployerProfile (existing) as the employer<->company authorization boundary.
//   - Global JwtAuthGuard + RolesGuard; controllers add @Roles('EMPLOYER').
// PrismaService is available globally (PrismaModule is @Global).

import { Module } from '@nestjs/common';
// The employer portal login reuses the auth module's CQRS LoginCommand, same as admin.
import { CqrsModule } from '@nestjs/cqrs';
import { AuthModule } from '@modules/auth/auth.module';
import { JobModule } from '@modules/job/job.module';
// Phase 4: first-login claim is checked against the request's approvedCompanyId, and
// the domain-check outcome is recorded on it.
import { EmployerRequestModule } from '@modules/employer-request/employer-request.module';

// Controllers
import { EmployerAuthController } from './presentation/controllers/employer-auth.controller';
import { EmployerCompanyController } from './presentation/controllers/employer-company.controller';
import { EmployerJobController } from './presentation/controllers/employer-job.controller';
import { EmployerApplicationController } from './presentation/controllers/employer-application.controller';

// Application services
import { EmployerAuthService } from './application/services/employer-auth.service';
import { EmployerContextService } from './application/services/employer-context.service';
import { EmployerCompanyService } from './application/services/employer-company.service';
import { EmployerJobService } from './application/services/employer-job.service';
import { EmployerApplicationService } from './application/services/employer-application.service';

// Infrastructure repositories
import { EmployerProfileRepository } from './infrastructure/repositories/employer-profile.repository';
import { EmployerCompanyRepository } from './infrastructure/repositories/employer-company.repository';
import { EmployerJobRepository } from './infrastructure/repositories/employer-job.repository';
import { EmployerApplicationRepository } from './infrastructure/repositories/employer-application.repository';

// The one road to a status write — the employer pipeline moves candidates through it.
import { ApplicationTransitionModule } from '../application/application-transition.module';

// Signs the short-lived résumé download URLs the pipeline hands an employer.

@Module({
  imports: [
    CqrsModule,
    AuthModule,
    JobModule,
    ApplicationTransitionModule,
    EmployerRequestModule,
  ],
  controllers: [
    EmployerAuthController,
    EmployerCompanyController,
    EmployerJobController,
    EmployerApplicationController,
  ],
  providers: [
    // StorageService comes from the @Global StorageModule. It was listed HERE, without
    // the SupabaseClientService it depends on, which stopped AppModule booting entirely.
    // services
    EmployerAuthService,
    EmployerContextService,
    EmployerCompanyService,
    EmployerJobService,
    EmployerApplicationService,
    // repositories
    EmployerProfileRepository,
    EmployerCompanyRepository,
    EmployerJobRepository,
    EmployerApplicationRepository,
  ],
})
export class EmployerModule {}
