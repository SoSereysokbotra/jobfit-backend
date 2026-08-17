// src/modules/saved-job/saved-external-job.service.ts
//
// "Save Job" from the browser extension. Thin by design: this is a bookmark, not an
// analysis — nothing here scores, matches or enriches the posting.

import { Injectable } from '@nestjs/common';
import { SavedExternalJob } from '@prisma/client';
import { SavedExternalJobRepository } from './infrastructure/repositories/saved-external-job.repository';
import { SaveExternalJobDto, SavedExternalJobDto } from './dto/save-external-job.dto';

/** Trim, and treat an all-whitespace field as absent rather than storing " ". */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

@Injectable()
export class SavedExternalJobService {
  constructor(private readonly repository: SavedExternalJobRepository) {}

  async save(userId: string, dto: SaveExternalJobDto): Promise<SavedExternalJobDto> {
    const row = await this.repository.save({
      userId,
      source: dto.source,
      externalId: dto.externalId,
      title: dto.title.trim(),
      company: clean(dto.company),
      description: clean(dto.description),
      url: clean(dto.url),
      salary: clean(dto.salary),
      notes: clean(dto.notes),
    });
    return toDto(row);
  }

  async list(userId: string): Promise<SavedExternalJobDto[]> {
    const rows = await this.repository.findByUser(userId);
    return rows.map(toDto);
  }

  /** The saved copy of one posting, or null — lets the extension show "Saved ✓". */
  async findOne(
    userId: string,
    source: string,
    externalId: string,
  ): Promise<SavedExternalJobDto | null> {
    const row = await this.repository.findOne(userId, source, externalId);
    // `null`, never `undefined`: the response interceptor drops an undefined `data` key
    // and the extension's unwrap() then hands the whole envelope to the UI.
    return row ? toDto(row) : null;
  }

  remove(userId: string, id: string): Promise<boolean> {
    return this.repository.remove(userId, id);
  }
}

function toDto(row: SavedExternalJob): SavedExternalJobDto {
  return {
    id: row.id,
    source: row.source,
    externalId: row.externalId,
    title: row.title,
    company: row.company,
    description: row.description,
    url: row.url,
    salary: row.salary,
    notes: row.notes,
    savedAt: row.createdAt.toISOString(),
  };
}
