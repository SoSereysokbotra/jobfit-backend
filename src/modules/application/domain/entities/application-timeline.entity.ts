// src/modules/application/domain/entities/application-timeline.entity.ts
//
// An immutable audit entry in an application's history (one per status change / event).

import { Entity } from '@common/abstracts/entity';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';

export interface ApplicationTimelineProps {
  applicationId: string;
  status: ApplicationStatus;
  eventType: string;
  description?: string;
  eventDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class ApplicationTimeline extends Entity {
  readonly applicationId: string;
  readonly status: ApplicationStatus;
  readonly eventType: string;
  readonly description?: string;
  readonly eventDate: Date;

  constructor(props: ApplicationTimelineProps, id?: string) {
    super(props, id);

    if (!props.applicationId) throw new Error('applicationId is required');
    if (!props.eventType) throw new Error('eventType is required');

    this.applicationId = props.applicationId;
    this.status = props.status;
    this.eventType = props.eventType;
    this.description = props.description;
    this.eventDate = props.eventDate ?? new Date();
  }

  static create(props: ApplicationTimelineProps): ApplicationTimeline {
    return new ApplicationTimeline(props);
  }
}
