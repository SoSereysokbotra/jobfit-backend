// src/modules/resume/domain/events/resume-default-changed.event.ts
//
// Raised when a user changes which résumé is their default (including the implicit
// first-upload default). `aggregateId` is the USER id, not the résumé id.
//
// The candidate embedding is built from the active résumé, so switching the default has
// to re-embed — otherwise the user picks a different CV and their recommendations don't
// move, which reads as the setting doing nothing.

import { DomainEvent } from '@common/abstracts/domain-event';

export class ResumeDefaultChangedEvent extends DomainEvent {
  constructor(
    /** The user whose default changed. */
    aggregateId: string,
    public readonly resumeId: string,
  ) {
    super(aggregateId);
  }
}
