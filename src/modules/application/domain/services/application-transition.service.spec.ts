// The chokepoint every status write goes through.
//
// Three properties are load-bearing:
//  1. The lifecycle is checked before entitlement — a transition can be wrong even when the
//     actor is entitled to the target status.
//  2. SYSTEM is not god mode. It skips entitlement, never TRANSITIONS.
//  3. Every successful change writes BOTH audit rows. Six of the nine previous write sites
//     wrote neither, which is why accepting an offer left no trace anywhere.

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

const makeTx = (current: ApplicationStatus | null, affected = 1): Tx => ({
  application: {
    findUnique: jest
      .fn()
      .mockResolvedValue(current ? { status: current } : null),
    updateMany: jest.fn().mockResolvedValue({ count: affected }),
  },
  applicationStageHistory: { create: jest.fn().mockResolvedValue({}) },
  applicationTimeline: { create: jest.fn().mockResolvedValue({}) },
});

const setup = (current: ApplicationStatus | null, affected = 1) => {
  const tx = makeTx(current, affected);
  const prisma = {
    $transaction: jest.fn((cb: (c: Tx) => unknown) => cb(tx)),
  };
  const service = new ApplicationTransitionService(prisma as never);
  return { service, tx, prisma };
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
});
