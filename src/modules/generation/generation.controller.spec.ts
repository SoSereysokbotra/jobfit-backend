import { ForbiddenException } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { SubscriptionTier } from '@shared/kernel/enums/subscription-tier.enum';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { EntitlementService } from '../user/application/services/entitlement.service';

describe('GenerationController tier gating', () => {
  const user = { id: 'u1', email: 'u@x.com', role: 'JOB_SEEKER' } as AuthenticatedUser;

  const build = (tier: SubscriptionTier) => {
    const generation = {
      coverLetterForApplication: jest.fn().mockResolvedValue({ coverLetter: 'x', generatedBy: 'ai' }),
      interview: jest.fn().mockResolvedValue({ questions: [], feedback: null, generatedBy: 'ai' }),
    };
    const entitlements = new EntitlementService({
      findById: jest.fn().mockResolvedValue({ subscriptionTier: tier }),
    } as never);
    return {
      controller: new GenerationController(generation as never, entitlements),
      generation,
    };
  };

  it('403s cover letter for FREE tier', async () => {
    const { controller, generation } = build(SubscriptionTier.FREE);
    await expect(controller.coverLetter(user, 'a1', {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(generation.coverLetterForApplication).not.toHaveBeenCalled();
  });

  it('allows cover letter for PREMIUM tier', async () => {
    const { controller, generation } = build(SubscriptionTier.PREMIUM);
    await controller.coverLetter(user, 'a1', { tone: 'friendly' });
    expect(generation.coverLetterForApplication).toHaveBeenCalledWith('u1', 'a1', 'friendly');
  });

  it('403s interview for FREE tier', async () => {
    const { controller, generation } = build(SubscriptionTier.FREE);
    await expect(
      controller.interview(user, { jobId: 'j1', level: 'SENIOR', kind: 'questions' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(generation.interview).not.toHaveBeenCalled();
  });

  it('allows interview for PROFESSIONAL tier', async () => {
    const { controller, generation } = build(SubscriptionTier.PROFESSIONAL);
    await controller.interview(user, { jobId: 'j1', level: 'SENIOR', kind: 'questions' });
    expect(generation.interview).toHaveBeenCalledWith('j1', 'SENIOR', 'questions', undefined);
  });
});

// ── The extension routes: same AI, same entitlement (MENTOR_REVIEW §10) ───────
//
// `generate/cover-letter` and `generate/interview-prep` ran the SAME GenerationService as
// the two paid routes with no tier check at all. That was recorded as an "accepted
// caveat" on the assumption there was a working paywall elsewhere; there wasn't, so in
// practice the paywall was optional if you knew the other URL. A different CLIENT is not
// a different ENTITLEMENT.
// The two WEB routes stay gated. The two EXTENSION routes were deliberately UNGATED on
// 2026-09-07: this product has no billing, so `requirePaidPlan` could never be satisfied
// by anyone — every user is FREE permanently. The gate returned 403 on every call and the
// extension rendered it as "Log in to JobFit to generate" to an already signed-in user.
// These tests now pin the intended asymmetry, so re-adding a gate to the extension routes
// (or dropping one from the web routes) fails loudly rather than silently.
describe('GenerationController — web routes gated, extension routes open', () => {
  const user = { id: 'u1', email: 'u@x.com', role: 'JOB_SEEKER' } as AuthenticatedUser;

  const build = (tier: SubscriptionTier) => {
    const generation = {
      coverLetterForExternalJob: jest
        .fn()
        .mockResolvedValue({ coverLetter: 'Dear…', generatedBy: 'ai' }),
      interviewForExternalJob: jest
        .fn()
        .mockResolvedValue({ questions: [{ category: 'system design', question: 'Q?' }] }),
    };
    const entitlements = new EntitlementService({
      findById: jest.fn().mockResolvedValue({ subscriptionTier: tier }),
    } as never);
    return {
      controller: new GenerationController(generation as never, entitlements),
      generation,
    };
  };

  it('runs the extension cover letter for a FREE tier — no billing exists to gate on', async () => {
    const { controller, generation } = build(SubscriptionTier.FREE);

    await controller.extensionCoverLetter(user, { role: 'Engineer' } as never);
    expect(generation.coverLetterForExternalJob).toHaveBeenCalled();
  });

  it('allows the extension cover letter for PREMIUM tier', async () => {
    const { controller, generation } = build(SubscriptionTier.PREMIUM);

    await controller.extensionCoverLetter(user, { role: 'Engineer' } as never);
    expect(generation.coverLetterForExternalJob).toHaveBeenCalled();
  });

  it('runs extension interview prep for a FREE tier — no billing exists to gate on', async () => {
    const { controller, generation } = build(SubscriptionTier.FREE);

    await controller.extensionInterview(user, { role: 'Engineer' } as never);
    expect(generation.interviewForExternalJob).toHaveBeenCalled();
  });

  it('allows extension interview prep for PROFESSIONAL tier', async () => {
    const { controller, generation } = build(SubscriptionTier.PROFESSIONAL);

    await controller.extensionInterview(user, { role: 'Engineer' } as never);
    expect(generation.interviewForExternalJob).toHaveBeenCalled();
  });

  it('still gates the WEB generation routes for a FREE tier', async () => {
    // Removing the extension gates must not have removed these. They belong to the web
    // app, where a plan concept still exists in the schema.
    const { controller } = build(SubscriptionTier.FREE);

    await expect(
      controller.coverLetter(user, 'app-1', {} as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.interview(user, {} as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists every route on this controller, so a new one cannot slip in unnoticed', () => {
    // Asserts the surface, not one path through it: a route added here forces a decision
    // about whether it should be gated.
    const routes = Object.getOwnPropertyNames(GenerationController.prototype).filter(
      (n) => n !== 'constructor',
    );
    expect(routes.sort()).toEqual(
      [
        'coverLetter',
        'extensionCoverLetter',
        'extensionInterview',
        'interview',
      ].sort(),
    );
  });
});
