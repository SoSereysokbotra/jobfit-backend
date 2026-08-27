import { RecommendationStalenessService } from './recommendation-staleness.service';

describe('RecommendationStalenessService', () => {
  let prisma: {
    recommendation: { updateMany: jest.Mock; deleteMany: jest.Mock };
    resume: { findUnique: jest.Mock };
  };
  let service: RecommendationStalenessService;

  beforeEach(() => {
    prisma = {
      recommendation: {
        updateMany: jest.fn().mockResolvedValue({ count: 4 }),
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      resume: { findUnique: jest.fn().mockResolvedValue({ userId: 'u1' }) },
    };
    service = new RecommendationStalenessService(prisma as never);
  });

  it('marks a user’s live recommendations stale', async () => {
    const marked = await service.markStale('u1');

    expect(marked).toBe(4);
    expect(prisma.recommendation.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', dismissedAt: null, staleAt: null },
      data: { staleAt: expect.any(Date) },
    });
  });

  it('never touches dismissed rows', async () => {
    await service.markStale('u1');

    const { where } = prisma.recommendation.updateMany.mock.calls[0][0];
    // Dismissed rows are tombstones. Marking them stale would make recompute refresh a
    // score nobody will ever see.
    expect(where.dismissedAt).toBeNull();
  });

  it('does not re-stamp rows that are already stale', async () => {
    await service.markStale('u1');

    const { where } = prisma.recommendation.updateMany.mock.calls[0][0];
    // staleAt should say when the data FIRST went out of date; repeated profile edits
    // pushing it forward would make it useless in a log.
    expect(where.staleAt).toBeNull();
  });

  it('resolves the owner when the event carries a résumé id', async () => {
    const marked = await service.markStaleByResume('r1');

    expect(prisma.resume.findUnique).toHaveBeenCalledWith({
      where: { id: 'r1' },
      select: { userId: true },
    });
    expect(prisma.recommendation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'u1' }) }),
    );
    expect(marked).toBe(4);
  });

  it('is a no-op for a résumé with no owner row', async () => {
    prisma.resume.findUnique.mockResolvedValue(null);

    await expect(service.markStaleByResume('r-gone')).resolves.toBe(0);
    expect(prisma.recommendation.updateMany).not.toHaveBeenCalled();
  });

  it('marks only live cached rows for an updated job stale', async () => {
    await service.markStaleForJob('j1');

    expect(prisma.recommendation.updateMany).toHaveBeenCalledWith({
      where: { jobId: 'j1', dismissedAt: null, staleAt: null },
      data: { staleAt: expect.any(Date) },
    });
  });

  it('removes all cached rows when a job closes', async () => {
    await expect(service.removeForClosedJob('j1')).resolves.toBe(2);
    expect(prisma.recommendation.deleteMany).toHaveBeenCalledWith({
      where: { jobId: 'j1' },
    });
  });
});
