// src/modules/employer/application/services/employer-job.service.ts
//
// Job Posting (Feature 2): create / edit / publish a job and view its analytics — all
// scoped to the employer's own company. The job lifecycle is delegated to the job module's
// JobService (reuse); this service adds employer-context resolution, records the poster,
// and computes analytics.

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobService } from '@modules/job/application/job.service';
import { CreateJobDto } from '@modules/job/presentation/dto/create-job.dto';
import { UpdateJobDto } from '@modules/job/presentation/dto/update-job.dto';
import { JobResponseDto } from '@modules/job/presentation/dto/job-response.dto';
import { EmployerContextService } from './employer-context.service';
import { EmployerJobRepository } from '../../infrastructure/repositories/employer-job.repository';
import { JobAnalyticsResponseDto } from '../dtos/job-analytics-response.dto';

@Injectable()
export class EmployerJobService {
  constructor(
    private readonly context: EmployerContextService,
    private readonly jobService: JobService,
    private readonly jobRepo: EmployerJobRepository,
  ) {}

  /** Create a draft job for the employer's company and stamp the poster. */
  async create(userId: string, dto: CreateJobDto): Promise<JobResponseDto> {
    const ctx = await this.context.requireContext(userId);
    const job = await this.jobService.create(dto, ctx.companyId);
    await this.jobRepo.setPostedBy(job.id, userId);
    return job;
  }

  /** Edit a job — JobService enforces the company-ownership check. */
  async update(
    userId: string,
    jobId: string,
    dto: UpdateJobDto,
  ): Promise<JobResponseDto> {
    const ctx = await this.context.requireContext(userId);
    return this.jobService.update(jobId, dto, ctx.companyId);
  }

  /** Publish a draft job — JobService enforces the company-ownership check. */
  async publish(userId: string, jobId: string): Promise<JobResponseDto> {
    const ctx = await this.context.requireContext(userId);
    return this.jobService.publish(jobId, ctx.companyId);
  }

  async getAnalytics(
    userId: string,
    jobId: string,
  ): Promise<JobAnalyticsResponseDto> {
    const ctx = await this.context.requireContext(userId);
    const ownerCompanyId = await this.jobRepo.getCompanyId(jobId);
    if (!ownerCompanyId) throw new NotFoundException('Job not found');
    if (ownerCompanyId !== ctx.companyId) {
      throw new ForbiddenException('This job belongs to another company.');
    }

    const analytics = await this.jobRepo.analytics(jobId);
    return new JobAnalyticsResponseDto({ jobId, ...analytics });
  }
}
