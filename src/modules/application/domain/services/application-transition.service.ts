// src/modules/application/domain/services/application-transition.service.ts
//
// THE one road to an application status write.
//
// Before this existed the lifecycle rules were a reference book callers were trusted to
// consult: of nine status-write sites, two consulted it and seven did not, and six wrote no
// audit row at all — including accept, decline, negotiate and rescind, the four moments that
// decide a hire. Every status change now goes through here, and an ESLint rule plus a guard
// test (Phase 4) make going around it mechanical to catch.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums, Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { NotificationService } from '@modules/notification/notification.service';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';
import { TransitionActor } from '@shared/kernel/enums/transition-actor.enum';
import {
  CANDIDATE_SETTABLE_STATUSES,
  EMPLOYER_SETTABLE_STATUSES,
  isTransitionAllowed,
} from '../entities/application.entity';

/**
 * Which statuses each actor is entitled to assert.
 *
 * SYSTEM maps to null — not to "everything". It skips this check entirely while still
 * obeying TRANSITIONS. See TransitionActor.SYSTEM.
 */
const SETTABLE_BY_ACTOR: Record<
  TransitionActor,
  readonly ApplicationStatus[] | null
> = {
  [TransitionActor.CANDIDATE]: CANDIDATE_SETTABLE_STATUSES,
  [TransitionActor.EMPLOYER]: EMPLOYER_SETTABLE_STATUSES,
  [TransitionActor.SYSTEM]: null,
};

/** The refusal each actor gets. Both messages predate this service; they are worth keeping. */
function entitlementMessage(
  actor: TransitionActor,
  status: ApplicationStatus,
): string {
  return actor === TransitionActor.EMPLOYER
    ? `${status} is the candidate's decision to record, not yours.`
    : `Only the employer can set ${status}. You can withdraw or archive your ` +
        'application, or respond to an offer.';
}

export interface TransitionParams {
  applicationId: string;
  newStatus: ApplicationStatus;
  actor: TransitionActor;
  /** The human behind the change. Absent for SYSTEM — the audit columns are nullable. */
  actorUserId?: string;
  /** Free-text note stored on the stage-history row. */
  notes?: string;
  /** Timeline event type. Defaults to STATUS_CHANGED. */
  eventType?: string;
  /** Timeline description. Defaults to a plain statement of the new status. */
  description?: string;
}

export interface TransitionResult {
  applicationId: string;
  previousStatus: ApplicationStatus;
  newStatus: ApplicationStatus;
}

@Injectable()
export class ApplicationTransitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
  ) {}

  /**
   * Validate and apply a status change, recording it in both audit tables.
   *
   * Pass `tx` when the caller already has a transaction open (the offer module does) so the
   * status change commits or rolls back with the offer row beside it. Without one, this
   * opens its own.
   */
  async transition(
    params: TransitionParams,
    tx?: Prisma.TransactionClient,
  ): Promise<TransitionResult> {
    if (tx) return this.apply(tx, params);
    return this.prisma.$transaction((client) => this.apply(client, params));
  }

  private async apply(
    tx: Prisma.TransactionClient,
    params: TransitionParams,
  ): Promise<TransitionResult> {
    const { applicationId, newStatus, actor } = params;

    const current = await tx.application.findUnique({
      where: { id: applicationId },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('Application not found');
    const previousStatus = current.status as unknown as ApplicationStatus;

    // Order matters. The lifecycle question ("can this state follow that one?") is asked
    // before the entitlement question ("is this yours to decide?"), so an employer trying
    // INTERVIEW -> ACCEPTED is told the transition is invalid rather than being told it is
    // the candidate's call — the transition would be wrong even if they were entitled.
    if (!isTransitionAllowed(previousStatus, newStatus)) {
      throw new BadRequestException(
        `Invalid status transition: ${previousStatus} → ${newStatus}`,
      );
    }

    const settable = SETTABLE_BY_ACTOR[actor];
    if (settable && !settable.includes(newStatus)) {
      throw new ForbiddenException(entitlementMessage(actor, newStatus));
    }

    // Compare-and-swap on the status we validated against. Reading inside the transaction is
    // not enough on its own: Prisma's default isolation is READ COMMITTED, so two employers
    // dragging the same card can both read INTERVIEW and both write. Conditioning the write
    // on the status we checked makes the loser of that race fail loudly instead of silently
    // overwriting the winner.
    const affected = await tx.application.updateMany({
      where: {
        id: applicationId,
        status: previousStatus as unknown as $Enums.ApplicationStatus,
      },
      data: {
        status: newStatus as unknown as $Enums.ApplicationStatus,
        ...(actor === TransitionActor.EMPLOYER && params.actorUserId
          ? { reviewedByEmployerId: params.actorUserId }
          : {}),
      },
    });
    if (affected.count !== 1) {
      throw new ConflictException(
        'This application was changed by someone else a moment ago. ' +
          'Refresh to see where it is now.',
      );
    }

    // Both audit tables, always. They are split by actor today — the employer path wrote
    // stage history, the candidate path wrote the timeline, and the offer module wrote
    // neither — which is why accepting an offer left no trace anywhere.
    await tx.applicationStageHistory.create({
      data: {
        applicationId,
        previousStatus: previousStatus as unknown as $Enums.ApplicationStatus,
        newStatus: newStatus as unknown as $Enums.ApplicationStatus,
        movedByUserId: params.actorUserId ?? null,
        notes: params.notes ?? null,
      },
    });
    await tx.applicationTimeline.create({
      data: {
        applicationId,
        status: newStatus as unknown as $Enums.ApplicationStatus,
        eventType: params.eventType ?? 'STATUS_CHANGED',
        description: params.description ?? `Status changed to ${newStatus}`,
      },
    });

    await this.notifyCounterparty(tx, applicationId, newStatus, params);

    return { applicationId, previousStatus, newStatus };
  }

  /**
   * Tell the OTHER party. A third record of the same event, beside the two audit rows.
   *
   * WHY HERE AND NOT IN A LISTENER. `ApplicationStatusChangedEvent` exists, and a
   * NotificationModule listener was subscribed to it — but the event is published from
   * exactly one place, `ApplicationService.updateStatus`, which is the candidate changing
   * their OWN application: the single case where the candidate needs no telling. Every
   * employer-driven move reaches this method from a different caller and published
   * nothing at all. On top of that, `emitAsync` fires while this transaction is still
   * open, so a listener can notify someone of a hiring decision that then rolls back.
   * Writing the row on `tx` makes the notification exactly as true as the change.
   *
   * WHY THE COUNTERPARTY. The actor already knows what they just did; a notification
   * telling them is noise that trains people to ignore the bell. Which side that is
   * follows from `actor`, which this service already demands rather than infers.
   */
  private async notifyCounterparty(
    tx: Prisma.TransactionClient,
    applicationId: string,
    newStatus: ApplicationStatus,
    params: TransitionParams,
  ): Promise<void> {
    const app = await tx.application.findUnique({
      where: { id: applicationId },
      select: {
        userId: true,
        job: { select: { title: true, postedByEmployerId: true } },
      },
    });
    if (!app) return;

    const recipient =
      params.actor === TransitionActor.CANDIDATE
        ? // An ingested (external) job has no employer here to tell.
          app.job.postedByEmployerId
        : app.userId;
    // SYSTEM changes are addressed to the candidate: automatic screening is a real move
    // in their pipeline and the only party with a stake in hearing about it.
    if (!recipient) return;
    // Belt and braces: an employer acting on their own application (possible in seeded
    // demo data) must not be told about themselves.
    if (recipient === params.actorUserId) return;

    await this.notifications.create(
      {
        userId: recipient,
        type: $Enums.NotificationType.APPLICATION,
        title: NOTIFICATION_TITLES[newStatus] ?? 'Application updated',
        body:
          params.description ??
          `${app.job.title} — now ${newStatus.toLowerCase()}.`,
        link: `/applications/${applicationId}`,
      },
      tx,
    );
  }
}

/**
 * What the reader is actually being told, per status.
 *
 * Deliberately written from the RECIPIENT's side. "Withdrawn" reaches an employer and
 * means the candidate walked away; "Rejected" reaches a candidate and means the employer
 * closed them out. A single generic "Status changed to X" would be correct and useless.
 */
const NOTIFICATION_TITLES: Partial<Record<ApplicationStatus, string>> = {
  [ApplicationStatus.SCREENING]: 'Your application is being reviewed',
  [ApplicationStatus.INTERVIEW]: 'You have moved to interview',
  [ApplicationStatus.OFFER]: 'You have an offer',
  [ApplicationStatus.NEGOTIATING]: 'A candidate opened a negotiation',
  [ApplicationStatus.ACCEPTED]: 'A candidate accepted your offer',
  [ApplicationStatus.REJECTED]: 'An update on your application',
  [ApplicationStatus.WITHDRAWN]: 'A candidate withdrew',
};
