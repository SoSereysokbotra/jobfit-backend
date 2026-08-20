// src/modules/matching/application/services/recommendation-dismiss.service.ts
//
// Dismissing a recommendation ("not interested"). NEW behaviour — the matching module had
// no mutating path at all before this (Phase 0 audit §1 recorded /recommendations as
// read-only), so the offline queue's DISMISS_RECOMMENDATION action had nothing to call.
//
// ✅ RESOLVED 2026-08-20 — a dismissal now survives a recompute.
// It used to be represented by the row's ABSENCE (a hard delete), so
// RecomputeUserMatchesUseCase, which rebuilds from scratch, resurrected every dismissed
// job. That only stayed quiet because recomputes essentially never ran: the read path
// rebuilt only when a user had zero rows, and there is no cron. Making invalidation real
// (MENTOR_REVIEW_2026-08-18 §6) would have made this fire on every profile edit, so the
// durable signal was a PREREQUISITE for that fix, not a follow-up.
//
// A dismissal is now `dismissedAt` on the row. The row stays as a tombstone: reads filter
// it out, recompute refreshes its score but never clears the flag, and the extension's
// scout skips it too. That also gives GET /sync/recommendations the real `deletes` signal
// it never had (sync.service.ts:16-17, audit §2).

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';

@Injectable()
export class RecommendationDismissService {
  private readonly logger = new Logger(RecommendationDismissService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Remove a job from this user's recommendations.
   *
   * Idempotent by construction: updateMany over the (userId, jobId) pair touches 0 or 1
   * rows and never throws when there is nothing to do. That matters here because the
   * caller is an offline queue that retries — and because a user can dismiss the same job
   * from two devices.
   *
   * `dismissedAt: null` in the filter makes a repeat dismissal a no-op rather than
   * re-stamping the timestamp, so the value keeps meaning "when they first said no".
   *
   * Scoped by userId in the filter, so one user can never dismiss another's row.
   */
  async dismiss(
    userId: string,
    jobId: string,
  ): Promise<{ jobId: string; dismissed: boolean }> {
    const { count } = await this.prisma.recommendation.updateMany({
      where: { userId, jobId, dismissedAt: null },
      data: { dismissedAt: new Date() },
    });

    if (count === 0) {
      // Not an error: either already dismissed, or never recommended in the first place.
      this.logger.debug(
        `Dismiss was a no-op for job ${jobId} (no live recommendation row for this user)`,
      );
    }

    return { jobId, dismissed: count > 0 };
  }
}
