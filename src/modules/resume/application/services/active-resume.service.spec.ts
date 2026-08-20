// Tests for ActiveResumeService — WHICH résumé the AI speaks for.
//
// The bug this exists to prevent: a user marks CV #1 as their default and the matching
// engine keeps using CV #3 because it was uploaded later. Every case below is a way that
// silent substitution used to happen.

import { ActiveResumeService } from './active-resume.service';

describe('ActiveResumeService', () => {
  /**
   * A prisma stub that answers findFirst from a table of rows, applying the same
   * where/orderBy the service asks for. Behavioural rather than call-shape assertions:
   * the point is which résumé comes back, not which query produced it.
   */
  const build = (
    rows: {
      id: string;
      isDefault?: boolean;
      parsingStatus?: string;
      deletedAt?: Date | null;
      updatedAt?: Date;
    }[],
  ) => {
    const full = rows.map((r, i) => ({
      isDefault: false,
      parsingStatus: 'SUCCESS',
      deletedAt: null,
      updatedAt: new Date(2020, 0, i + 1),
      ...r,
    }));

    const prisma: any = {
      resume: {
        findFirst: jest.fn(({ where, orderBy }: any) => {
          let hits = full.filter(
            (r) =>
              r.parsingStatus === where.parsingStatus &&
              r.deletedAt === where.deletedAt &&
              (where.isDefault === undefined || r.isDefault === where.isDefault),
          );
          if (orderBy?.updatedAt === 'desc') {
            hits = [...hits].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
          }
          return Promise.resolve(hits[0] ? { id: hits[0].id } : null);
        }),
      },
    };
    return new ActiveResumeService(prisma as never);
  };

  it('prefers the default over a more recently updated résumé', async () => {
    const service = build([
      { id: 'chosen', isDefault: true, updatedAt: new Date(2020, 0, 1) },
      { id: 'newer', updatedAt: new Date(2024, 0, 1) },
    ]);

    // The whole point of the feature: recency must not override the user's choice.
    expect(await service.findActiveResumeId('u1')).toBe('chosen');
  });

  it('falls back to the newest parsed résumé when none is marked default', async () => {
    const service = build([
      { id: 'old', updatedAt: new Date(2020, 0, 1) },
      { id: 'newest', updatedAt: new Date(2024, 0, 1) },
    ]);

    expect(await service.findActiveResumeId('u1')).toBe('newest');
  });

  it('skips a default that failed to parse rather than returning nothing', async () => {
    // An unparsed default has no structured data to score. Reporting "no résumé" to
    // someone holding three of them is worse than quietly using one we can read.
    const service = build([
      { id: 'broken', isDefault: true, parsingStatus: 'FAILED' },
      { id: 'readable', updatedAt: new Date(2024, 0, 1) },
    ]);

    expect(await service.findActiveResumeId('u1')).toBe('readable');
  });

  it('ignores a soft-deleted default', async () => {
    // Delete is a soft delete. Before this, a résumé the user had removed could still be
    // the one driving their recommendations.
    const service = build([
      { id: 'deleted', isDefault: true, deletedAt: new Date() },
      { id: 'live', updatedAt: new Date(2024, 0, 1) },
    ]);

    expect(await service.findActiveResumeId('u1')).toBe('live');
  });

  it('never returns a soft-deleted résumé even as the fallback', async () => {
    const service = build([{ id: 'deleted', deletedAt: new Date() }]);

    expect(await service.findActiveResumeId('u1')).toBeNull();
  });

  it('returns null when the user has nothing readable', async () => {
    const service = build([{ id: 'pending', parsingStatus: 'PENDING' }]);

    expect(await service.findActiveResumeId('u1')).toBeNull();
  });
});
