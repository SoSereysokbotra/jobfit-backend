// src/modules/saved-job/infrastructure/repositories/saved-external-job.repository.ts
//
// Persistence for jobs saved from the browser extension — postings on sites we don't
// ingest, so there is no `Job` row to point at. See the SavedExternalJob model for why
// this is a separate table rather than a nullable `jobId` on SavedJob.

import { Injectable } from '@nestjs/common';
import { SavedExternalJob } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

export interface SaveExternalJobInput {
  userId: string;
  source: string;
  externalId: string;
  title: string;
  company: string | null;
  description: string | null;
  url: string | null;
  salary: string | null;
  notes: string | null;
}

@Injectable()
export class SavedExternalJobRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Save, or update what was already saved for this posting.
   *
   * An upsert rather than an insert because "save" is a button the user can press twice —
   * on a re-save they are correcting the salary or the notes they typed, not asking for a
   * second copy of the same job in their list.
   */
  async save(input: SaveExternalJobInput): Promise<SavedExternalJob> {
    const fields = {
      title: input.title,
      company: input.company,
      description: input.description,
      url: input.url,
      salary: input.salary,
      notes: input.notes,
    };
    return this.prisma.savedExternalJob.upsert({
      where: {
        userId_source_externalId: {
          userId: input.userId,
          source: input.source,
          externalId: input.externalId,
        },
      },
      update: fields,
      create: {
        userId: input.userId,
        source: input.source,
        externalId: input.externalId,
        ...fields,
      },
    });
  }

  /** This user's saved postings, newest first. */
  findByUser(userId: string): Promise<SavedExternalJob[]> {
    return this.prisma.savedExternalJob.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** One posting, if this user has it saved — used to prefill the extension's form. */
  findOne(
    userId: string,
    source: string,
    externalId: string,
  ): Promise<SavedExternalJob | null> {
    return this.prisma.savedExternalJob.findUnique({
      where: { userId_source_externalId: { userId, source, externalId } },
    });
  }

  /**
   * Delete by id, scoped to the owner.
   *
   * `deleteMany` with the userId in the WHERE, not `delete` by id: a delete-by-id would
   * remove another user's row if an id were guessed, and would throw on a miss. This
   * removes only the caller's, and reports whether anything went.
   */
  async remove(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.savedExternalJob.deleteMany({
      where: { id, userId },
    });
    return count > 0;
  }
}
