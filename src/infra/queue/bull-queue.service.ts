// src/infra/queue/bull-queue.service.ts
//
// Thin wrapper over BullMQ queues (reconciled from the docs' @nestjs/bull → @nestjs/bullmq,
// per redis.config.ts which reserves the BullMQ queue names). Currently backs the
// 'resume-parsing' queue; add more injected queues here as other async work lands.

import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';

@Injectable()
export class BullQueueService {
  constructor(
    @InjectQueue('resume-parsing') private readonly resumeParsingQueue: Queue,
  ) {}

  /** Enqueue a job onto the named queue. */
  async addJob(
    queueName: string,
    jobName: string,
    data: unknown,
  ): Promise<Job> {
    return this.queueFor(queueName).add(jobName, data);
  }

  async getJob(jobId: string): Promise<Job | undefined> {
    return this.resumeParsingQueue.getJob(jobId);
  }

  async removeJob(jobId: string): Promise<void> {
    const job = await this.resumeParsingQueue.getJob(jobId);
    if (job) await job.remove();
  }

  private queueFor(name: string): Queue {
    if (name === this.resumeParsingQueue.name) return this.resumeParsingQueue;
    throw new Error(`Unknown queue: ${name}`);
  }
}
