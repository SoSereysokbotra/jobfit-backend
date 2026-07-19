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

  /** A user's bookmarks, most-recently-saved first. */
  async findByUser(userId: string): Promise<SavedJob[]> {
    const rows = await this.prisma.savedJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.mapToDomain(r));
  }

  /** Just the saved job ids, most-recently-saved first. */
  async findJobIdsByUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.savedJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { jobId: true },
    });
    return rows.map((r) => r.jobId);
  }

  async existsByUserAndJob(userId: string, jobId: string): Promise<boolean> {
    const row = await this.prisma.savedJob.findUnique({
      where: { userId_jobId: { userId, jobId } },
      select: { id: true },
    });
    return row !== null;
  }

  /** Idempotent: saving an already-saved job is a no-op, not an error. */
  async add(userId: string, jobId: string): Promise<void> {
    try {
      await this.prisma.savedJob.create({ data: { userId, jobId } });
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

  private mapToDomain(raw: PrismaSavedJob): SavedJob {
    return new SavedJob({
      id: raw.id,
      userId: raw.userId,
      jobId: raw.jobId,
      createdAt: raw.createdAt,
    });
  }
}
