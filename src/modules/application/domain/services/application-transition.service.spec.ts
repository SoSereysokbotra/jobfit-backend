// The chokepoint every status write goes through.
//
// Three properties are load-bearing:
//  1. The lifecycle is checked before entitlement — a transition can be wrong even when the
//     actor is entitled to the target status.
//  2. SYSTEM is not god mode. It skips entitlement, never TRANSITIONS.
//  3. Every successful change writes BOTH audit rows. Six of the nine previous write sites
//     wrote neither, which is why accepting an offer left no trace anywhere.
//  4. The COUNTERPARTY is notified, on the caller's transaction, so a notification cannot
//     outlive a rolled-back change — and the actor is never told about themselves.

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApplicationTransitionService } from './application-transition.service';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';
import { TransitionActor } from '@shared/kernel/enums/transition-actor.enum';

type Tx = {
  application: { findUnique: jest.Mock; updateMany: jest.Mock };
  applicationStageHistory: { create: jest.Mock };
  applicationTimeline: { create: jest.Mock };
};

/** The candidate and the employer on the application under test. */
const CANDIDATE = 'user-candidate';
const EMPLOYER = 'user-employer';

interface Opts {
  affected?: number;
  /** An ingested posting has no employer in JobFits to notify. */
  postedByEmployerId?: string | null;
}

const makeTx = (current: ApplicationStatus | null, opts: Opts = {}): Tx => ({
  application: {
    // Called twice per transition: once for the status, once by notifyCounterparty.
    // One mock answers both, which is also what Prisma would return.
    findUnique: jest.fn().mockResolvedValue(
      current
        ? {
            status: current,
            userId: CANDIDATE,
            job: {
              title: 'Backend Engineer',
              postedByEmployerId:
                opts.postedByEmployerId === undefined
                  ? EMPLOYER
                  : opts.postedByEmployerId,
            },
          }
        : null,
    ),
    updateMany: jest.fn().mockResolvedValue({ count: opts.affected ?? 1 }),
  },
  applicationStageHistory: { create: jest.fn().mockResolvedValue({}) },
  applicationTimeline: { create: jest.fn().mockResolvedValue({}) },
});

const setup = (current: ApplicationStatus | null, affectedOrOpts: number | Opts = 1) => {
  const opts: Opts =
    typeof affectedOrOpts === 'number' ? { affected: affectedOrOpts } : affectedOrOpts;
  const tx = makeTx(current, opts);
  const prisma = {
    $transaction: jest.fn((cb: (c: Tx) => unknown) => cb(tx)),
  };
  const notifications = { create: jest.fn().mockResolvedValue(undefined) };
  const service = new ApplicationTransitionService(
    prisma as never,
    notifications as never,
  );
  return { service, tx, prisma, notifications };
};

const move = (
  service: ApplicationTransitionService,
  newStatus: ApplicationStatus,
  actor: TransitionActor,
  actorUserId?: string,
) => service.transition({ applicationId: 'app-1', newStatus, actor, actorUserId });

describe('ApplicationTransitionService', () => {
  describe('legal moves for the actor who owns them', () => {
    it('lets an EMPLOYER advance SCREENING -> INTERVIEW', async () => {
      const { service, tx } = setup(ApplicationStatus.SCREENING);

      const result = await move(
        service,
        ApplicationStatus.INTERVIEW,
        TransitionActor.EMPLOYER,
        'emp-1',
      );

      expect(result).toEqual({
        applicationId: 'app-1',
        previousStatus: ApplicationStatus.SCREENING,
        newStatus: ApplicationStatus.INTERVIEW,
      });
      expect(tx.application.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ApplicationStatus.INTERVIEW,
            reviewedByEmployerId: 'emp-1',
          }),
        }),
      );
    });

    it('lets a CANDIDATE accept an offer', async () => {
      const { service } = setup(ApplicationStatus.OFFER);
      await expect(
        move(service, ApplicationStatus.ACCEPTED, TransitionActor.CANDIDATE, 'u1'),
      ).resolves.toMatchObject({ newStatus: ApplicationStatus.ACCEPTED });
    });

    it('lets a CANDIDATE withdraw from any active stage', async () => {
      for (const from of [
        ApplicationStatus.SUBMITTED,
        ApplicationStatus.SCREENING,
        ApplicationStatus.INTERVIEW,
        ApplicationStatus.OFFER,
        ApplicationStatus.NEGOTIATING,
      ]) {
        const { service } = setup(from);
        await expect(
          move(service, ApplicationStatus.WITHDRAWN, TransitionActor.CANDIDATE, 'u1'),
        ).resolves.toMatchObject({ newStatus: ApplicationStatus.WITHDRAWN });
      }
    });

    it('lets SYSTEM screen a fresh application', async () => {
      const { service } = setup(ApplicationStatus.SUBMITTED);
      await expect(
        move(service, ApplicationStatus.SCREENING, TransitionActor.SYSTEM),
      ).resolves.toMatchObject({ newStatus: ApplicationStatus.SCREENING });
    });
  });

  describe('entitlement — whose decision is this', () => {
    it.each([
      ApplicationStatus.ACCEPTED,
      ApplicationStatus.NEGOTIATING,
      ApplicationStatus.WITHDRAWN,
    ])('refuses an EMPLOYER setting %s from OFFER', async (status) => {
      // Owning the job is not authorisation to record the candidate's answer. Marking
      // someone ACCEPTED would record that they took a job they never agreed to.
      const { service, tx } = setup(ApplicationStatus.OFFER);

      await expect(
        move(service, status, TransitionActor.EMPLOYER, 'emp-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.application.updateMany).not.toHaveBeenCalled();
    });

    it.each([ApplicationStatus.INTERVIEW, ApplicationStatus.REJECTED])(
      'refuses a CANDIDATE setting %s',
      async (status) => {
        const { service, tx } = setup(ApplicationStatus.SCREENING);

        await expect(
          move(service, status, TransitionActor.CANDIDATE, 'u1'),
        ).rejects.toThrow(ForbiddenException);
        expect(tx.application.updateMany).not.toHaveBeenCalled();
      },
    );

    it('keeps the employer refusal message that explains whose call it is', async () => {
      const { service } = setup(ApplicationStatus.OFFER);
      await expect(
        move(service, ApplicationStatus.ACCEPTED, TransitionActor.EMPLOYER, 'emp-1'),
      ).rejects.toThrow(
        "ACCEPTED is the candidate's decision to record, not yours.",
      );
    });
  });

  describe('SYSTEM is not a bypass', () => {
    it('still refuses a transition the lifecycle forbids', async () => {
      // SYSTEM skips the entitlement check because nobody asserted a decision. It does not
      // skip TRANSITIONS: SUBMITTED -> ACCEPTED is not a state that may follow, for anyone.
      const { service, tx } = setup(ApplicationStatus.SUBMITTED);

      await expect(
        move(service, ApplicationStatus.ACCEPTED, TransitionActor.SYSTEM),
      ).rejects.toThrow(BadRequestException);
      expect(tx.application.updateMany).not.toHaveBeenCalled();
    });

    it('records a null actor rather than inventing one', async () => {
      const { service, tx } = setup(ApplicationStatus.SUBMITTED);
      await move(service, ApplicationStatus.SCREENING, TransitionActor.SYSTEM);

      expect(tx.applicationStageHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ movedByUserId: null }),
      });
    });
  });

  describe('the lifecycle is checked before entitlement', () => {
    it('calls INTERVIEW -> ACCEPTED invalid, not forbidden', async () => {
      // The employer is indeed not entitled to ACCEPTED, but the transition is wrong on its
      // own terms — there is no offer yet. Reporting the transition is the truthful answer.
      const { service } = setup(ApplicationStatus.INTERVIEW);

      await expect(
        move(service, ApplicationStatus.ACCEPTED, TransitionActor.EMPLOYER, 'emp-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to skip stages: SUBMITTED -> OFFER', async () => {
      const { service } = setup(ApplicationStatus.SUBMITTED);
      await expect(
        move(service, ApplicationStatus.OFFER, TransitionActor.EMPLOYER, 'emp-1'),
      ).rejects.toThrow('Invalid status transition: SUBMITTED → OFFER');
    });
  });

  describe('audit trail', () => {
    it('writes BOTH audit rows on every successful change', async () => {
      const { service, tx } = setup(ApplicationStatus.INTERVIEW);

      await service.transition({
        applicationId: 'app-1',
        newStatus: ApplicationStatus.OFFER,
        actor: TransitionActor.EMPLOYER,
        actorUserId: 'emp-1',
        notes: 'Strong on the stated requirements',
        eventType: 'OFFER_EXTENDED',
        description: 'Offer extended',
      });

      expect(tx.applicationStageHistory.create).toHaveBeenCalledWith({
        data: {
          applicationId: 'app-1',
          previousStatus: ApplicationStatus.INTERVIEW,
          newStatus: ApplicationStatus.OFFER,
          movedByUserId: 'emp-1',
          notes: 'Strong on the stated requirements',
        },
      });
      expect(tx.applicationTimeline.create).toHaveBeenCalledWith({
        data: {
          applicationId: 'app-1',
          status: ApplicationStatus.OFFER,
          eventType: 'OFFER_EXTENDED',
          description: 'Offer extended',
        },
      });
    });

    it('defaults the timeline event when the caller says nothing', async () => {
      const { service, tx } = setup(ApplicationStatus.SCREENING);
      await move(service, ApplicationStatus.INTERVIEW, TransitionActor.EMPLOYER, 'e1');

      expect(tx.applicationTimeline.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventType: 'STATUS_CHANGED',
          description: 'Status changed to INTERVIEW',
        }),
      });
    });

    it('writes no audit row when the move is refused', async () => {
      const { service, tx } = setup(ApplicationStatus.OFFER);

      await expect(
        move(service, ApplicationStatus.ACCEPTED, TransitionActor.EMPLOYER, 'e1'),
      ).rejects.toThrow();

      expect(tx.applicationStageHistory.create).not.toHaveBeenCalled();
      expect(tx.applicationTimeline.create).not.toHaveBeenCalled();
    });
  });

  describe('concurrency and transactions', () => {
    it('fails loudly when someone else moved the card first', async () => {
      // Compare-and-swap: the update is conditioned on the status we validated against, so
      // the loser of the race is told, instead of silently overwriting the winner.
      const { service } = setup(ApplicationStatus.INTERVIEW, 0);

      await expect(
        move(service, ApplicationStatus.OFFER, TransitionActor.EMPLOYER, 'e1'),
      ).rejects.toThrow(ConflictException);
    });

    it('conditions the write on the status it checked', async () => {
      const { service, tx } = setup(ApplicationStatus.INTERVIEW);
      await move(service, ApplicationStatus.OFFER, TransitionActor.EMPLOYER, 'e1');

      expect(tx.application.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'app-1', status: ApplicationStatus.INTERVIEW },
        }),
      );
    });

    it('joins a caller-supplied transaction instead of opening its own', async () => {
      // The offer module changes an offer row and an application status together; they must
      // commit or roll back as one.
      const { service, prisma } = setup(ApplicationStatus.OFFER);
      const outerTx = makeTx(ApplicationStatus.OFFER);

      await service.transition(
        {
          applicationId: 'app-1',
          newStatus: ApplicationStatus.ACCEPTED,
          actor: TransitionActor.CANDIDATE,
          actorUserId: 'u1',
        },
        outerTx as never,
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(outerTx.application.updateMany).toHaveBeenCalled();
      expect(outerTx.applicationStageHistory.create).toHaveBeenCalled();
    });

    it('404s on an application that does not exist', async () => {
      const { service } = setup(null);
      await expect(
        move(service, ApplicationStatus.INTERVIEW, TransitionActor.EMPLOYER, 'e1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // The notification module was three empty @OnEvent stubs, and the one event that did
  // exist was published only from ApplicationService.updateStatus — the candidate changing
  // their OWN application, the single case needing no notification. Every employer-driven
  // move reaches this service from a different caller and told nobody anything.
  describe('notifying the counterparty', () => {
    it('tells the CANDIDATE when the employer moves them', async () => {
      const { service, notifications } = setup(ApplicationStatus.SCREENING);

      await move(service, ApplicationStatus.INTERVIEW, TransitionActor.EMPLOYER, EMPLOYER);

      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create.mock.calls[0][0]).toMatchObject({
        userId: CANDIDATE,
        type: 'APPLICATION',
        link: '/applications/app-1',
      });
    });

    it('tells the EMPLOYER when the candidate accepts', async () => {
      const { service, notifications } = setup(ApplicationStatus.OFFER);

      await move(service, ApplicationStatus.ACCEPTED, TransitionActor.CANDIDATE, CANDIDATE);

      expect(notifications.create.mock.calls[0][0]).toMatchObject({ userId: EMPLOYER });
    });

    it('tells the candidate about a SYSTEM change', async () => {
      // Automatic screening is a real move in their pipeline, and they are the only party
      // with a stake in hearing about it.
      const { service, notifications } = setup(ApplicationStatus.SUBMITTED);

      await move(service, ApplicationStatus.SCREENING, TransitionActor.SYSTEM);

      expect(notifications.create.mock.calls[0][0]).toMatchObject({ userId: CANDIDATE });
    });

    it('writes the notification on the SAME transaction as the status change', async () => {
      // The property that makes this correct where an @OnEvent listener could not be:
      // emitAsync fires while the transaction is still open, so a listener can notify
      // someone of a hiring decision that then rolls back.
      const { service, tx, notifications } = setup(ApplicationStatus.SCREENING);

      await move(service, ApplicationStatus.INTERVIEW, TransitionActor.EMPLOYER, EMPLOYER);

      expect(notifications.create.mock.calls[0][1]).toBe(tx);
    });

    it('never notifies the actor about their own action', async () => {
      // Seeded demo data can have one user on both sides. Telling someone what they just
      // did is noise that trains people to ignore the bell.
      const { service, notifications } = setup(ApplicationStatus.OFFER, {
        postedByEmployerId: CANDIDATE,
      });

      await move(service, ApplicationStatus.ACCEPTED, TransitionActor.CANDIDATE, CANDIDATE);

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('stays silent when an ingested job has no employer to tell', async () => {
      const { service, notifications } = setup(ApplicationStatus.OFFER, {
        postedByEmployerId: null,
      });

      await move(service, ApplicationStatus.ACCEPTED, TransitionActor.CANDIDATE, CANDIDATE);

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('does not notify when the transition is refused', async () => {
      const { service, notifications } = setup(ApplicationStatus.ACCEPTED);

      await expect(
        move(service, ApplicationStatus.INTERVIEW, TransitionActor.EMPLOYER, EMPLOYER),
      ).rejects.toThrow(BadRequestException);
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });
});
