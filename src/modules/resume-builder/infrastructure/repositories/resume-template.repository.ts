// src/modules/resume-builder/infrastructure/repositories/resume-template.repository.ts
//
// Read-only access to the template catalogue.
//
// `isActive: true` is applied HERE, not left to callers: a retired template must be
// invisible to selection everywhere, and the FK from ResumeDocument is RESTRICT so
// retiring one can never orphan the documents already using it.
//
// There is no create/update/delete method on purpose. Templates enter the system
// through prisma/seed.ts and nothing else.

import { Injectable } from '@nestjs/common';
import { Prisma, ResumeTemplate } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';

export interface TemplateFilters {
  atsOnly?: boolean;
  category?: string;
}

@Injectable()
export class ResumeTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActive(filters: TemplateFilters = {}): Promise<ResumeTemplate[]> {
    const where: Prisma.ResumeTemplateWhereInput = { isActive: true };

    // Only narrow on atsOnly=true. `atsOnly=false` means "don't filter", not
    // "show me the non-ATS ones" — the flag is a toggle in the picker, not a tri-state.
    if (filters.atsOnly === true) where.isAtsFriendly = true;
    if (filters.category) where.category = filters.category;

    return this.prisma.resumeTemplate.findMany({
      where,
      // Stable, human-meaningful order so the picker does not reshuffle between loads.
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }
}
