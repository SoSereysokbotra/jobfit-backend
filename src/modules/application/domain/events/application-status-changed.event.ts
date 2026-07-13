// src/modules/application/domain/events/application-status-changed.event.ts
//
// Raised when an application transitions to a new status.

import { DomainEvent } from '@common/abstracts/domain-event';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';

export class ApplicationStatusChangedEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly oldStatus: ApplicationStatus,
    public readonly newStatus: ApplicationStatus,
  ) {
    super(aggregateId);
  }
}
