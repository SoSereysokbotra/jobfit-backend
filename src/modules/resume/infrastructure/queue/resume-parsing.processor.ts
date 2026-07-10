// src/modules/resume/infrastructure/queue/resume-parsing.processor.ts
//
// BullMQ worker for the 'resume-parsing' queue. Delegates to ResumeParserService, which
// records SUCCESS/FAILED itself, so this handler stays thin. (Reconciled from the docs'
// @nestjs/bull @Processor/@Process to @nestjs/bullmq's WorkerHost.process, keyed by job name.)

import { Processor, WorkerHost } from '@nestjs/bullmq';
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
}
