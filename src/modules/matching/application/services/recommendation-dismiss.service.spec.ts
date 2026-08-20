// src/modules/matching/application/services/recommendation-dismiss.service.spec.ts
//
// A dismissal used to be a hard delete, so "dismissed" meant "no row" — and any recompute
// rebuilt the row and brought the job back. That stayed invisible only because recomputes
// essentially never ran. Making invalidation real (MENTOR_REVIEW_2026-08-18 §6) would
// have made it fire on every profile edit, so durable dismissal had to land first.

import { Logger } from '@nestjs/common';
import { RecommendationDismissService } from './recommendation-dismiss.service';

describe('RecommendationDismissService', () => {
  let prisma: {
    recommendation: { updateMany: jest.Mock; deleteMany: jest.Mock };
  };
  let service: RecommendationDismissService;

  beforeEach(() => {
    prisma = {
      recommendation: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn(),
      },
    };
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    service = new RecommendationDismissService(prisma as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('soft-deletes rather than deleting the row', async () => {
    const result = await service.dismiss('u1', 'j1');

    expect(result).toEqual({ jobId: 'j1', dismissed: true });
    expect(prisma.recommendation.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', jobId: 'j1', dismissedAt: null },
      data: { dismissedAt: expect.any(Date) },
    });
    // A hard delete is what let recompute resurrect the job.
    expect(prisma.recommendation.deleteMany).not.toHaveBeenCalled();
  });

  it('is scoped by userId, so one user cannot dismiss another’s row', async () => {
    await service.dismiss('u1', 'j1');

    const { where } = prisma.recommendation.updateMany.mock.calls[0][0];
    expect(where.userId).toBe('u1');
  });

  it('is idempotent: a repeat dismissal is a no-op, not an error', async () => {
    prisma.recommendation.updateMany.mockResolvedValue({ count: 0 });

    // The caller is an offline queue that retries, and a user can dismiss from two
    // devices.
    await expect(service.dismiss('u1', 'j1')).resolves.toEqual({
      jobId: 'j1',
      dismissed: false,
    });
  });

  it('does not re-stamp an already-dismissed row', async () => {
    await service.dismiss('u1', 'j1');

    const { where } = prisma.recommendation.updateMany.mock.calls[0][0];
    // `dismissedAt: null` in the filter keeps the value meaning "when they first said no".
    expect(where.dismissedAt).toBeNull();
  });
});
