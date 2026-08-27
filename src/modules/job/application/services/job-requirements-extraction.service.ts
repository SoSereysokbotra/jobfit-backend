// src/modules/job/application/services/job-requirements-extraction.service.ts
//
// Fills `Job.extractedRequirements` from the posting's free text via the AI service.
//
// 43 of 52 jobs are ingested and carry no employer-authored `requirements`, so the skill-gap
// feature had nothing to compare a résumé against. This is the one place in that feature
// where an LLM genuinely earns its keep: reading requirements OUT of prose. Comparing them
// to CV skills afterwards is deterministic string work and stays model-free.
//
// Results are cached on the row — extraction takes several seconds per job, far too slow to
// sit in a request path.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { AiClient } from '@infra/ai/ai.client';
import { AiServiceError } from '@infra/ai/ai.errors';
import { logAiFallback } from '@infra/ai/ai-degradation.logger';

/** Descriptions are truncated before extraction — the tail of a posting is boilerplate. */
const MAX_DESCRIPTION_CHARS = 4000;

export interface ExtractionOutcome {
  jobId: string;
  requirements: string[];
  groundedness: number;
  droppedUngrounded: number;
  skipped?: 'ALREADY_HAS_REQUIREMENTS' | 'NO_DESCRIPTION' | 'AI_UNAVAILABLE';
}

@Injectable()
export class JobRequirementsExtractionService {
  private readonly logger = new Logger(JobRequirementsExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AiClient,
  ) {}

  /**
   * Extract and cache requirements for one job.
   *
   * Skips jobs that already carry employer-authored `requirements`: a human-written list is
   * authoritative and must never be replaced by a model-derived one.
   */
  async extractForJob(jobId: string): Promise<ExtractionOutcome> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, title: true, description: true, requirements: true },
    });

    const empty = { jobId, requirements: [], groundedness: 0, droppedUngrounded: 0 };
    if (!job) return { ...empty, skipped: 'NO_DESCRIPTION' };
    if (job.requirements.length > 0) {
      return { ...empty, skipped: 'ALREADY_HAS_REQUIREMENTS' };
    }
    if (!job.description?.trim()) return { ...empty, skipped: 'NO_DESCRIPTION' };

    try {
      const result = await this.aiClient.extractJobRequirements({
        jobTitle: job.title,
        jobDescription: job.description.slice(0, MAX_DESCRIPTION_CHARS),
      });

      await this.prisma.job.update({
        where: { id: job.id },
        data: {
          extractedRequirements: result.requirements,
          requirementsExtractedAt: new Date(),
          requirementsGroundedness: result.groundedness,
        },
      });

      if (result.droppedUngrounded > 0) {
        this.logger.warn(
          `Job ${job.id}: dropped ${result.droppedUngrounded} ungrounded requirement(s)`,
        );
      }
      return {
        jobId: job.id,
        requirements: result.requirements,
        groundedness: result.groundedness,
        droppedUngrounded: result.droppedUngrounded,
      };
    } catch (err) {
      // An AI outage must not fail whatever triggered this. The job simply keeps no
      // extracted requirements, and skill-gap reports JOB_HAS_NO_REQUIREMENTS — which is
      // honest, where writing a partial list would not be.
      if (err instanceof AiServiceError) {
        logAiFallback(
          this.logger,
          err,
          `Requirement extraction for job ${job.id}`,
          'the job keeps no extracted requirements',
        );
        return { ...empty, skipped: 'AI_UNAVAILABLE' };
      }
      throw err;
    }
  }

  /**
   * Jobs that could benefit from extraction: published, described, with neither an
   * employer-authored nor a previously extracted list.
   */
  async findPendingJobIds(limit = 100): Promise<string[]> {
    const rows = await this.prisma.job.findMany({
      where: {
        status: 'PUBLISHED',
        requirements: { isEmpty: true },
        requirementsExtractedAt: null,
      },
      select: { id: true },
      take: limit,
    });
    return rows.map((r) => r.id);
  }
}
