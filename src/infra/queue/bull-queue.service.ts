// src/infra/queue/bull-queue.service.ts
//
// Thin wrapper over BullMQ queues (reconciled from the docs' @nestjs/bull → @nestjs/bullmq,
// per redis.config.ts which reserves the BullMQ queue names). Currently backs the
// 'resume-parsing' queue; add more injected queues here as other async work lands.
//
// ── EVERY CALL IS TIME-BOUNDED, AND THAT IS THE POINT ────────────────────────
//
// BullMQ's Redis connection (resume.module.ts) is a DIFFERENT ioredis client from
// RedisService's, with the opposite configuration:
//
//                       RedisService          BullMQ
//   enableOfflineQueue  false (fail fast)     true  (ioredis default)
//   retryStrategy       gives up after 10     unset (retries forever)
//
// So with Redis down, BullMQ does not reject a command — it QUEUES it and waits for a
// reconnection that is still being attempted. `add()` then never settles. That is why
// `POST /resumes` hung until the HTTP client gave up: no error, no status, no log the
// user could act on. Measured: the request simply never returned.
//
// Fixing it on the connection (enableOfflineQueue: false) is tempting but wrong here —
// that connection is shared with the Worker, and BullMQ needs blocking behaviour there.
// Bounding it at the call site fixes the producer without touching the consumer.
//
// A rejection is strictly better than a hang: the caller can record the failure, tell the
// user something true, and leave recoverable state. See ResumeService.uploadResume.

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';

/**
 * How long a queue operation may take before we call it unavailable.
 *
 * Enqueuing is a single Redis write. If it has not landed in five seconds, Redis is not
 * merely slow — it is unreachable and BullMQ is buffering. Short enough that a user
 * waiting on an upload gets an answer, long enough to absorb an ordinary network blip.
 */
const QUEUE_OP_TIMEOUT_MS = 5000;

/**
 * Bound on the readiness probe (Redis audit R9), shorter than an operation's.
 *
 * A probe that can take five seconds is itself a problem — Cloud Run's readiness check
 * would sit on it. 1s matches what RedisHealthIndicator already uses for its own PING,
 * so the two halves of the queue answer on the same clock.
 */
const QUEUE_HEALTH_TIMEOUT_MS = 1000;

/**
 * The queue could not be reached in time.
 *
 * A distinct type so callers can tell "the background job was never scheduled" from a
 * genuine domain error, and react by recording honest state rather than retrying.
 */
export class QueueUnavailableError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(
      `Queue unavailable: ${operation} did not complete within ${timeoutMs}ms. ` +
        'Redis is likely unreachable.',
    );
    this.name = 'QueueUnavailableError';
  }
}

@Injectable()
export class BullQueueService {
  private readonly logger = new Logger(BullQueueService.name);

  constructor(
    @InjectQueue('resume-parsing') private readonly resumeParsingQueue: Queue,
  ) {}

  /**
   * Can BullMQ actually reach Redis right now?
   *
   * This exists because `/health/ready` used to answer that question by pinging
   * RedisService — a DIFFERENT ioredis client, with different connection state and the
   * opposite offline-queue configuration. It could therefore report the queue healthy
   * while uploads hung (Redis audit R9). This pings BullMQ's own client.
   *
   * `waitUntilReady()` is the check rather than a PING: it resolves exactly when BullMQ's
   * connection is usable, which is the question being asked, and `status` confirms the
   * client did not settle into some other state. It is also the same call BullMQ makes
   * internally before an operation, so this probes the real precondition for `add()`.
   *
   * Bounded, for the same reason as everything else here: with `enableOfflineQueue` at
   * BullMQ's default, waiting on a down connection does not reject — it waits, forever.
   * An unbounded health check against a down Redis would hang the readiness probe,
   * trading a wrong answer for no answer.
   *
   * Returns a boolean rather than throwing: a probe reports, it does not fail.
   */
  async isReachable(): Promise<boolean> {
    try {
      const client = await this.raceWithTimeout(
        this.resumeParsingQueue.waitUntilReady(),
        'healthCheck',
        QUEUE_HEALTH_TIMEOUT_MS,
      );
      return client.status === 'ready';
    } catch {
      // Deliberately quiet: this runs on every readiness probe, and during an outage the
      // degraded readiness payload is the report. Logging here would be the flood.
      return false;
    }
  }

  /** Enqueue a job onto the named queue. Throws {@link QueueUnavailableError} on timeout. */
  async addJob(queueName: string, jobName: string, data: unknown): Promise<Job> {
    return this.bounded(
      `addJob(${queueName}/${jobName})`,
      this.queueFor(queueName).add(jobName, data),
    );
  }

  async getJob(jobId: string): Promise<Job | undefined> {
    return this.bounded(`getJob(${jobId})`, this.resumeParsingQueue.getJob(jobId));
  }

  async removeJob(jobId: string): Promise<void> {
    const job = await this.getJob(jobId);
    if (job) await this.bounded(`removeJob(${jobId})`, job.remove());
  }

  /**
   * Reject rather than hang.
   *
   * Applied to every operation, not just `addJob`: they share one connection, so they
   * share the failure mode. Only `addJob` is reachable from a request today — bounding
   * the others now means the next caller inherits the fix instead of the bug.
   *
   * The underlying promise is deliberately NOT cancelled — BullMQ has no cancellation,
   * and if the write does eventually land that is harmless. We stop waiting; we do not
   * pretend the write was undone.
   */
  private async bounded<T>(operation: string, work: Promise<T>): Promise<T> {
    try {
      return await this.raceWithTimeout(work, operation, QUEUE_OP_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof QueueUnavailableError) {
        this.logger.error(
          `${err.message} Background work was NOT scheduled — the caller must record that.`,
        );
      }
      throw err;
    }
  }

  /**
   * The race itself, without the logging — shared with the health probe, which must stay
   * quiet. The timer and late-rejection handling below are the subtle part and exist in
   * exactly one place on purpose.
   */
  private async raceWithTimeout<T>(
    work: Promise<T>,
    operation: string,
    timeoutMs: number,
  ): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new QueueUnavailableError(operation, timeoutMs)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      // Always clear: an un-cleared timer keeps the event loop alive for its full
      // duration on every successful call.
      if (timer) clearTimeout(timer);
      // Swallow a late rejection from the losing promise so it cannot surface as an
      // unhandled rejection after we have already returned or thrown.
      void work.catch(() => undefined);
    }
  }

  private queueFor(name: string): Queue {
    if (name === this.resumeParsingQueue.name) return this.resumeParsingQueue;
    throw new Error(`Unknown queue: ${name}`);
  }
}
