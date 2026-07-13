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
import { ApplicationTimeline } from './domain/entities/application-timeline.entity';
import { ContactPerson } from './domain/entities/contact-person.entity';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';
import { SubmitApplicationDto } from './dto/submit-application.dto';
import { AddContactPersonDto } from './dto/add-contact-person.dto';
import { ERROR_MESSAGES } from '@common/constants/error-messages';

@Injectable()
export class ApplicationService {
  constructor(
    private readonly applicationRepository: ApplicationRepository,
    private readonly timelineRepository: ApplicationTimelineRepository,
    private readonly contactPersonRepository: ContactPersonRepository,
    private readonly userRepository: UserRepository,
    @Inject(JOB_REPOSITORY) private readonly jobRepository: IJobRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  async submitApplication(
    userId: string,
    dto: SubmitApplicationDto,
  ): Promise<Application> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    const job = await this.jobRepository.findById(dto.jobId);
    if (!job) throw new NotFoundException('Job not found');

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
    return application;
  }

  async getApplication(applicationId: string): Promise<Application> {
    const application = await this.applicationRepository.findById(applicationId);
    if (!application) throw new NotFoundException('Application not found');
    return application;
  }

  async updateStatus(
    applicationId: string,
    newStatus: ApplicationStatus,
  ): Promise<Application> {
    const application = await this.getApplication(applicationId);
    try {
      application.updateStatus(newStatus); // validates transition, raises event
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    await this.applicationRepository.save(application);
    await this.timelineRepository.addEvent(
      applicationId,
      newStatus,
      'STATUS_CHANGED',
      `Status changed to ${newStatus}`,
    );
    await this.publishEvents(application);
    return application;
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
