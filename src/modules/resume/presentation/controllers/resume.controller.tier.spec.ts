// Verifies Phase 2 tier gating on POST /resumes/:id/score:
// AI suggestions are returned only for PREMIUM/PROFESSIONAL; FREE gets scores only.

import { ResumeController } from './resume.controller';
import { EntitlementService } from '../../../user/application/services/entitlement.service';
import { SubscriptionTier } from '@shared/kernel/enums/subscription-tier.enum';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';

describe('ResumeController score suggestions gating', () => {
  const user = { id: 'u1', email: 'u@x.com', role: 'JOB_SEEKER' } as AuthenticatedUser;

  const scoreResult = {
    atsScore: 82,
    qualityScore: 76,
    breakdown: { formatting: 80 },
    suggestions: ['Add measurable outcomes'],
    scoredBy: 'ai' as const,
  };

  const build = (tier: SubscriptionTier) => {
    const resumeService = { getResume: jest.fn().mockResolvedValue({ userId: 'u1' }) };
    const resumeScorer = { scoreResume: jest.fn().mockResolvedValue(scoreResult) };
    // The REAL EntitlementService over a stub repository — so the tier rule under test is
    // the one that ships, not a re-statement of it here.
    const entitlements = new EntitlementService({
      findById: jest.fn().mockResolvedValue({ subscriptionTier: tier }),
    } as never);
    const parsedRepo = { findByResumeId: jest.fn() };
    const controller = new ResumeController(
      resumeService as never,
      resumeScorer as never,
      entitlements,
      parsedRepo as never,
    );
    return { controller };
  };

  it('omits suggestions for FREE tier', async () => {
    const { controller } = build(SubscriptionTier.FREE);
    const res = await controller.score(user, 'r1');
    expect(res.atsScore).toBe(82);
    expect(res.breakdown).toEqual({ formatting: 80 });
    expect(res.suggestions).toBeUndefined();
  });

  it('includes suggestions for PREMIUM tier', async () => {
    const { controller } = build(SubscriptionTier.PREMIUM);
    const res = await controller.score(user, 'r1');
    expect(res.suggestions).toEqual(['Add measurable outcomes']);
  });

  it('includes suggestions for PROFESSIONAL tier', async () => {
    const { controller } = build(SubscriptionTier.PROFESSIONAL);
    const res = await controller.score(user, 'r1');
    expect(res.suggestions).toEqual(['Add measurable outcomes']);
  });
});
