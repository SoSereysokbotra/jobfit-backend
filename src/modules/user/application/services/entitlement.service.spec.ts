import { ForbiddenException } from '@nestjs/common';
import { SubscriptionTier } from '@shared/kernel/enums/subscription-tier.enum';
import { EntitlementService } from './entitlement.service';

describe('EntitlementService', () => {
  const forTier = (tier: SubscriptionTier | undefined) =>
    new EntitlementService({
      findById: jest
        .fn()
        .mockResolvedValue(tier === undefined ? null : { subscriptionTier: tier }),
    } as never);

  describe('hasPaidPlan', () => {
    it.each([SubscriptionTier.PREMIUM, SubscriptionTier.PROFESSIONAL])(
      'is true for %s',
      async (tier) => {
        await expect(forTier(tier).hasPaidPlan('u1')).resolves.toBe(true);
      },
    );

    it('is false for FREE', async () => {
      await expect(forTier(SubscriptionTier.FREE).hasPaidPlan('u1')).resolves.toBe(
        false,
      );
    });

    it('fails CLOSED for an unknown user', async () => {
      // A deleted or bogus id must not fall through to "no tier recorded, so allow".
      await expect(forTier(undefined).hasPaidPlan('ghost')).resolves.toBe(false);
    });
  });

  describe('requirePaidPlan', () => {
    it('passes for a paid tier', async () => {
      await expect(
        forTier(SubscriptionTier.PREMIUM).requirePaidPlan('u1'),
      ).resolves.toBeUndefined();
    });

    it('throws 403 for FREE', async () => {
      await expect(
        forTier(SubscriptionTier.FREE).requirePaidPlan('u1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws 403 for an unknown user', async () => {
      await expect(
        forTier(undefined).requirePaidPlan('ghost'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('names the plans needed, so the client can say what to do', async () => {
      await expect(
        forTier(SubscriptionTier.FREE).requirePaidPlan('u1'),
      ).rejects.toThrow(/Premium or Professional/);
    });
  });

  it('treats the two paid tiers identically — no PROFESSIONAL-only feature exists yet', async () => {
    // If that ever stops being true, this service needs a second question, not a caller
    // comparing tiers inline again (which is how the rule got duplicated in the first
    // place — MENTOR_REVIEW_2026-08-18 §10).
    const premium = await forTier(SubscriptionTier.PREMIUM).hasPaidPlan('u1');
    const professional = await forTier(SubscriptionTier.PROFESSIONAL).hasPaidPlan('u1');
    expect(premium).toBe(professional);
  });
});
