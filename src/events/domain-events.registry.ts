/**
 * Domain Events Registry
 *
 * This file serves as the single place to import and re-export all domain
 * event classes from across modules. It makes it easy to discover every
 * event that can be emitted in the system.
 *
 * Usage:
 *   import { JobPublishedEvent } from '@events/domain-events.registry';
 */

// --- Job Events ---
export { JobPublishedEvent } from '../modules/job/domain/events/job-published.event';
export { JobClosedEvent } from '../modules/job/domain/events/job-closed.event';
export { JobUpdatedEvent } from '../modules/job/domain/events/job-updated.event';

// --- Application Events ---
export { ApplicationSubmittedEvent } from '../modules/application/domain/events/application-submitted.event';
export { ApplicationStatusChangedEvent } from '../modules/application/domain/events/application-status-changed.event';

// --- Resume Events ---
export { ResumeUploadedEvent } from '../modules/resume/domain/events/resume-uploaded.event';

// --- User Events ---
export { UserRegisteredEvent } from '../modules/user/domain/events/user-registered.event';
