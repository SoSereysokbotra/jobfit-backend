// src/modules/job-tracker/job-tracker.service.ts
//
// The Job Tracker board: jobs the user is following themselves.
//
// This is NOT the application pipeline. `Application` records what an employer decided and
// the transition chokepoint refuses a candidate asserting INTERVIEW/OFFER/REJECTED. Here
// the user owns the stage outright — dragging a card is the whole feature, and a card can
// go from any stage to any other, including backwards, because the user is correcting
// their own notes about their own job hunt.
//
// Every method is scoped to the caller in the WHERE clause rather than fetch-then-check, so
// another user's id cannot be read or written even for an instant.

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { $Enums, Prisma, TrackedJob } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import {
  CreateTrackedJobDto,
  MoveTrackedJobDto,
  TRACKED_STAGES,
  TrackedBoardDto,
  TrackedJobResponseDto,
  UpdateTrackedJobDto,
} from './dtos/tracked-job.dtos';

@Injectable()
export class JobTrackerService {
  constructor(private readonly prisma: PrismaService) {}

  /** The board, grouped by stage, archived cards excluded. */
  async board(userId: string): Promise<TrackedBoardDto> {
    const rows = await this.prisma.trackedJob.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ stage: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
    });

    // Every stage present, even when empty — the client renders columns from this and
    // should not have to carry its own copy of the vocabulary.
    const columns = Object.fromEntries(
      TRACKED_STAGES.map((s) => [s, [] as TrackedJobResponseDto[]]),
    ) as Record<$Enums.TrackedJobStage, TrackedJobResponseDto[]>;

    for (const row of rows) columns[row.stage].push(new TrackedJobResponseDto(row));
    return { columns, total: rows.length };
  }

  /** Archived cards, most recently archived first. */
  async archived(userId: string): Promise<TrackedJobResponseDto[]> {
    const rows = await this.prisma.trackedJob.findMany({
      where: { userId, archivedAt: { not: null } },
      orderBy: { archivedAt: 'desc' },
    });
    return rows.map((r) => new TrackedJobResponseDto(r));
  }

  /**
   * Add a card.
   *
   * When `jobId` is given the title/company/url are copied FROM that posting rather than
   * taken from the request: the caller should not be able to file one of our own postings
   * under the wrong name. When it is not, the request is all we have and is used as-is.
   */
  async add(userId: string, dto: CreateTrackedJobDto): Promise<TrackedJobResponseDto> {
    const snapshot = dto.jobId
      ? await this.snapshotFromJob(dto.jobId, dto)
      : {
          title: (dto.title ?? '').trim(),
          companyName: (dto.companyName ?? '').trim(),
          url: dto.url ?? null,
          location: dto.location ?? null,
        };

    if (!snapshot.title || !snapshot.companyName) {
      throw new BadRequestException(
        'A tracked job needs a title and a company — send `jobId`, or both fields.',
      );
    }

    const stage = dto.stage ?? 'SAVED';
    try {
      const row = await this.prisma.trackedJob.create({
        data: {
          userId,
          jobId: dto.jobId ?? null,
          ...snapshot,
          stage,
          // New cards go to the top of their column: the thing you just added is the thing
          // you are thinking about.
          position: await this.topPosition(userId, stage),
          // Adding a job straight into APPLIED means it was applied to; record when,
          // because the board is a record of a hunt and the date is the useful part.
          appliedAt: stage === 'APPLIED' ? new Date() : null,
        },
      });
      return new TrackedJobResponseDto(row);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('That job is already on your tracker.');
      }
      throw err;
    }
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTrackedJobDto,
  ): Promise<TrackedJobResponseDto> {
    // Only the keys actually sent — an absent field must not blank a stored value.
    const data: Prisma.TrackedJobUpdateInput = {
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.companyName !== undefined && { companyName: dto.companyName.trim() }),
      ...(dto.url !== undefined && { url: dto.url }),
      ...(dto.location !== undefined && { location: dto.location }),
      ...(dto.minSalary !== undefined && { minSalary: dto.minSalary }),
      ...(dto.maxSalary !== undefined && { maxSalary: dto.maxSalary }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
    };
    if (
      dto.minSalary !== undefined &&
      dto.maxSalary !== undefined &&
      dto.minSalary > dto.maxSalary
    ) {
      throw new BadRequestException('Minimum salary cannot exceed the maximum.');
    }

    const { count } = await this.prisma.trackedJob.updateMany({
      where: { id, userId },
      data,
    });
    if (count === 0) throw new NotFoundException('Tracked job not found');
    return new TrackedJobResponseDto(await this.owned(userId, id));
  }

  /**
   * One drag: move a card to `stage` at `position`.
   *
   * WHY THE WHOLE COLUMN IS REWRITTEN. Positions have to stay dense and unique per column
   * or the board's order becomes arbitrary the first time two cards collide. Doing it by
   * shifting neighbours needs several conditional updates and still races; re-numbering
   * the affected columns from the final ordering is one clear write per card and lands the
   * board in exactly the state the user just dragged.
   *
   * All of it in ONE transaction: a half-applied move leaves a card in two columns or
   * none, which the user sees as their board eating a job.
   */
  async move(
    userId: string,
    id: string,
    dto: MoveTrackedJobDto,
  ): Promise<TrackedJobResponseDto> {
    const card = await this.owned(userId, id);
    if (card.archivedAt) {
      throw new BadRequestException(
        'This card is archived. Restore it before moving it on the board.',
      );
    }
    const from = card.stage;
    const to = dto.stage;

    await this.prisma.$transaction(async (tx) => {
      // The destination column as it will be, with the card inserted at `position`.
      const destination = (
        await tx.trackedJob.findMany({
          where: { userId, stage: to, archivedAt: null, id: { not: id } },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: { id: true },
        })
      ).map((r) => r.id);

      // Clamped, so a stale client index cannot throw or land the card somewhere absurd.
      const index = Math.min(Math.max(dto.position ?? destination.length, 0), destination.length);
      destination.splice(index, 0, id);

      await tx.trackedJob.update({
        where: { id },
        data: {
          stage: to,
          // First arrival in APPLIED is when they applied. Not overwritten on a later
          // move back and forth — the original date is the true one.
          ...(to === 'APPLIED' && card.appliedAt === null && { appliedAt: new Date() }),
        },
      });
      await renumber(tx, destination);

      // The source column now has a gap. Closing it keeps positions dense so the next
      // insert index means what the client thinks it means.
      if (from !== to) {
        const source = (
          await tx.trackedJob.findMany({
            where: { userId, stage: from, archivedAt: null, id: { not: id } },
            orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
            select: { id: true },
          })
        ).map((r) => r.id);
        await renumber(tx, source);
      }
    });

    return new TrackedJobResponseDto(await this.owned(userId, id));
  }

  /** Hide a card without losing it. */
  async archive(userId: string, id: string): Promise<TrackedJobResponseDto> {
    const { count } = await this.prisma.trackedJob.updateMany({
      where: { id, userId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (count === 0) {
      // Either not theirs, or already archived — say which.
      await this.owned(userId, id);
      throw new BadRequestException('That card is already archived.');
    }
    return new TrackedJobResponseDto(await this.owned(userId, id));
  }

  /** Put an archived card back, at the top of its column. */
  async restore(userId: string, id: string): Promise<TrackedJobResponseDto> {
    const card = await this.owned(userId, id);
    if (!card.archivedAt) throw new BadRequestException('That card is not archived.');

    await this.prisma.trackedJob.update({
      where: { id },
      data: { archivedAt: null, position: await this.topPosition(userId, card.stage) },
    });
    return new TrackedJobResponseDto(await this.owned(userId, id));
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.trackedJob.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Tracked job not found');
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** A card of the caller's, or 404. Never reveals that someone else's id exists. */
  private async owned(userId: string, id: string): Promise<TrackedJob> {
    const row = await this.prisma.trackedJob.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Tracked job not found');
    return row;
  }

  /**
   * The snapshot for a posting we hold.
   *
   * Title and company come from the JOB, not the request. The caller may still supply a
   * `url`/`location` override, which matters for an EXTERNAL posting whose apply link the
   * user reached by a different route.
   */
  private async snapshotFromJob(
    jobId: string,
    dto: CreateTrackedJobDto,
  ): Promise<{ title: string; companyName: string; url: string | null; location: string | null }> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: {
        title: true,
        location: true,
        externalUrl: true,
        company: { select: { name: true } },
      },
    });
    if (!job) throw new NotFoundException('Job not found');
    return {
      title: job.title,
      companyName: job.company?.name ?? 'Unknown company',
      url: dto.url ?? job.externalUrl ?? null,
      location: dto.location ?? job.location ?? null,
    };
  }

  /**
   * One above the current top of a column.
   *
   * Positions are renumbered from 0 on every move, so this only has to beat the existing
   * minimum; the next move makes it dense again.
   */
  private async topPosition(
    userId: string,
    stage: $Enums.TrackedJobStage,
  ): Promise<number> {
    const top = await this.prisma.trackedJob.aggregate({
      where: { userId, stage, archivedAt: null },
      _min: { position: true },
    });
    return (top._min.position ?? 0) - 1;
  }
}

/** Write 0..n-1 onto a column's cards, in the given order. */
async function renumber(tx: Prisma.TransactionClient, ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((cardId, position) =>
      tx.trackedJob.update({ where: { id: cardId }, data: { position } }),
    ),
  );
}
