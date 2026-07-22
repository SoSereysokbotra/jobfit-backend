// Verifies Phase 2 tier gating on POST /resumes/:id/score:
// AI suggestions are returned only for PREMIUM/PROFESSIONAL; FREE gets scores only.

import { ResumeController } from './resume.controller';
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
    const userRepository = {
      findById: jest.fn().mockResolvedValue({ subscriptionTier: tier }),
    };
    const parsedRepo = { findByResumeId: jest.fn() };
    const controller = new ResumeController(
      resumeService as never,
      resumeScorer as never,
      userRepository as never,
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
