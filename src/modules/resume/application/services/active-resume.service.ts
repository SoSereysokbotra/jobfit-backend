// src/modules/resume/application/services/active-resume.service.ts
//
// WHICH résumé the AI speaks for, when a user has uploaded several.
//
// A user can upload many CVs and mark one as default (`Resume.isDefault`, set through
// PATCH /resumes/:id/set-default). Before this existed, every AI path independently ran
// "newest by updatedAt" and ignored the flag, so a user could mark CV #1 as their default
// and still be matched, embedded and cover-lettered from CV #3. The rule also drifted:
// some call sites ordered by createdAt, and most forgot that delete is a SOFT delete, so
// a résumé the user had removed could still be the one driving their recommendations.
//
// One definition, one place:
//   1. the default résumé, if it parsed successfully and is not deleted
//   2. else the most recently updated résumé that parsed and is not deleted
//   3. else null — the user has nothing readable
//
// Step 2 matters: a default that failed to parse has no structured data to score, and
// falling back silently beats telling someone with three CVs that they have none.
//
// MatchReportService.pickResume applies the same order deliberately in its own terms —
// it needs the Resume entity, and it surfaces an unparsed default rather than dropping it.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';

@Injectable()
export class ActiveResumeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The id of the résumé the AI should speak for, or null when the user has no
   * successfully parsed résumé. Callers read whatever ParsedResumeData columns they
   * need from this id.
   */
  async findActiveResumeId(userId: string): Promise<string | null> {
    const readable = {
      userId,
      parsingStatus: 'SUCCESS' as const,
      deletedAt: null,
    };

    const preferred = await this.prisma.resume.findFirst({
      where: { ...readable, isDefault: true },
      select: { id: true },
    });
    if (preferred) return preferred.id;

    const newest = await this.prisma.resume.findFirst({
      where: readable,
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    return newest?.id ?? null;
  }
}
