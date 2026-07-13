// src/modules/application/infrastructure/repositories/application-timeline.repository.ts
//
// Prisma-backed persistence for immutable ApplicationTimeline entries.

import { Injectable } from '@nestjs/common';
import {
  $Enums,
  ApplicationTimeline as PrismaApplicationTimeline,
} from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { ApplicationTimeline } from '../../domain/entities/application-timeline.entity';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';

@Injectable()
export class ApplicationTimelineRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(timeline: ApplicationTimeline): Promise<void> {
    await this.prisma.applicationTimeline.upsert({
      where: { id: timeline.id },
      update: {
        status: timeline.status as $Enums.ApplicationStatus,
        eventType: timeline.eventType,
        description: timeline.description ?? null,
        eventDate: timeline.eventDate,
      },
      create: {
        id: timeline.id,
        applicationId: timeline.applicationId,
        status: timeline.status as $Enums.ApplicationStatus,
        eventType: timeline.eventType,
        description: timeline.description ?? null,
        eventDate: timeline.eventDate,
      },
    });
  }

  async findById(id: string): Promise<ApplicationTimeline | null> {
    const row = await this.prisma.applicationTimeline.findUnique({
      where: { id },
    });
    return row ? this.mapToDomain(row) : null;
  }

  /** All timeline entries for an application, oldest first. */
  async findByApplicationId(
    applicationId: string,
  ): Promise<ApplicationTimeline[]> {
    const rows = await this.prisma.applicationTimeline.findMany({
      where: { applicationId },
      orderBy: { eventDate: 'asc' },
    });
    return rows.map((r) => this.mapToDomain(r));
  }

  /** Convenience: create + persist a new timeline entry. */
  async addEvent(
    applicationId: string,
    status: ApplicationStatus,
    eventType: string,
    description?: string,
  ): Promise<ApplicationTimeline> {
    const entry = ApplicationTimeline.create({
      applicationId,
      status,
      eventType,
      description,
    });
    await this.save(entry);
    return entry;
  }

  private mapToDomain(raw: PrismaApplicationTimeline): ApplicationTimeline {
    return new ApplicationTimeline(
      {
        applicationId: raw.applicationId,
        status: raw.status as ApplicationStatus,
        eventType: raw.eventType,
        description: raw.description ?? undefined,
        eventDate: raw.eventDate,
      },
      raw.id,
    );
  }
}
