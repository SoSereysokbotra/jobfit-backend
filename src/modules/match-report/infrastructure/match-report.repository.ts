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
  }): Promise<string> {
    const row = await this.prisma.matchReport.create({
      data: {
        userId: input.userId,
        externalId: input.externalId,
        source: input.source,
        title: input.title,
        company: input.company,
        // Prisma types Json columns as its own value union; the payload is a plain
        // JSON-safe object, so the cast is at the boundary and nowhere else.
        payload: input.payload as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return row.id;
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
