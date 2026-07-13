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
import { JobModule } from '@modules/job/job.module';

// Controllers
import { EmployerCompanyController } from './presentation/controllers/employer-company.controller';
import { EmployerJobController } from './presentation/controllers/employer-job.controller';
import { EmployerApplicationController } from './presentation/controllers/employer-application.controller';

// Application services
import { EmployerContextService } from './application/services/employer-context.service';
import { EmployerCompanyService } from './application/services/employer-company.service';
import { EmployerJobService } from './application/services/employer-job.service';
import { EmployerApplicationService } from './application/services/employer-application.service';

// Infrastructure repositories
import { EmployerProfileRepository } from './infrastructure/repositories/employer-profile.repository';
import { EmployerCompanyRepository } from './infrastructure/repositories/employer-company.repository';
import { EmployerJobRepository } from './infrastructure/repositories/employer-job.repository';
import { EmployerApplicationRepository } from './infrastructure/repositories/employer-application.repository';

@Module({
  imports: [JobModule],
  controllers: [
    EmployerCompanyController,
    EmployerJobController,
    EmployerApplicationController,
  ],
  providers: [
    // services
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
