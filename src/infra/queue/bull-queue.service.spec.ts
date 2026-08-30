// src/infra/queue/bull-queue.service.spec.ts
//
// R2 from the Redis audit: `POST /resumes` hung indefinitely with Redis down.
//
// BullMQ's connection has `enableOfflineQueue` at its ioredis default (true) and no
// retryStrategy, so `add()` does not reject when Redis is unreachable — it buffers the
// command and waits for a reconnection that is still being attempted. The request never
// returned; the HTTP client gave up first.
//
// These pin that every queue operation now REJECTS instead of hanging.

import { Logger } from '@nestjs/common';
import { BullQueueService, QueueUnavailableError } from './bull-queue.service';

/** A promise that never settles — exactly what BullMQ does with Redis down. */
const neverSettles = <T>() => new Promise<T>(() => undefined);

describe('BullQueueService', () => {
  let queue: { name: string; add: jest.Mock; getJob: jest.Mock };
  let service: BullQueueService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    queue = {
      name: 'resume-parsing',
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getJob: jest.fn().mockResolvedValue(undefined),
    };
    service = new BullQueueService(queue as never);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  /** Run a bounded call to its timeout without waiting in real time. */
  const raceToTimeout = async (call: Promise<unknown>) => {
    const assertion = expect(call).rejects.toBeInstanceOf(QueueUnavailableError);
    await jest.advanceTimersByTimeAsync(5000);
    return assertion;
  };

  describe('when Redis is unreachable', () => {
    it('rejects addJob instead of hanging forever', async () => {
      queue.add.mockReturnValue(neverSettles());

      await raceToTimeout(service.addJob('resume-parsing', 'parseResume', {}));
    });

    it('says the work was not scheduled, so the caller can record that', async () => {
      queue.add.mockReturnValue(neverSettles());

      const call = service.addJob('resume-parsing', 'parseResume', {});
      const assertion = expect(call).rejects.toThrow(/Redis is likely unreachable/);
      await jest.advanceTimersByTimeAsync(5000);
      await assertion;
    });

    it('bounds getJob too — it shares the same connection', async () => {
      queue.getJob.mockReturnValue(neverSettles());

      // Only addJob is reachable from a request today. Bounding the rest means the next
      // caller inherits the fix rather than the bug.
      await raceToTimeout(service.getJob('job-1'));
    });

    it('bounds removeJob', async () => {
      queue.getJob.mockReturnValue(neverSettles());

      await raceToTimeout(service.removeJob('job-1'));
    });
  });

  describe('when Redis is healthy', () => {
    it('returns the job and does not wait for the timeout', async () => {
      const job = await service.addJob('resume-parsing', 'parseResume', { a: 1 });

      expect(job).toEqual({ id: 'job-1' });
      expect(queue.add).toHaveBeenCalledWith('parseResume', { a: 1 });
    });

    it('leaves no pending timer holding the event loop open', async () => {
      await service.addJob('resume-parsing', 'parseResume', {});

      // An un-cleared timer would keep the process alive for its full duration on every
      // successful call — invisible in tests that do not check, and a shutdown hang in
      // production.
      expect(jest.getTimerCount()).toBe(0);
    });

    it('propagates a real queue error unchanged', async () => {
      queue.add.mockRejectedValue(new Error('job data too large'));

      // A genuine failure must not be disguised as unavailability.
      await expect(
        service.addJob('resume-parsing', 'parseResume', {}),
      ).rejects.toThrow('job data too large');
    });

    it('still rejects an unknown queue name', async () => {
      await expect(service.addJob('nope', 'x', {})).rejects.toThrow(/Unknown queue/);
    });
  });
});
