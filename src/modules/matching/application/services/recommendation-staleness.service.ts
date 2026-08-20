// src/modules/matching/application/services/recommendation-staleness.service.ts
//
// When is a cached recommendation no longer trustworthy?
//
// `recommendations` is a cache of scores derived from `profiles.embedding` plus the
// candidate's profile fields. Both change — on a profile edit, a preference change, a
// résumé parse, a default-résumé switch — and until now nothing told the cache. The read
// path only rebuilt when a user had ZERO rows and no cron ever ran, so a user who
// uploaded a better CV saw the same matches indefinitely (MENTOR_REVIEW_2026-08-18 §6).
//
// WHY A MARKER AND NOT A DELETE. The obvious fix is `deleteMany({ where: { userId } })`
// and let the lazy path rebuild. Two reasons not to:
//
//   1. A recompute that fails then leaves the user with an EMPTY recommendations page.
//      Slightly-old matches beat none, so stale rows keep serving until a recompute
//      succeeds.
//   2. Deletion is how a dismissal is represented. Wiping the table on every profile edit
//      would resurrect every job the user said "not interested" to — a latent bug that
//      only stayed quiet because recomputes never happened.
//
// This service owns only the marking. Acting on the mark is the read path's job
// (RecommendationsQueryService), and clearing it is the recompute's.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';

@Injectable()
export class RecommendationStalenessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mark every live recommendation for this user as needing recomputation.
   * Returns how many rows were marked.
   *
   * Dismissed rows are skipped: they are tombstones, not results, and refreshing a score
   * nobody will see is wasted work. Already-stale rows are skipped too, so repeated edits
   * do not keep pushing `staleAt` forward — the timestamp should say when the data FIRST
   * went out of date, which is what makes it useful in a log.
   */
  async markStale(userId: string): Promise<number> {
    const { count } = await this.prisma.recommendation.updateMany({
      where: { userId, dismissedAt: null, staleAt: null },
      data: { staleAt: new Date() },
    });
    return count;
  }

  /**
   * Same, for an event that carries a résumé id rather than a user id
   * (`ResumeParsedEvent`). Resolves the owner first; a résumé with no owner row is a
   * no-op rather than an error.
   */
  async markStaleByResume(resumeId: string): Promise<number> {
    const resume = await this.prisma.resume.findUnique({
      where: { id: resumeId },
      select: { userId: true },
    });
    return resume ? this.markStale(resume.userId) : 0;
  }
}
