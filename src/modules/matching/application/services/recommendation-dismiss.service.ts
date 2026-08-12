// src/modules/matching/application/services/recommendation-dismiss.service.ts
//
// Dismissing a recommendation ("not interested"). NEW behaviour — the matching module had
// no mutating path at all before this (Phase 0 audit §1 recorded /recommendations as
// read-only), so the offline queue's DISMISS_RECOMMENDATION action had nothing to call.
//
// ⚠️ KNOWN LIMITATION — a dismissal does not survive a recompute.
// Recommendation has no `dismissedAt` column and is hard-deleted, so "dismissed" is
// represented by the row's absence. RecomputeUserMatchesUseCase rebuilds a user's
// recommendations from scratch, and nothing records that this job was rejected — so a
// dismissed job can reappear on the next recompute. The same gap means a dismissal cannot
// be reported through GET /sync/recommendations, whose `deletes` is always empty for want
// of a soft delete (audit §2).
//
// Making a dismissal stick needs a durable suppression signal — either `dismissedAt` on
// Recommendation (with recompute honouring it) or a separate dismissed-jobs table. Both
// are schema changes that were out of scope here and should be raised before this action
// type is advertised to users as permanent.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';

@Injectable()
export class RecommendationDismissService {
  private readonly logger = new Logger(RecommendationDismissService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Remove a job from this user's recommendations.
   *
   * Idempotent by construction: deleteMany on the (userId, jobId) pair removes 0 or 1
   * rows and never throws when the row is already gone. That matters here because the
   * caller is an offline queue that retries — and because a user can dismiss the same
   * job from two devices.
   *
   * Scoped by userId in the filter, so one user can never dismiss another's row.
   */
  async dismiss(
    userId: string,
    jobId: string,
  ): Promise<{ jobId: string; dismissed: boolean }> {
    const { count } = await this.prisma.recommendation.deleteMany({
      where: { userId, jobId },
    });

    if (count === 0) {
      // Not an error: either already dismissed, or never recommended in the first place.
      this.logger.debug(
        `Dismiss was a no-op for job ${jobId} (no recommendation row for this user)`,
      );
    }

    return { jobId, dismissed: count > 0 };
  }
}
