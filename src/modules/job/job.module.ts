import { Module } from '@nestjs/common';
import { PrismaJobRepository } from './infrastructure/repositories/prisma-job.repository';
import { JOB_REPOSITORY } from './domain/job.repository.interface';
import { CreateJobUseCase } from './application/use-cases/create-job.use-case';
import { PublishJobUseCase } from './application/use-cases/publish-job.use-case';
import { CloseJobUseCase } from './application/use-cases/close-job.use-case';
import { SearchJobsUseCase } from './application/use-cases/search-jobs.use-case';
import { JobService } from './application/job.service';
import { JobController } from './presentation/controllers/job.controller';
import { ApplicationSubmittedListener } from './listeners/application-submitted.listener';

// NOTE: employer-facing job management (`employer/jobs`) now lives in the Employer module
// (EmployerJobController), which resolves the real company via EmployerProfile and stamps
// the poster. The old placeholder JobManagementController here has been removed to avoid a
// duplicate `employer/jobs` route registration.

@Module({
  controllers: [JobController],
  providers: [
    // Repository binding: token → concrete Prisma implementation
    { provide: JOB_REPOSITORY, useClass: PrismaJobRepository },

    // Use-cases
    CreateJobUseCase,
    PublishJobUseCase,
    CloseJobUseCase,
    SearchJobsUseCase,

    // Service (thin orchestrator)
    JobService,

    // Event listeners
    ApplicationSubmittedListener,
  ],
  exports: [JOB_REPOSITORY, JobService],
})
export class JobModule {}
