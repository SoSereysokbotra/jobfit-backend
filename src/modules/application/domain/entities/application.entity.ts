// src/modules/application/domain/entities/application.entity.ts
//
// Application aggregate root. Owns the status lifecycle (with validated transitions) and
// raises ApplicationSubmitted / ApplicationStatusChanged events.

import { AggregateRoot } from '@common/abstracts/aggregate-root';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';
import { ApplicationSubmittedEvent } from '../events/application-submitted.event';
import { ApplicationStatusChangedEvent } from '../events/application-status-changed.event';

/**
 * Allowed status transitions. Terminal states map to [].
 *
 * WITHDRAWN is reachable from EVERY active stage. A candidate can always walk away —
 * they took another job, or lost interest — and the system must not trap them in a
 * process they no longer want to be in.
 *
 * It used to be reachable only from SUBMITTED. That was survivable while applications sat
 * in SUBMITTED until an employer touched them; once automatic screening began moving
 * every new application to SCREENING on submit, withdrawal became unreachable for
 * everybody. A merely narrow rule turned into one that blocked the single action a
 * candidate is unconditionally entitled to take.
 *
 * ARCHIVED is NO LONGER a destination. It was reachable from the terminal states so a
 * candidate could tidy their list — but a status is shared, so tidying rewrote a record
 * the other party reads: archiving an accepted job removed it from the employer's Hired
 * column and filed a hired candidate under rejections. It also overwrote the status
 * beneath it, so the row stopped saying the person had been hired at all. Archiving is a
 * view preference and now lives in per-actor columns (archivedByCandidateAt /
 * archivedByEmployerAt) where one side's housekeeping cannot edit the other's.
 *
 * The enum value survives for rows written before this change; nothing produces it.
 */
const TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  [ApplicationStatus.DRAFT]: [
    ApplicationStatus.SUBMITTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.SUBMITTED]: [
    ApplicationStatus.SCREENING,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  // SCREENING -> OFFER (D1) lets an employer skip the interview for a candidate they are
  // already convinced by. The offer module allowed this all along by writing status
  // straight through Prisma; the choice is now made here, once, where everyone can see it.
  // SUBMITTED -> OFFER is deliberately NOT allowed: that is a candidate nothing evaluated.
  [ApplicationStatus.SCREENING]: [
    ApplicationStatus.INTERVIEW,
    ApplicationStatus.OFFER,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.INTERVIEW]: [
    ApplicationStatus.OFFER,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.OFFER]: [
    ApplicationStatus.ACCEPTED,
    ApplicationStatus.NEGOTIATING,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  // NEGOTIATING -> OFFER is how a negotiation ends: the employer puts revised terms on the
  // table. The offer module has always supported re-extending during negotiation
  // (updateOffer treats NEGOTIATING as editable), so without this the supported flow would
  // start failing the moment it went through the transition rules.
  [ApplicationStatus.NEGOTIATING]: [
    ApplicationStatus.OFFER,
    ApplicationStatus.ACCEPTED,
    ApplicationStatus.REJECTED,
    ApplicationStatus.WITHDRAWN,
  ],
  [ApplicationStatus.ACCEPTED]: [],
  // REJECTED -> SCREENING (D2) reopens a closed application. Re-extending an offer to a
  // candidate who was rejected — or who declined — worked before these rules were enforced,
  // because extendOffer upserts and resets the offer. Reopening returns them to the
  // pipeline rather than teleporting them to OFFER, so the record shows the stage they
  // actually re-entered. WITHDRAWN gets no such door: walking away is the candidate's
  // decision, and an employer must not undo it.
  [ApplicationStatus.REJECTED]: [ApplicationStatus.SCREENING],
  [ApplicationStatus.WITHDRAWN]: [],
  [ApplicationStatus.ARCHIVED]: [],
};

/**
 * Statuses a CANDIDATE may set on their own application.
 *
 * Everything absent from this list — SCREENING, INTERVIEW, OFFER, REJECTED — records what
 * the EMPLOYER decided. A candidate asserting one would be fabricating a hiring outcome
 * inside the employer's own pipeline view.
 *
 * ACCEPTED and NEGOTIATING are the candidate's genuine replies to an offer. TRANSITIONS
 * already confines them to the OFFER stage, so they cannot be reached early.
 *
 * ARCHIVED was here. Tidying your own list is not a statement about the hire, so it is no
 * longer a status at all — see the note on TRANSITIONS.
 */
export const CANDIDATE_SETTABLE_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.WITHDRAWN,
  ApplicationStatus.ACCEPTED,
  ApplicationStatus.NEGOTIATING,
];

/**
 * Statuses an EMPLOYER may set on an application to their own job.
 *
 * The mirror of CANDIDATE_SETTABLE_STATUSES. WITHDRAWN, ACCEPTED and NEGOTIATING are
 * absent on purpose: those are the CANDIDATE's decisions. An employer marking someone
 * WITHDRAWN would record that the candidate pulled out when they did not; marking them
 * ACCEPTED would record that they took a job they never agreed to.
 */
export const EMPLOYER_SETTABLE_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.SCREENING,
  ApplicationStatus.INTERVIEW,
  ApplicationStatus.OFFER,
  ApplicationStatus.REJECTED,
];

/**
 * Is `to` reachable from `from`?
 *
 * Exported because the employer pipeline updates applications through Prisma directly
 * rather than through this aggregate, and so was writing any status over any other —
 * skipping stages entirely. One definition of the lifecycle, used by both paths.
 */
export function isTransitionAllowed(
  from: ApplicationStatus,
  to: ApplicationStatus,
): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/**
 * What the CANDIDATE can actually do to an application in this state.
 *
 * Both rules at once: reachable from `from`, AND theirs to make. Served to the client so
 * the UI offers only real options — listing every candidate-settable status regardless of
 * the current stage produced a menu where each choice answered with "Invalid status
 * transition", which reads as broken rather than as "there is nothing to do here".
 *
 * An empty array is a legitimate answer: an ARCHIVED application is finished.
 */
export function candidateActionsFrom(
  from: ApplicationStatus,
): ApplicationStatus[] {
  return (TRANSITIONS[from] ?? []).filter((s) =>
    CANDIDATE_SETTABLE_STATUSES.includes(s),
  );
}

/**
 * What the EMPLOYER can actually do to an application in this state. The mirror of
 * candidateActionsFrom, and served on the pipeline DTO for the same reason.
 *
 * The employer board offered every column as a drop target regardless of where a card
 * was, so "Hired" — which maps to ACCEPTED, the candidate's decision — was a drop target
 * that refused 100% of the time. Serving the real answer lets the UI derive what is
 * possible instead of keeping its own copy of these rules, which then rots.
 *
 * Worth noting what this returns from SUBMITTED: [SCREENING, REJECTED], NOT INTERVIEW.
 * Automatic screening never throws, so when the AI service is down applications stay in
 * SUBMITTED — and those cards sit in the same board column as SCREENING ones. A rule
 * derived per column rather than per card gets exactly those candidates wrong.
 */
/**
 * Statuses a candidate can still walk away from.
 *
 * Derived from TRANSITIONS rather than listed, so it cannot drift from the rules. Callers
 * that close applications in bulk need this: an application can be finished while its offer
 * row still looks live, and asking to withdraw one of those refuses the transition — which,
 * inside a transaction, takes the caller's real work down with it.
 */
export const WITHDRAWABLE_FROM: readonly ApplicationStatus[] = (
  Object.keys(TRANSITIONS) as ApplicationStatus[]
).filter((from) => TRANSITIONS[from].includes(ApplicationStatus.WITHDRAWN));

export function employerActionsFrom(
  from: ApplicationStatus,
): ApplicationStatus[] {
  return (TRANSITIONS[from] ?? []).filter((s) =>
    EMPLOYER_SETTABLE_STATUSES.includes(s),
  );
}

export interface ApplicationProps {
  userId: string;
  jobId: string;
  resumeId?: string;
  status?: ApplicationStatus;
  appliedAt?: Date;
  notes?: string;
  coverLetter?: string;
  /** When the CANDIDATE hid this from their own list. Never affects the employer's view. */
  archivedByCandidateAt?: Date | null;
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
  archivedByCandidateAt?: Date | null;

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
    this.archivedByCandidateAt = props.archivedByCandidateAt ?? null;
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
