// src/infra/queue/job-options.spec.ts
//
// Redis audit R5: the queue was registered with no `defaultJobOptions`, so BullMQ's own
// defaults applied — one attempt, and every job ever processed retained in Redis forever.
//
// These tests are about the SHAPE of the policy rather than the exact numbers. The
// numbers are a judgement call and may be tuned; "there is a retry", "there is a backoff"
// and "both retention bounds are set" are the properties that must not silently revert.

import { DEFAULT_JOB_OPTIONS } from './job-options';

describe('DEFAULT_JOB_OPTIONS', () => {
  describe('retry', () => {
    it('retries a job rather than losing it on the first stumble', () => {
      expect(DEFAULT_JOB_OPTIONS.attempts).toBeGreaterThan(1);
    });

    it('does not retry so many times that a job looks like work in progress', () => {
      // At an exponential backoff from 2s, more than a handful of attempts leaves a
      // doomed job sitting in the queue for minutes.
      expect(DEFAULT_JOB_OPTIONS.attempts).toBeLessThanOrEqual(5);
    });

    it('backs off between attempts instead of retrying straight into the same blip', () => {
      expect(DEFAULT_JOB_OPTIONS.backoff).toEqual(
        expect.objectContaining({ type: 'exponential' }),
      );
      const backoff = DEFAULT_JOB_OPTIONS.backoff as {
        type: string;
        delay: number;
      };
      expect(backoff.delay).toBeGreaterThanOrEqual(1000);
    });
  });

  describe('retention', () => {
    // The finding that costs money quietly: completed job hashes accumulating in a Redis
    // with no memory policy, until it starts evicting whatever else lives there.
    it('bounds completed jobs by BOTH age and count', () => {
      const onComplete = DEFAULT_JOB_OPTIONS.removeOnComplete as {
        age: number;
        count: number;
      };
      // count alone lets a quiet week hold stale jobs; age alone lets a busy hour hold
      // thousands. Both, or the bound has a hole in it.
      expect(onComplete.age).toBeGreaterThan(0);
      expect(onComplete.count).toBeGreaterThan(0);
    });

    it('bounds failed jobs too, so a crash-looping worker cannot fill Redis', () => {
      const onFail = DEFAULT_JOB_OPTIONS.removeOnFail as {
        age: number;
        count: number;
      };
      expect(onFail.age).toBeGreaterThan(0);
      expect(onFail.count).toBeGreaterThan(0);
    });

    it('keeps failures longer than completions — they are the only evidence', () => {
      const onComplete = DEFAULT_JOB_OPTIONS.removeOnComplete as { age: number };
      const onFail = DEFAULT_JOB_OPTIONS.removeOnFail as { age: number };
      expect(onFail.age).toBeGreaterThan(onComplete.age);
    });

    it('keeps completions long enough to answer "did my upload go through"', () => {
      const onComplete = DEFAULT_JOB_OPTIONS.removeOnComplete as { age: number };
      expect(onComplete.age).toBeGreaterThanOrEqual(60 * 60);
    });
  });
});
