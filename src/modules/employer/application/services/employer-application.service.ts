// src/modules/employer/application/services/employer-application.service.ts
//
// Application Pipeline (Feature 3): list applications for the employer's company jobs,
// move candidates through the pipeline (recording stage history) and attach notes. Every
// operation is scoped to the employer's company (the authorization boundary).

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';
import { EmployerContextService } from './employer-context.service';
import { EmployerApplicationRepository } from '../../infrastructure/repositories/employer-application.repository';
import { ListApplicationsQueryDto } from '../dtos/list-applications.query.dto';
import { UpdateApplicationStatusDto } from '../dtos/update-application-status.dto';
import { AddApplicationNotesDto } from '../dtos/add-application-notes.dto';
import { EmployerApplicationResponseDto } from '../dtos/employer-application-response.dto';
import {
  ApplicationNotesUpdatedDto,
  ApplicationStatusUpdatedDto,
} from '../dtos/pipeline-action-response.dto';

@Injectable()
export class EmployerApplicationService {
  constructor(
    private readonly context: EmployerContextService,
    private readonly appRepo: EmployerApplicationRepository,
  ) {}

  async list(
    userId: string,
    query: ListApplicationsQueryDto,
  ): Promise<EmployerApplicationResponseDto[]> {
    const ctx = await this.context.requireContext(userId);
    const rows = await this.appRepo.findForCompany({
      companyId: ctx.companyId,
      jobId: query.jobId,
      status: query.status as unknown as ApplicationStatus,
      skip: query.skip,
      take: query.take,
    });

    // Match scores are only resolvable for a single-job view (per-row job filtering isn't
    // expressible in one query when listing across all company jobs).
    const scores =
      query.jobId && rows.length > 0
        ? await this.appRepo.matchScoresForJob(
            query.jobId,
            rows.map((r) => r.user.id),
          )
        : new Map<string, number>();

    return rows.map(
      (row) =>
        new EmployerApplicationResponseDto({
          id: row.id,
          jobId: row.jobId,
          jobTitle: row.job.title,
          candidate: {
            id: row.user.id,
            name: row.user.name,
            email: row.user.email,
          },
          status: row.status,
          employerNotes: row.employerNotes,
          matchScore: scores.get(row.user.id) ?? null,
          appliedAt: row.appliedAt,
        }),
    );
  }

  async updateStatus(
    userId: string,
    applicationId: string,
    dto: UpdateApplicationStatusDto,
  ): Promise<ApplicationStatusUpdatedDto> {
    const app = await this.requireOwnedApplication(userId, applicationId);
    const previousStatus = app.status;
    const newStatus = dto.newStatus as unknown as ApplicationStatus;

    await this.appRepo.transitionStatus({
      applicationId,
      previousStatus,
      newStatus,
      employerUserId: userId,
      notes: dto.notes,
    });
    return new ApplicationStatusUpdatedDto(
      applicationId,
      newStatus,
      previousStatus,
    );
  }

  async addNotes(
    userId: string,
    applicationId: string,
    dto: AddApplicationNotesDto,
  ): Promise<ApplicationNotesUpdatedDto> {
    await this.requireOwnedApplication(userId, applicationId);
    const updated = await this.appRepo.setEmployerNotes(
      applicationId,
      userId,
      dto.notes,
    );
    return new ApplicationNotesUpdatedDto(updated.id, updated.employerNotes);
  }

  /** Load an application and assert it belongs to the employer's company (404/403). */
  private async requireOwnedApplication(userId: string, applicationId: string) {
    const ctx = await this.context.requireContext(userId);
    const app = await this.appRepo.findByIdWithJob(applicationId);
    if (!app) throw new NotFoundException('Application not found');
    if (app.job.companyId !== ctx.companyId) {
      throw new ForbiddenException(
        'This application is not for one of your jobs.',
      );
    }
    return app;
  }
}
