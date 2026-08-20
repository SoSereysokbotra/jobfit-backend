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
// Every status write goes through the transition service — one definition of the lifecycle,
// used by the candidate path, the employer path, the offer module and screening alike.
import { ApplicationTransitionService } from '@modules/application/domain/services/application-transition.service';
import { ApplicationStatus as DomainStatus } from '@shared/kernel/enums/application-status.enum';
import { TransitionActor } from '@shared/kernel/enums/transition-actor.enum';
import { EmployerContextService } from './employer-context.service';
import { EmployerApplicationRepository } from '../../infrastructure/repositories/employer-application.repository';
import { ListApplicationsQueryDto } from '../dtos/list-applications.query.dto';
import { UpdateApplicationStatusDto } from '../dtos/update-application-status.dto';
import { AddApplicationNotesDto } from '../dtos/add-application-notes.dto';
import {
  EmployerApplicationResponseDto,
  SubmittedResumeDto,
} from '../dtos/employer-application-response.dto';
import { ResumeDownloadDto } from '../dtos/resume-download.dto';
import { StorageService } from '@infra/storage/storage.service';
import {
  ApplicationNotesUpdatedDto,
  ApplicationStatusUpdatedDto,
} from '../dtos/pipeline-action-response.dto';

/**
 * How long a résumé download link stays valid. Long enough to click, short enough that a
 * URL copied out of a log or a browser history is worthless by the time anyone tries it.
 */
const RESUME_URL_TTL_SECONDS = 300;

@Injectable()
export class EmployerApplicationService {
  constructor(
    private readonly context: EmployerContextService,
    private readonly appRepo: EmployerApplicationRepository,
    private readonly transitions: ApplicationTransitionService,
    private readonly storage: StorageService,
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
      includeArchived: query.includeArchived,
      skip: query.skip,
      take: query.take,
    });

    // The screening assessment lives on the application row, so it needs no second query
    // and — unlike the score it replaces — is available whether the employer is viewing a
    // single job or the whole pipeline.
    //
    // The previous `matchScore` read from the `matchScore` table, which has zero rows and
    // nothing that writes to it: the field could never hold a value.
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
          archived: row.archivedByEmployerAt != null,
          unreadMessages: row.offer?._count.messages ?? 0,
          employerNotes: row.employerNotes,
          // A deleted résumé is treated as absent rather than shown as a dead link.
          resume:
            row.resume && row.resume.deletedAt === null
              ? new SubmittedResumeDto(row.resume)
              : null,
          coverLetter: row.coverLetter,
          screening: {
            screenedAt: row.screenedAt,
            matchScore: row.screenMatchScore,
            requirementsTotal: row.screenRequirementsTotal ?? 0,
            requirementsCovered: row.screenRequirementsCovered ?? 0,
            missingRequirements: row.screenMissingRequirements,
            requirementsSource: row.screenRequirementsSource ?? 'NONE',
          },
          appliedAt: row.appliedAt,
        }),
    );
  }

  async updateStatus(
    userId: string,
    applicationId: string,
    dto: UpdateApplicationStatusDto,
  ): Promise<ApplicationStatusUpdatedDto> {
    // Company ownership is authorisation — a separate question from the lifecycle, and
    // still this service's to answer.
    await this.requireOwnedApplication(userId, applicationId);

    // Everything else — is this transition reachable, is this status the employer's to
    // assert, and both audit rows — belongs to the transition service. This path used to
    // re-state those rules locally while the offer module re-stated none of them.
    const { previousStatus, newStatus } = await this.transitions.transition({
      applicationId,
      newStatus: dto.newStatus as unknown as DomainStatus,
      actor: TransitionActor.EMPLOYER,
      actorUserId: userId,
      notes: dto.notes,
    });

    return new ApplicationStatusUpdatedDto(
      applicationId,
      newStatus as unknown as ApplicationStatus,
      previousStatus as unknown as ApplicationStatus,
    );
  }

  /**
   * Hide (or restore) an application on this employer's board.
   *
   * Not a status change: no transition, no audit row. It writes the employer's own column,
   * so the candidate's list is untouched — and, critically, the reverse is also true.
   */
  async setArchived(
    userId: string,
    applicationId: string,
    archived: boolean,
  ): Promise<void> {
    await this.requireOwnedApplication(userId, applicationId);
    await this.appRepo.setArchivedByEmployer(applicationId, userId, archived);
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

  /**
   * A short-lived signed URL for the CV this candidate submitted.
   *
   * WHAT THIS FIXES. The pipeline gave an employer a name, an email and a screening
   * number the DTO itself describes as varying "by only 4 points" between a senior
   * engineer and a graphic designer — an AI triage with the human review step missing
   * (MENTOR_REVIEW_2026-08-18 §9). Reading the CV is the employer's actual job.
   *
   * THE RÉSUMÉ IS THE SUBMITTED ONE. `Application.resumeId`, fixed at submission (§5) —
   * never the candidate's current default. An employer must be able to explain a decision
   * from the document they were shown, and the candidate may have changed their default
   * since.
   *
   * AUTHORISATION is `requireOwnedApplication`: the same company check every other write
   * on this service uses. An employer can only reach a résumé attached to an application
   * to one of THEIR OWN jobs — the URL is minted after that check, never before.
   *
   * The link is minted per request and expires in {@link RESUME_URL_TTL_SECONDS}. Short on
   * purpose: it is a bearer credential to a private file, so it should outlive a click and
   * not much else.
   */
  async getResumeDownload(
    userId: string,
    applicationId: string,
  ): Promise<ResumeDownloadDto> {
    const ctx = await this.context.requireContext(userId);
    const app = await this.appRepo.findByIdWithResume(applicationId);
    if (!app) throw new NotFoundException('Application not found');
    if (app.job.companyId !== ctx.companyId) {
      throw new ForbiddenException(
        'This application is not for one of your jobs.',
      );
    }

    // Distinguish the two empty cases in the message: "they sent no CV" is a fact about
    // the application, "it was deleted" is a fact about the file. Neither is an error the
    // employer can act on, but conflating them would misdescribe the candidate.
    if (!app.resume) {
      throw new NotFoundException(
        'This application has no résumé attached — the candidate applied without one.',
      );
    }
    if (app.resume.deletedAt !== null) {
      throw new NotFoundException(
        'The candidate has deleted the résumé they applied with.',
      );
    }

    // Deterministic path, same construction as ResumeService.storagePath. Built from the
    // résumé's OWNER, not the requesting employer.
    const path = `${app.resume.userId}/${app.resume.id}/${app.resume.fileName}`;
    const url = await this.storage.getSignedUrl(
      'resumes',
      path,
      RESUME_URL_TTL_SECONDS,
    );

    return new ResumeDownloadDto({
      url,
      expiresAt: new Date(Date.now() + RESUME_URL_TTL_SECONDS * 1000),
      fileName: app.resume.fileName,
      fileType: app.resume.fileType,
    });
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
