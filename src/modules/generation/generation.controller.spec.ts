import { ForbiddenException } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { SubscriptionTier } from '@shared/kernel/enums/subscription-tier.enum';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';

describe('GenerationController tier gating', () => {
  const user = { id: 'u1', email: 'u@x.com', role: 'JOB_SEEKER' } as AuthenticatedUser;

  const build = (tier: SubscriptionTier) => {
    const generation = {
      coverLetterForApplication: jest.fn().mockResolvedValue({ coverLetter: 'x', generatedBy: 'ai' }),
      interview: jest.fn().mockResolvedValue({ questions: [], feedback: null, generatedBy: 'ai' }),
    };
    const userRepository = { findById: jest.fn().mockResolvedValue({ subscriptionTier: tier }) };
    return {
      controller: new GenerationController(generation as never, userRepository as never),
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
