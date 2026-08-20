// src/modules/user/application/services/entitlement.service.ts
//
// "Is this user on a paid plan?" — asked in one place.
//
// It used to be asked in two, with two different answers on failure:
// GenerationController.assertPremium threw 403, ResumeController.hasPremiumAccess
// returned false and quietly dropped the AI suggestions from the response. Both are
// legitimate behaviours, but the *entitlement rule itself* was duplicated, and the
// extension's two generation routes had no check at all — the same AI, reachable free
// from any HTTP client (MENTOR_REVIEW_2026-08-18 §10).
//
// ── HOW A USER BECOMES PAID, TODAY ────────────────────────────────────────────
//
// An ADMIN sets it: `PATCH /users/:id/subscription`. That is the ONLY path.
//
// There is no self-serve purchase. `PaymentService` is an empty class,
// `StripeAdapter.createSubscription` returns `''`, `PaymentController` declares no routes,
// and the schema has no Subscription or Payment model. That is a deliberate, current
// state — pilot users get a tier granted by hand — not an oversight, and NOT something to
// infer a working billing system from.
//
// So the gate is real and enforced, but the shop is closed. If you are here because you
// are wiring Stripe: the tier write belongs behind a verified webhook, and this service
// should not need to change — callers ask the same question either way.

import { Injectable } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { SubscriptionTier } from '@shared/kernel/enums/subscription-tier.enum';
import { UserRepository } from '../../infrastructure/repositories/user.repository';

/** Tiers that entitle a user to the paid AI features. */
const PAID_TIERS: ReadonlySet<SubscriptionTier> = new Set([
  SubscriptionTier.PREMIUM,
  SubscriptionTier.PROFESSIONAL,
]);

export const PAID_PLAN_REQUIRED_MESSAGE =
  'Cover letters and interview coaching require a Premium or Professional plan.';

@Injectable()
export class EntitlementService {
  constructor(private readonly userRepository: UserRepository) {}

  /**
   * True when the user is on a paid plan.
   *
   * A missing user is NOT entitled. That matters: a deleted or unknown id must fail
   * closed, never fall through to "no tier recorded, so allow".
   */
  async hasPaidPlan(userId: string): Promise<boolean> {
    const account = await this.userRepository.findById(userId);
    return account ? PAID_TIERS.has(account.subscriptionTier) : false;
  }

  /**
   * Throw 403 unless the user is on a paid plan. For routes that must refuse outright,
   * as opposed to degrading (résumé analysis still returns its scores, just without the
   * AI suggestions).
   */
  async requirePaidPlan(userId: string): Promise<void> {
    if (!(await this.hasPaidPlan(userId))) {
      throw new ForbiddenException(PAID_PLAN_REQUIRED_MESSAGE);
    }
  }
}
