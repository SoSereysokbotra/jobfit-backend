// Offers & Decisions, after every status write moved onto the chokepoint.
//
// This module previously wrote application status straight through Prisma in six places.
// Three consequences are pinned here:
//  1. Extending an offer is a real transition now, so it can no longer skip stages.
//  2. Declining sets WITHDRAWN, not REJECTED — a candidate declining is not the employer
//     rejecting them, and REJECTED was never theirs to assert.
//  3. Accepting elsewhere withdraws the other applications instead of ARCHIVING them,
//     which the lifecycle does not permit from OFFER or NEGOTIATING.

import { OfferService } from './offer.service';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';
import { TransitionActor } from '@shared/kernel/enums/transition-actor.enum';

const JOB = {
  id: 'job-1',
  title: 'Backend Engineer',
  companyId: 'co-1',
  location: 'Phnom Penh',
  remoteType: 'ONSITE',
  minSalary: null,
  maxSalary: null,
  company: { name: 'Acme' },
};

const offerRow = (over: Record<string, unknown> = {}) => ({
  id: 'offer-1',
  applicationId: 'app-1',
  status: 'EXTENDED',
  baseSalary: 50000,
  currency: 'USD',
  signingBonus: null,
  annualBonusPct: null,
  equityShares: null,
  equityPrice: null,
  startDate: null,
  responseDeadline: null,
  notes: null,
  createdAt: new Date(),
  decidedAt: null,
  application: {
    id: 'app-1',
    userId: 'user-1',
    job: JOB,
    user: { id: 'user-1', name: 'Dara', email: 'dara@example.test' },
  },
  ...over,
});

const setup = (opts: { appStatus?: ApplicationStatus; offer?: Record<string, unknown>; others?: unknown[] } = {}) => {
  const tx = {
    offer: {
      upsert: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue(opts.others ?? []),
    },
  };
  const prisma = {
    employerProfile: { findUnique: jest.fn().mockResolvedValue({ companyId: 'co-1' }) },
    application: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'app-1',
        status: opts.appStatus ?? ApplicationStatus.INTERVIEW,
        job: { companyId: 'co-1' },
      }),
    },
    offer: { findUnique: jest.fn().mockResolvedValue(offerRow(opts.offer)) },
    $transaction: jest.fn((cb: (c: typeof tx) => unknown) => cb(tx)),
  };
  const transitions = { transition: jest.fn().mockResolvedValue({}) };
  const service = new OfferService(prisma as never, transitions as never);
  return { service, prisma, tx, transitions };
};

/** The transition calls made, in order, as [status, actor] pairs. */
const movesOf = (transitions: { transition: jest.Mock }) =>
  transitions.transition.mock.calls.map((c) => [c[0].newStatus, c[0].actor]);

describe('OfferService status writes', () => {
  describe('extendOffer', () => {
    it('advances INTERVIEW -> OFFER through the chokepoint', async () => {
      const { service, transitions, tx } = setup({ appStatus: ApplicationStatus.INTERVIEW });

      await service.extendOffer('emp-1', 'app-1', { baseSalary: 60000 } as never);

      expect(movesOf(transitions)).toEqual([
        [ApplicationStatus.OFFER, TransitionActor.EMPLOYER],
      ]);
      // Same transaction as the offer row: they commit or roll back together.
      expect(transitions.transition.mock.calls[0][1]).toBe(tx);
    });

    it('allows SCREENING -> OFFER, skipping the interview (D1)', async () => {
      const { service, transitions } = setup({ appStatus: ApplicationStatus.SCREENING });

      await service.extendOffer('emp-1', 'app-1', { baseSalary: 60000 } as never);

      expect(movesOf(transitions)).toEqual([
        [ApplicationStatus.OFFER, TransitionActor.EMPLOYER],
      ]);
    });

    it('revises an offer already on the table without asking for OFFER -> OFFER', async () => {
      const { service, transitions, tx } = setup({ appStatus: ApplicationStatus.OFFER });

      await service.extendOffer('emp-1', 'app-1', { baseSalary: 70000 } as never);

      expect(tx.offer.upsert).toHaveBeenCalled();
      expect(transitions.transition).not.toHaveBeenCalled();
    });

    it('reopens a rejected application before extending (D2)', async () => {
      // Re-extending to someone previously closed out worked before the rules were
      // enforced. It still works — but as two audited steps through the pipeline, rather
      // than teleporting them from REJECTED straight to OFFER.
      const { service, transitions } = setup({ appStatus: ApplicationStatus.REJECTED });

      await service.extendOffer('emp-1', 'app-1', { baseSalary: 60000 } as never);

      expect(movesOf(transitions)).toEqual([
        [ApplicationStatus.SCREENING, TransitionActor.EMPLOYER],
        [ApplicationStatus.OFFER, TransitionActor.EMPLOYER],
      ]);
      expect(transitions.transition.mock.calls[0][0].eventType).toBe('REOPENED');
    });
  });

  describe('getOfferForEmployer', () => {
    it('returns the offer with its note thread', async () => {
      // Without this the employer had no read path at all, so a candidate's negotiation
      // message sat in a column nobody on their side could reach.
      const { service } = setup({
        offer: { notes: 'Excited to have you.\n[Candidate] Could we revisit base?' },
      });

      const offer = await service.getOfferForEmployer('emp-1', 'app-1');

      expect(offer.notes).toContain('[Candidate] Could we revisit base?');
    });

    it('refuses an application belonging to another company', async () => {
      const { service, prisma } = setup();
      prisma.application.findUnique.mockResolvedValue({
        id: 'app-1', status: 'OFFER', job: { companyId: 'someone-else' },
      });

      await expect(service.getOfferForEmployer('emp-1', 'app-1')).rejects.toThrow(
        'This application is for another company.',
      );
    });
  });

  describe('withdrawOffer', () => {
    it('rescinds as the EMPLOYER and rejects the application', async () => {
      const { service, transitions } = setup({ appStatus: ApplicationStatus.OFFER });

      await service.withdrawOffer('emp-1', 'app-1');

      expect(movesOf(transitions)).toEqual([
        [ApplicationStatus.REJECTED, TransitionActor.EMPLOYER],
      ]);
    });
  });

  describe('accept', () => {
    it('accepts as the CANDIDATE', async () => {
      const { service, transitions } = setup();

      await service.accept('user-1', 'offer-1');

      expect(movesOf(transitions)).toEqual([
        [ApplicationStatus.ACCEPTED, TransitionActor.CANDIDATE],
      ]);
    });

    it('WITHDRAWS the other live applications rather than archiving them', async () => {
      // ARCHIVED is reachable only from a terminal state, so the old write produced a state
      // the rules say is unreachable. WITHDRAWN is legal and truthful: the candidate walked
      // away from these because they took another job.
      const { service, transitions } = setup({
        others: [{ id: 'offer-2', applicationId: 'app-2' }],
      });

      await service.accept('user-1', 'offer-1');

      expect(movesOf(transitions)).toEqual([
        [ApplicationStatus.ACCEPTED, TransitionActor.CANDIDATE],
        [ApplicationStatus.WITHDRAWN, TransitionActor.CANDIDATE],
      ]);
      expect(transitions.transition.mock.calls[1][0].applicationId).toBe('app-2');
    });
  });

  describe('decline', () => {
    it('withdraws the candidate instead of recording an employer rejection', async () => {
      const { service, transitions, tx } = setup();

      await service.decline('user-1', 'offer-1');

      expect(movesOf(transitions)).toEqual([
        [ApplicationStatus.WITHDRAWN, TransitionActor.CANDIDATE],
      ]);
      // The decline itself is not lost — the offer row still records it.
      expect(tx.offer.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'DECLINED' }) }),
      );
    });
  });

  describe('negotiate', () => {
    it('opens negotiation as the CANDIDATE', async () => {
      const { service, transitions } = setup();

      await service.negotiate('user-1', 'offer-1', { notes: 'Could we revisit base?' } as never);

      expect(movesOf(transitions)).toEqual([
        [ApplicationStatus.NEGOTIATING, TransitionActor.CANDIDATE],
      ]);
    });
  });

  it('never writes application status directly', async () => {
    // The whole point of the phase: this module has no application.update of its own.
    const { service, prisma } = setup();
    await service.accept('user-1', 'offer-1');
    expect((prisma.application as unknown as Record<string, unknown>).update).toBeUndefined();
  });
});
