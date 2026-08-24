// src/modules/saved-job/infrastructure/repositories/saved-job.repository.ts
//
// Prisma-backed persistence for the SavedJob association. Hard-deletes (a bookmark
// is transient, not audited). Translates the FK/unique Prisma errors into HTTP-
// friendly domain errors so a bad jobId is a 400, not a 500.

import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, SavedJob as PrismaSavedJob } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { SavedJob } from '../../domain/entities/saved-job.entity';

@Injectable()
export class SavedJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * A user's bookmarks that still point at a live posting, most-recently-saved first.
   *
   * ORPHANS ARE EXCLUDED. This feeds `GET /sync/saved-jobs`, which pushes `jobId` to
   * every offline device — a row whose posting is gone has no id to push, and inventing
   * one (an empty string, say) would propagate a fabricated identifier to every client.
   * Use `findOrphanedByUser` to reach those rows.
   */
  async findByUser(userId: string): Promise<SavedJob[]> {
    const rows = await this.prisma.savedJob.findMany({
      where: { userId, jobId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.mapToDomain(r));
  }

  /**
   * Just the saved job ids, most-recently-saved first.
   *
   * ORPHANS ARE EXCLUDED, not returned as null. `jobId` is nullable since §16 — the row
   * survives the posting being deleted — and this endpoint's contract is a list of ids a
   * client can fetch. A null in that array would be a broken id, not a bookmark.
   *
   * The orphan is still in the table with its title/company snapshot, so the bookmark is
   * recoverable and can be surfaced later; it is simply not an *id*.
   */
  async findJobIdsByUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.savedJob.findMany({
      where: { userId, jobId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { jobId: true },
    });
    return rows.flatMap((r) => (r.jobId ? [r.jobId] : []));
  }

  async existsByUserAndJob(userId: string, jobId: string): Promise<boolean> {
    const row = await this.prisma.savedJob.findUnique({
      where: { userId_jobId: { userId, jobId } },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Idempotent: saving an already-saved job is a no-op, not an error.
   *
   * Copies the posting's title/company/url onto the bookmark, so it still means something
   * after the job row is gone (§16). The read is inside the same call rather than asked
   * of the caller, because every caller would otherwise have to remember — and the one
   * that forgets writes a bookmark that dies exactly the way this fix exists to prevent.
   */
  async add(userId: string, jobId: string): Promise<void> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { title: true, externalUrl: true, company: { select: { name: true } } },
    });
    // No job: fall through to create() and let the FK raise P2003, so an unknown id stays
    // a 400 with the existing message rather than becoming a new failure mode here.
    try {
      await this.prisma.savedJob.create({
        data: {
          userId,
          jobId,
          title: job?.title ?? null,
          companyName: job?.company?.name ?? null,
          url: job?.externalUrl ?? null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        // P2002 = unique violation → already saved, treat as success.
        if (error.code === 'P2002') return;
        // P2003 = FK violation → the job doesn't exist.
        if (error.code === 'P2003') {
          throw new BadRequestException('Job does not exist');
        }
      }
      throw error;
    }
  }

  async remove(userId: string, jobId: string): Promise<void> {
    await this.prisma.savedJob.deleteMany({ where: { userId, jobId } });
  }

  /**
   * A user's bookmarks including ORPHANS — rows whose posting has been deleted.
   *
   * Nothing surfaces these yet; `GET /saved-jobs` returns ids and an orphan has none.
   * This is the read that makes the snapshot useful, and it exists so the data is
   * reachable rather than merely retained.
   */
  async findOrphanedByUser(userId: string): Promise<
    { id: string; title: string | null; companyName: string | null; url: string | null; createdAt: Date }[]
  > {
    return this.prisma.savedJob.findMany({
      where: { userId, jobId: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, companyName: true, url: true, createdAt: true },
    });
  }

  /**
   * Only ever called with rows the query has already scoped to `jobId != null`.
   *
   * Throws rather than coercing a null to `''`. The domain entity promises a real job id
   * and an empty string would satisfy the type while lying to everything downstream —
   * exactly the kind of plausible-looking fabrication this codebase keeps out of columns.
   */
  private mapToDomain(raw: PrismaSavedJob): SavedJob {
    if (raw.jobId === null) {
      throw new Error(
        `SavedJob ${raw.id} has no jobId — orphaned bookmarks must be read through ` +
          `findOrphanedByUser, not mapped to the domain entity.`,
      );
    }
    return new SavedJob({
      id: raw.id,
      userId: raw.userId,
      jobId: raw.jobId,
      createdAt: raw.createdAt,
    });
  }
}
