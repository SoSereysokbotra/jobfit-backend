// src/modules/application/domain/entities/application.entity.ts
//
// Application aggregate root. Owns the status lifecycle (with validated transitions) and
// raises ApplicationSubmitted / ApplicationStatusChanged events.

import { AggregateRoot } from '@common/abstracts/aggregate-root';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';
import { ApplicationSubmittedEvent } from '../events/application-submitted.event';
import { ApplicationStatusChangedEvent } from '../events/application-status-changed.event';

/** Allowed status transitions (BACKEND_PART2). Terminal states map to []. */
const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  [ApplicationStatus.DRAFT]: [ApplicationStatus.SUBMITTED],
  [ApplicationStatus.SUBMITTED]: [
    ApplicationStatus.SCREENING,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.SCREENING]: [
    ApplicationStatus.INTERVIEW,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.INTERVIEW]: [
    ApplicationStatus.OFFER,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.OFFER]: [
    ApplicationStatus.ACCEPTED,
    ApplicationStatus.NEGOTIATING,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.NEGOTIATING]: [
    ApplicationStatus.ACCEPTED,
    ApplicationStatus.REJECTED,
  ],
  [ApplicationStatus.ACCEPTED]: [],
  [ApplicationStatus.REJECTED]: [],
  [ApplicationStatus.WITHDRAWN]: [],
  [ApplicationStatus.ARCHIVED]: [],
};

export interface ApplicationProps {
  userId: string;
  jobId: string;
  resumeId?: string;
  status?: ApplicationStatus;
  appliedAt?: Date;
  notes?: string;
  coverLetter?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Application extends AggregateRoot {
  userId: string;
  jobId: string;
  resumeId?: string;
  status: ApplicationStatus;
  appliedAt: Date;
  notes?: string;
  coverLetter?: string;

  constructor(props: ApplicationProps, id?: string) {
    super(props, id);

    if (!props.userId) throw new Error('userId is required');
    if (!props.jobId) throw new Error('jobId is required');

    this.userId = props.userId;
    this.jobId = props.jobId;
    this.resumeId = props.resumeId;
    this.status = props.status ?? ApplicationStatus.SUBMITTED;
    this.appliedAt = props.appliedAt ?? new Date();
    this.notes = props.notes;
    this.coverLetter = props.coverLetter;
  }

  /** New application — raises ApplicationSubmittedEvent. */
  static create(props: ApplicationProps): Application {
    const application = new Application(props);
    application.addDomainEvent(
      new ApplicationSubmittedEvent(
        application.id,
        application.userId,
        application.jobId,
      ),
    );
    return application;
  }

  /** Transition status; throws on an invalid transition and raises the changed event. */
  updateStatus(newStatus: ApplicationStatus): void {
    const allowed = TRANSITIONS[this.status] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid status transition: ${this.status} → ${newStatus}`,
      );
    }
    const oldStatus = this.status;
    this.status = newStatus;
    this.updatedAt = new Date();
    this.addDomainEvent(
      new ApplicationStatusChangedEvent(this.id, oldStatus, newStatus),
    );
  }

  addNote(note: string): void {
    this.notes = note;
    this.updatedAt = new Date();
  }

  /**
   * Marks that a contact person was attached. The ContactPerson row itself is persisted
   * separately (1:1) via ContactPersonRepository; this just bumps the aggregate.
   */
  addContactPerson(_name: string, _email?: string, _phone?: string): void {
    this.updatedAt = new Date();
  }
}
