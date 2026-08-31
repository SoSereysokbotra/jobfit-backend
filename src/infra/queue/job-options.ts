// src/infra/queue/job-options.ts
//
// Default BullMQ job options, in one place so every queue registered from now on
// inherits them (Redis audit R5).
//
// WHAT WAS WRONG. `registerQueue({ name: 'resume-parsing' })` set no `defaultJobOptions`
// and `addJob` passed none, so BullMQ's own defaults applied:
//
//   attempts          1     a job that died mid-flight was simply gone
//   backoff           n/a   nothing to back off
//   removeOnComplete  false EVERY job ever processed stayed in Redis
//   removeOnFail      false so did every failure
//
// The retention half is the one that bites without anyone noticing: completed job hashes
// accumulate in Redis forever, in a Redis with no memory policy set. Nothing warns; the
// instance simply gets fuller until it starts evicting, and what it evicts is whatever
// else lives there.
//
// A NOTE ON WHY RETRIES ARE MOSTLY DORMANT HERE. `ResumeParserService` catches its own
// errors and records `parsingStatus: FAILED` on the row, so a parse that fails for a
// domain reason (unreadable PDF, unsupported layout) RESOLVES the job successfully.
// That is the right call — the domain owns that outcome, and retrying an unreadable file
// three times just burns CPU to reach the same answer.
//
// So `attempts` covers the other kind of failure: the worker process dies mid-job, the
// job stalls, Redis blips between steps. Those are transient and worth retrying, and
// they are exactly the ones that used to vanish silently. Re-running `parseResume` for a
// résumé id overwrites the parsed rows for that résumé, so a retry is safe.

import type { DefaultJobOptions } from 'bullmq';

const SECONDS = 1;
const MINUTES = 60 * SECONDS;
const HOURS = 60 * MINUTES;
const DAYS = 24 * HOURS;

export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  /**
   * Three tries total. Enough to ride out a worker restart or a Redis blip; few enough
   * that a job failing for a real reason reaches its final state in about ten seconds
   * rather than sitting in the queue looking like work in progress.
   */
  attempts: 3,

  /**
   * Exponential from 2s: retries at ~2s and ~4s. The failures this covers are transient
   * infrastructure ones, so the point of backing off is to not retry INTO the same blip;
   * beyond a few seconds the extra waiting buys nothing.
   */
  backoff: { type: 'exponential', delay: 2 * 1000 },

  /**
   * Keep the last 100 completions, and nothing older than a day. Completed jobs are only
   * useful for "did that upload actually go through an hour ago" — after that the résumé
   * row itself is the record, and it is in Postgres.
   *
   * Both bounds together on purpose: `count` alone lets a quiet week hold stale jobs,
   * `age` alone lets a busy hour hold thousands.
   */
  removeOnComplete: { age: 24 * HOURS, count: 100 },

  /**
   * Failures are kept longer and in greater number — a week, up to 500. They are the
   * only in-Redis evidence of what went wrong, and they are what someone reads on the
   * Monday after a Friday-night incident. Still bounded: a crash-looping worker must not
   * be able to fill Redis with its own failures.
   */
  removeOnFail: { age: 7 * DAYS, count: 500 },
};
