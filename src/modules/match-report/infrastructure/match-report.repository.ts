// src/modules/match-report/infrastructure/match-report.repository.ts
//
// Prisma-backed persistence for a generated match report. Deliberately thin: the report
// is written once and read back verbatim, so there is nothing to map.

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { MatchReportPayload } from '../domain/match-report-payload';

export interface StoredMatchReport {
  id: string;
  userId: string;
  payload: MatchReportPayload;
  createdAt: Date;
}

@Injectable()
export class MatchReportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    userId: string;
    externalId: string;
    source: string;
    title: string;
    company: string | null;
    payload: MatchReportPayload;
    descriptionHash: string;
  }): Promise<string> {
    const row = await this.prisma.matchReport.create({
      data: {
        userId: input.userId,
        externalId: input.externalId,
        source: input.source,
        title: input.title,
        company: input.company,
        descriptionHash: input.descriptionHash,
        // Prisma types Json columns as its own value union; the payload is a plain
        // JSON-safe object, so the cast is at the boundary and nowhere else.
        payload: input.payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return row.id;
  }

  /**
   * The most recent report for this exact posting text, if it is still fresh.
   *
   * `notBefore` is the freshness bar and is the whole reason this is safe: a report is a
   * picture of ONE RÉSUMÉ against ONE POSTING, so an unchanged posting is only half the
   * question. The caller passes the latest moment any input changed — the résumé, its
   * parse, the profile — and a report from before that is not reused. Without it, a user
   * who uploaded a better CV would keep being handed the old report forever, which is
   * exactly the write-then-never-invalidate defect §6 was about.
   *
   * A null `descriptionHash` never matches: Prisma renders `equals: null` as `IS NULL`,
   * and the caller always passes a real hash, so pre-migration rows fall through to a
   * fresh generation rather than being served against text nobody verified.
   */
  async findReusable(input: {
    userId: string;
    source: string;
    externalId: string;
    descriptionHash: string;
    notBefore: Date;
  }): Promise<string | null> {
    const row = await this.prisma.matchReport.findFirst({
      where: {
        userId: input.userId,
        source: input.source,
        externalId: input.externalId,
        descriptionHash: input.descriptionHash,
        createdAt: { gte: input.notBefore },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return row?.id ?? null;
  }

  /** The report and its owner — the caller decides what a non-owner is told. */
  async findById(id: string): Promise<StoredMatchReport | null> {
    const row = await this.prisma.matchReport.findUnique({
      where: { id },
      select: { id: true, userId: true, payload: true, createdAt: true },
    });
    if (!row) return null;
    return {
      id: row.id,
      userId: row.userId,
      payload: row.payload as unknown as MatchReportPayload,
      createdAt: row.createdAt,
    };
  }
}
