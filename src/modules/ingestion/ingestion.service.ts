// src/modules/ingestion/ingestion.service.ts
//
// Job-ingestion orchestrator (FR-JOBS-001, minimal slice). Pulls normalized jobs
// from a source, upserts their company, then dedups by (source, externalId):
// an existing posting is refreshed (+ lastSeenAt), a new one is inserted as a
// PUBLISHED, employer-less job. Returns a run summary.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { TheMuseSource } from './sources/themuse.source';
import { ImportedJob, IngestionResult, NormalizedJob } from './ingestion.types';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly theMuse: TheMuseSource,
  ) {}

  /** Run a TheMuse ingestion over `pages` pages. */
  async ingestFromTheMuse(pages: number): Promise<IngestionResult> {
    const result: IngestionResult = {
      source: 'THEMUSE',
      fetched: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      ranAt: new Date().toISOString(),
    };

    let jobs: NormalizedJob[];
    try {
      jobs = await this.theMuse.fetch(pages);
    } catch (err) {
      // FR-JOBS-001: ingestion failures must be logged (and alerted, later).
      const message = err instanceof Error ? err.message : 'Unknown fetch error';
      this.logger.error(`TheMuse ingestion fetch failed: ${message}`);
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
      `TheMuse ingestion done — fetched ${result.fetched}, created ${result.created}, ` +
        `updated ${result.updated}, skipped ${result.skipped}, errors ${result.errors.length}`,
    );
    return result;
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
          lastSeenAt: now,
        },
      });
      result.created += 1;
    }
  }
}
