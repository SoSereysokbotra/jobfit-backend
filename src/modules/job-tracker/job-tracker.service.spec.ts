// The Job Tracker board.
//
// Three properties are load-bearing:
//  1. The user owns the stage. Any stage can follow any other, INCLUDING backwards — this
//     is the user's own note, not the employer pipeline, where the chokepoint refuses a
//     candidate asserting INTERVIEW/OFFER/REJECTED.
//  2. A move renumbers BOTH affected columns inside one transaction. Half a move leaves a
//     card in two columns or none, which the user experiences as the board losing a job.
//  3. Every read and write is scoped to the caller in the WHERE clause, never
//     fetch-then-check.

import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JobTrackerService } from './job-tracker.service';

const card = (over: Record<string, unknown> = {}) => ({
  id: 'card-1',
  userId: 'user-1',
  jobId: null,
  title: 'Khmer Interpreter',
  companyName: 'Company Name',
  url: null,
  location: null,
  stage: 'SAVED',
  position: 0,
  minSalary: null,
  maxSalary: null,
  notes: null,
  appliedAt: null,
  archivedAt: null,
  createdAt: new Date('2026-08-13'),
  updatedAt: new Date('2026-08-13'),
  ...over,
});

const setup = (opts: { current?: Record<string, unknown>; column?: string[] } = {}) => {
  const tx = {
    trackedJob: {
      // First call is the DESTINATION column, any later call is the source being closed
      // up. They must differ, or a source renumber double-counts the destination's cards.
      findMany: jest
        .fn()
        .mockResolvedValueOnce((opts.column ?? []).map((id) => ({ id })))
        .mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    trackedJob: {
      findFirst: jest.fn().mockResolvedValue(card(opts.current)),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: any) => card(data)),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      aggregate: jest.fn().mockResolvedValue({ _min: { position: 0 } }),
    },
    job: { findUnique: jest.fn() },
    $transaction: jest.fn((cb: (c: typeof tx) => unknown) => cb(tx)),
  };
  return { service: new JobTrackerService(prisma as never), prisma, tx };
};

/** The ids written back, in the order their positions were assigned. */
const orderOf = (update: jest.Mock): string[] =>
  update.mock.calls
    .filter((c) => typeof c[0]?.data?.position === 'number')
    .sort((a, b) => a[0].data.position - b[0].data.position)
    .map((c) => c[0].where.id);

describe('JobTrackerService', () => {
  describe('the board', () => {
    it('returns every stage, including the empty ones', async () => {
      // The client renders columns from this; a missing key would mean a missing column.
      const { service } = setup();

      const board = await service.board('user-1');

      expect(Object.keys(board.columns)).toEqual([
        'SAVED', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED',
      ]);
      expect(board.total).toBe(0);
    });

    it('excludes archived cards', async () => {
      const { service, prisma } = setup();
      await service.board('user-1');
      expect(prisma.trackedJob.findMany.mock.calls[0][0].where).toMatchObject({
        userId: 'user-1',
        archivedAt: null,
      });
    });
  });

  describe('adding a card', () => {
    it('copies title and company FROM the posting when jobId is given', async () => {
      // The caller must not be able to file one of our own postings under a wrong name.
      const { service, prisma } = setup();
      prisma.job.findUnique.mockResolvedValue({
        title: 'Senior Auditor',
        location: 'Phnom Penh',
        externalUrl: 'https://bongthom.com/x',
        company: { name: 'Woori Accounting Co., Ltd.' },
      });

      const result = await service.add('user-1', {
        jobId: 'job-9',
        title: 'Totally Different Title',
        companyName: 'Someone Else',
      } as never);

      expect(result.title).toBe('Senior Auditor');
      expect(result.companyName).toBe('Woori Accounting Co., Ltd.');
      expect(result.url).toBe('https://bongthom.com/x');
    });

    it('accepts a hand-entered job with no jobId', async () => {
      const { service } = setup();

      const result = await service.add('user-1', {
        title: 'Baker & Pastry Chef',
        companyName: 'White Mist',
      } as never);

      expect(result).toMatchObject({
        title: 'Baker & Pastry Chef',
        companyName: 'White Mist',
        jobId: null,
        stage: 'SAVED',
      });
    });

    it('refuses a card with neither jobId nor a title', async () => {
      const { service } = setup();
      await expect(service.add('user-1', {} as never)).rejects.toThrow(BadRequestException);
    });

    it('stamps appliedAt when a job is added straight into APPLIED', async () => {
      // The board is a record of a hunt; when they applied is the useful part.
      const { service } = setup();

      const result = await service.add('user-1', {
        title: 'X', companyName: 'Y', stage: 'APPLIED',
      } as never);

      expect(result.appliedAt).toBeInstanceOf(Date);
    });

    it('reports a duplicate as a conflict, not a crash', async () => {
      const { service, prisma } = setup();
      prisma.job.findUnique.mockResolvedValue({ title: 'T', company: { name: 'C' } });
      prisma.trackedJob.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002', clientVersion: '5.22.0',
        }),
      );
      await expect(
        service.add('user-1', { jobId: 'job-9' } as never),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('moving a card — one drag', () => {
    it('inserts at the requested index in the destination column', async () => {
      // Destination already holds a, b, c; dropping at index 1 must give a, card-1, b, c.
      const { service, tx } = setup({ column: ['a', 'b', 'c'] });

      await service.move('user-1', 'card-1', { stage: 'APPLIED', position: 1 });

      expect(orderOf(tx.trackedJob.update)).toEqual(['a', 'card-1', 'b', 'c']);
    });

    it('appends when no position is given', async () => {
      // "Dropped on an empty part of the column" is an append, not an error.
      const { service, tx } = setup({ column: ['a', 'b'] });

      await service.move('user-1', 'card-1', { stage: 'APPLIED' });

      expect(orderOf(tx.trackedJob.update)).toEqual(['a', 'b', 'card-1']);
    });

    it('clamps an out-of-range index instead of throwing', async () => {
      // A stale client index must not fail a drag the user already saw succeed.
      const { service, tx } = setup({ column: ['a'] });

      await service.move('user-1', 'card-1', { stage: 'APPLIED', position: 99 });

      expect(orderOf(tx.trackedJob.update)).toEqual(['a', 'card-1']);
    });

    it('renumbers the SOURCE column too, closing the gap', async () => {
      const { service, tx } = setup({ current: { stage: 'SAVED' } });

      await service.move('user-1', 'card-1', { stage: 'OFFER', position: 0 });

      // Two findMany calls: destination, then source.
      expect(tx.trackedJob.findMany).toHaveBeenCalledTimes(2);
      expect(tx.trackedJob.findMany.mock.calls[1][0].where).toMatchObject({ stage: 'SAVED' });
    });

    it('does not touch the source column when reordering within one stage', async () => {
      const { service, tx } = setup({ current: { stage: 'APPLIED' } });

      await service.move('user-1', 'card-1', { stage: 'APPLIED', position: 0 });

      expect(tx.trackedJob.findMany).toHaveBeenCalledTimes(1);
    });

    it('does the whole move in ONE transaction', async () => {
      // A half-applied move leaves a card in two columns or none.
      const { service, prisma } = setup();
      await service.move('user-1', 'card-1', { stage: 'INTERVIEW' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('allows moving BACKWARDS — this is the user’s own note, not a lifecycle', async () => {
      // The application chokepoint refuses OFFER -> SAVED. Here it is a correction.
      const { service, tx } = setup({ current: { stage: 'OFFER' } });

      await service.move('user-1', 'card-1', { stage: 'SAVED' });

      expect(tx.trackedJob.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ stage: 'SAVED' }) }),
      );
    });

    it('stamps appliedAt the FIRST time a card reaches APPLIED', async () => {
      const { service, tx } = setup({ current: { stage: 'SAVED', appliedAt: null } });

      await service.move('user-1', 'card-1', { stage: 'APPLIED' });

      const stageWrite = tx.trackedJob.update.mock.calls.find(
        (c) => c[0].data?.stage === 'APPLIED',
      );
      expect(stageWrite![0].data.appliedAt).toBeInstanceOf(Date);
    });

    it('does NOT overwrite appliedAt on a later move', async () => {
      // Dragging out and back must not rewrite the date they actually applied.
      const original = new Date('2026-07-01');
      const { service, tx } = setup({ current: { stage: 'INTERVIEW', appliedAt: original } });

      await service.move('user-1', 'card-1', { stage: 'APPLIED' });

      const stageWrite = tx.trackedJob.update.mock.calls.find(
        (c) => c[0].data?.stage === 'APPLIED',
      );
      expect(stageWrite![0].data).not.toHaveProperty('appliedAt');
    });

    it('refuses to move an archived card', async () => {
      const { service } = setup({ current: { archivedAt: new Date() } });
      await expect(
        service.move('user-1', 'card-1', { stage: 'APPLIED' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ownership', () => {
    it('404s on a card belonging to someone else', async () => {
      const { service, prisma } = setup();
      prisma.trackedJob.findFirst.mockResolvedValue(null);
      await expect(
        service.move('user-1', 'card-1', { stage: 'APPLIED' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('scopes the update to the caller in the WHERE clause', async () => {
      // Not fetch-then-check: another user's row must be unreachable, not merely refused.
      const { service, prisma } = setup();
      await service.update('user-1', 'card-1', { notes: 'hi' });
      expect(prisma.trackedJob.updateMany.mock.calls[0][0].where).toEqual({
        id: 'card-1',
        userId: 'user-1',
      });
    });

    it('scopes deletion to the caller too', async () => {
      const { service, prisma } = setup();
      await service.remove('user-1', 'card-1');
      expect(prisma.trackedJob.deleteMany.mock.calls[0][0].where).toEqual({
        id: 'card-1',
        userId: 'user-1',
      });
    });

    it('404s when deleting something that is not theirs', async () => {
      const { service, prisma } = setup();
      prisma.trackedJob.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.remove('user-1', 'card-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('editing', () => {
    it('only writes the fields actually sent', async () => {
      // An absent field must not blank a stored value.
      const { service, prisma } = setup();

      await service.update('user-1', 'card-1', { notes: 'Follow up Monday' });

      expect(prisma.trackedJob.updateMany.mock.calls[0][0].data).toEqual({
        notes: 'Follow up Monday',
      });
    });

    it('refuses a salary range that is inverted', async () => {
      const { service } = setup();
      await expect(
        service.update('user-1', 'card-1', { minSalary: 900, maxSalary: 400 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('archiving', () => {
    it('hides without deleting', async () => {
      const { service, prisma } = setup();
      await service.archive('user-1', 'card-1');
      expect(prisma.trackedJob.updateMany.mock.calls[0][0].data.archivedAt)
        .toBeInstanceOf(Date);
      expect(prisma.trackedJob.deleteMany).not.toHaveBeenCalled();
    });

    it('restores to the top of its column', async () => {
      const { service, prisma } = setup({ current: { archivedAt: new Date() } });
      await service.restore('user-1', 'card-1');
      expect(prisma.trackedJob.update.mock.calls[0][0].data.archivedAt).toBeNull();
    });

    it('refuses to restore a card that is not archived', async () => {
      const { service } = setup({ current: { archivedAt: null } });
      await expect(service.restore('user-1', 'card-1')).rejects.toThrow(BadRequestException);
    });
  });
});
