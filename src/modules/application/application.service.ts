// src/modules/application/application.service.ts
//
// Orchestrates the Application aggregate + timeline + contact person. Verifies user/job,
// enforces one-application-per-job, records timeline entries, and publishes domain events
// after persistence (which the job/notification listeners react to).

import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationRepository } from './infrastructure/repositories/application.repository';
import { ApplicationTimelineRepository } from './infrastructure/repositories/application-timeline.repository';
import { ContactPersonRepository } from './infrastructure/repositories/contact-person.repository';
import { UserRepository } from '@modules/user/infrastructure/repositories/user.repository';
import {
  IJobRepository,
  JOB_REPOSITORY,
} from '@modules/job/domain/job.repository.interface';
import { DomainEventBus } from '@events/domain-event-bus.service';
import { Application } from './domain/entities/application.entity';
import { ApplicationTransitionService } from './domain/services/application-transition.service';
import { ApplicationStatusChangedEvent } from './domain/events/application-status-changed.event';
import { TransitionActor } from '@shared/kernel/enums/transition-actor.enum';
import { ApplicationTimeline } from './domain/entities/application-timeline.entity';
import { ContactPerson } from './domain/entities/contact-person.entity';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';
import { SubmitApplicationDto } from './dto/submit-application.dto';
import { ApplicationScreeningService } from '@modules/matching/application/services/application-screening.service';
import { AddContactPersonDto } from './dto/add-contact-person.dto';
import { ERROR_MESSAGES } from '@common/constants/error-messages';

@Injectable()
export class ApplicationService {
  constructor(
    private readonly applicationRepository: ApplicationRepository,
    private readonly transitions: ApplicationTransitionService,
    private readonly timelineRepository: ApplicationTimelineRepository,
    private readonly contactPersonRepository: ContactPersonRepository,
    private readonly userRepository: UserRepository,
    @Inject(JOB_REPOSITORY) private readonly jobRepository: IJobRepository,
    private readonly eventBus: DomainEventBus,
    private readonly screening: ApplicationScreeningService,
  ) {}

  async submitApplication(
    userId: string,
    dto: SubmitApplicationDto,
  ): Promise<Application> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    const job = await this.jobRepository.findById(dto.jobId);
    if (!job) throw new NotFoundException('Job not found');

    // EXTERNAL jobs are ingested from another site: no employer exists in JobFits to
    // receive this, so accepting it would tell the user they applied when they did not.
    // Refuse, and hand back the real posting URL so the client can send them there.
    if (!job.isApplicableInApp) {
      throw new BadRequestException({
        message:
          'This job is hosted on another site. Apply on the original posting instead.',
        externalUrl: job.externalUrl ?? null,
        sourceType: job.sourceType,
      });
    }

    const existing = await this.applicationRepository.findByUserAndJob(
      userId,
      dto.jobId,
    );
    if (existing) {
      throw new BadRequestException('You have already applied to this job');
    }

    const application = Application.create({
      userId,
      jobId: dto.jobId,
      resumeId: dto.resumeId,
      notes: dto.notes,
      coverLetter: dto.coverLetter,
      status: ApplicationStatus.SUBMITTED,
    });
    await this.applicationRepository.save(application);
    await this.timelineRepository.addEvent(
      application.id,
      ApplicationStatus.SUBMITTED,
      'SUBMITTED',
      'Application submitted',
    );
    await this.publishEvents(application);

    // AI Recruiter: assess the candidate against this job's stated requirements and move
    // SUBMITTED -> SCREENING. Deliberately awaited rather than queued — it is a pgvector
    // query plus string comparison (no LLM call; requirements were extracted and cached
    // earlier), so it is fast enough to run inline, and the employer sees a screened
    // application immediately rather than an unexplained gap.
    //
    // `screen` never throws: a scoring failure must not cost the candidate their
    // application. The row simply stays SUBMITTED and unscreened.
    await this.screening.screen(application.id);

    return application;
  }

  async getApplication(applicationId: string): Promise<Application> {
    const application = await this.applicationRepository.findById(applicationId);
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  /**
   * The CANDIDATE's own status change.
   *
   * Validation, persistence and both audit rows are the transition service's job now — one
   * definition of the lifecycle for every caller. What stays here is the domain event, which
   * is this module's to raise.
   */
  async updateStatus(
    applicationId: string,
    newStatus: ApplicationStatus,
    actorUserId?: string,
  ): Promise<Application> {
    const { previousStatus } = await this.transitions.transition({
      applicationId,
      newStatus,
      actor: TransitionActor.CANDIDATE,
      actorUserId,
    });
    await this.eventBus.publish(
      new ApplicationStatusChangedEvent(applicationId, previousStatus, newStatus),
    );
    return this.getApplication(applicationId);
  }

  /** A user's applications, newest first, paginated. */
  async getApplications(
    userId: string,
    skip = 0,
    take = 20,
  ): Promise<Application[]> {
    return this.applicationRepository.findByUserId(userId, skip, take);
  }

  async getApplicationTimeline(
    applicationId: string,
  ): Promise<ApplicationTimeline[]> {
    return this.timelineRepository.findByApplicationId(applicationId);
  }

  async addContactPerson(
    applicationId: string,
    dto: AddContactPersonDto,
  ): Promise<ContactPerson> {
    await this.getApplication(applicationId); // ensure it exists
    const contact = ContactPerson.create({
      applicationId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      title: dto.title,
      linkedinUrl: dto.linkedinUrl,
    });
    await this.contactPersonRepository.save(contact);
    return contact;
  }

  private async publishEvents(application: Application): Promise<void> {
    for (const event of application.getDomainEvents()) {
      await this.eventBus.publish(event);
    }
    application.clearDomainEvents();
  }
}
