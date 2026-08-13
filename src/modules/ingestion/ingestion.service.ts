// src/modules/ingestion/ingestion.service.ts
//
// Job-ingestion orchestrator (FR-JOBS-001, minimal slice). Pulls normalized jobs
// from a source, upserts their company, then dedups by (source, externalId):
// an existing posting is refreshed (+ lastSeenAt), a new one is inserted as a
// PUBLISHED, employer-less job. Returns a run summary.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { TheMuseSource } from './sources/themuse.source';
import { BongThomSource } from './sources/bongthom.source';
import { JobNetSource } from './sources/jobnet.source';
import {
  ImportedJob,
  IngestionResult,
  JobBoardSource,
  JobSource,
  NormalizedJob,
} from './ingestion.types';

/** Default ceiling for a run when the caller does not say. */
const DEFAULT_LIMIT = 50;

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  /** Every board we can pull from, keyed by its source token. */
  private readonly sources: Record<JobSource, JobBoardSource>;

  constructor(
    private readonly prisma: PrismaService,
    theMuse: TheMuseSource,
    bongThom: BongThomSource,
    jobNet: JobNetSource,
  ) {
    this.sources = {
      THEMUSE: theMuse,
      BONGTHOM: bongThom,
      JOBNET: jobNet,
    };
  }

  /**
   * Run one board's ingestion.
   *
   * One method for every source rather than one per source: the only thing that differed
   * between them was which adapter to call and which name to put in the log line.
   */
  async ingest(source: JobSource, limit = DEFAULT_LIMIT): Promise<IngestionResult> {
    const result: IngestionResult = {
      source,
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      ranAt: new Date().toISOString(),
    };

    let jobs: NormalizedJob[];
    try {
      jobs = await this.sources[source].fetchJobs(limit);
    } catch (err) {
      // FR-JOBS-001: ingestion failures must be logged (and alerted, later).
      const message = err instanceof Error ? err.message : 'Unknown fetch error';
      this.logger.error(`${source} ingestion fetch failed: ${message}`);
      result.errors.push(message);
      return result;
    }

    result.fetched = jobs.length;

    for (const job of jobs) {
      try {
        await this.persist(job, result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown persist error';
        this.logger.warn(`Skipped ${job.source}:${job.externalId} — ${message}`);
        result.errors.push(`${job.externalId}: ${message}`);
        result.skipped += 1;
      }
    }

    this.logger.log(
      `${source} ingestion done — fetched ${result.fetched}, created ${result.created}, ` +
        `updated ${result.updated}, skipped ${result.skipped}, errors ${result.errors.length}`,
    );
    return result;
  }

  /**
   * Run a TheMuse ingestion over `pages` pages.
   *
   * Kept because the existing route and its clients are expressed in PAGES, not a job
   * count. Delegates to {@link ingest} so there is still only one ingestion path.
   */
  async ingestFromTheMuse(pages: number): Promise<IngestionResult> {
    return this.ingest('THEMUSE', pages * 20);
  }

  /** Stored externally-ingested jobs (source != NULL), most-recently-seen first. */
  async listImported(limit = 100): Promise<ImportedJob[]> {
    const rows = await this.prisma.job.findMany({
      where: { source: { not: null } },
      include: { company: { select: { name: true } } },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      companyName: r.company?.name ?? 'Unknown',
      location: r.location,
      remoteType: r.remoteType,
      source: r.source as string,
      externalId: r.externalId as string,
      externalUrl: r.externalUrl,
      createdAt: r.createdAt.toISOString(),
      lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    }));
  }

  private async persist(job: NormalizedJob, result: IngestionResult): Promise<void> {
    // Data-quality guard (FR-JOBS-001): required fields.
    if (!job.title || !job.companyName) {
      result.skipped += 1;
      return;
    }

    // Upsert the company by its unique name so ingested jobs share one record.
    const company = await this.prisma.company.upsert({
      where: { name: job.companyName },
      create: { name: job.companyName },
      update: {},
      select: { id: true },
    });

    const now = new Date();

    /**
     * Only what the source actually stated.
     *
     * Spreading a conditional rather than writing `?? null` on purpose: a source that is
     * silent about salary must leave the column ALONE, not overwrite a value some other
     * run or an employer put there. Same rule as employmentType/experienceLevel — a
     * fabricated value is indistinguishable from a real one once it is in the column.
     */
    const stated = {
      ...(job.minSalary != null && { minSalary: job.minSalary }),
      ...(job.maxSalary != null && { maxSalary: job.maxSalary }),
      ...(job.employmentType != null && { employmentType: job.employmentType }),
    };

    // Dedup on (source, externalId): refresh if seen before, else insert.
    const existing = await this.prisma.job.findFirst({
      where: { source: job.source, externalId: job.externalId },
      select: { id: true },
    });

    if (existing) {
      await this.prisma.job.update({
        where: { id: existing.id },
        data: {
          title: job.title,
          description: job.description,
          location: job.location,
          remoteType: job.remoteType,
          externalUrl: job.externalUrl,
          companyId: company.id,
          lastSeenAt: now,
          ...stated,
        },
      });
      result.updated += 1;
    } else {
      await this.prisma.job.create({
        data: {
          title: job.title,
          description: job.description,
          location: job.location,
          remoteType: job.remoteType,
          status: 'PUBLISHED',
          companyId: company.id,
          source: job.source,
          externalId: job.externalId,
          externalUrl: job.externalUrl,
          // Ingested postings are applied to on the source site, never here. The server
          // refuses in-app applications to EXTERNAL jobs and sends the user onward.
          sourceType: 'EXTERNAL',
          lastSeenAt: now,
          ...stated,
        },
      });
      result.created += 1;
    }
  }
}
