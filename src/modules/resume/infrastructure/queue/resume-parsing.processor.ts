// src/modules/resume/infrastructure/queue/resume-parsing.processor.ts
//
// BullMQ worker for the 'resume-parsing' queue. Delegates to ResumeParserService, which
// records SUCCESS/FAILED itself, so this handler stays thin. (Reconciled from the docs'
// @nestjs/bull @Processor/@Process to @nestjs/bullmq's WorkerHost.process, keyed by job name.)
//
// WHY THE EVENT HANDLERS BELOW EXIST (Redis audit R5). Because the parser records its own
// FAILED status and resolves, a job reaching 'failed' here is NOT a bad résumé — it is the
// worker itself coming apart: the parser threw where it was supposed to catch, the process
// died mid-job, the job stalled, Redis went away between steps. Those used to be entirely
// silent. The résumé sat at PENDING with nothing anywhere saying why.

import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ResumeParserService } from '../../application/services/resume-parser.service';

interface ParseResumeJobData {
  resumeId: string;
  fileUrl: string;
  fileType: string;
}

@Processor('resume-parsing')
export class ResumeParsingProcessor extends WorkerHost {
  private readonly logger = new Logger(ResumeParsingProcessor.name);

  constructor(private readonly parser: ResumeParserService) {
    super();
  }

  async process(job: Job<ParseResumeJobData>): Promise<void> {
    if (job.name !== 'parseResume') {
      this.logger.warn(`Ignoring unknown job "${job.name}"`);
      return;
    }
    const { resumeId, fileUrl, fileType } = job.data;
    await this.parser.parseResume(resumeId, fileUrl, fileType);
  }

  /**
   * A job failed at the worker level. Logged loudly, and the message says whether a retry
   * is still coming — "failed" that will be retried and "failed" that is final are very
   * different things to read at 2am, and BullMQ emits this event for both.
   */
  @OnWorkerEvent('failed')
  onFailed(job: Job<ParseResumeJobData> | undefined, err: Error): void {
    const attempts = job?.opts?.attempts ?? 1;
    const made = job?.attemptsMade ?? 0;
    const exhausted = made >= attempts;
    const resumeId = job?.data?.resumeId ?? 'unknown';

    this.logger.error(
      `resume-parsing job ${job?.id ?? '?'} (resume ${resumeId}) failed on attempt ` +
        `${made}/${attempts}${exhausted ? ' — GIVING UP' : ', will retry'}: ${err.message}`,
      err.stack,
    );

    if (exhausted) {
      // The parser normally owns the résumé's outcome, so reaching here means it never
      // got the chance. Whatever status the row is in, it is not going to change on its
      // own — say so rather than leaving PENDING to look like work in progress.
      this.logger.error(
        `Résumé ${resumeId} will stay in its current parsing status: no attempts remain.`,
      );
    }
  }

  /**
   * Worker-level errors that are not attached to a job at all — a lost Redis connection,
   * a stalled-check failure. Warn rather than error: these are usually transient and the
   * worker recovers on its own, but a stream of them is the signal that it is not.
   */
  @OnWorkerEvent('error')
  onError(err: Error): void {
    this.logger.warn(`resume-parsing worker error: ${err.message}`);
  }
}
