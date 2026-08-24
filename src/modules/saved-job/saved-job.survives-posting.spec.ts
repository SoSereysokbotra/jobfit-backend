// A bookmark must outlive the posting it points at.
//
// MENTOR_REVIEW_2026-08-18 §16. `saved_jobs.jobId` was `onDelete: Cascade` with no
// snapshot, so deleting a job erased the user's bookmark without a trace — while a
// `tracked_jobs` card for the identical posting survived, because JOB_TRACKER_PLAN §2 had
// already made the case that postings vanish. That argument was never back-ported.
//
// The schema half is a migration; these pin the code half — that a save captures enough
// to be meaningful later, and that an orphan is never dressed up as a live bookmark.

import { SavedJobRepository } from './infrastructure/repositories/saved-job.repository';

const JOB = {
  title: 'Primary School Mathematics Teacher',
  externalUrl: 'https://bongthom.com/jobs/123',
  company: { name: 'Kirirom Tech' },
};

function build(over: { job?: typeof JOB | null; rows?: Record<string, unknown>[] } = {}) {
  const job = 'job' in over ? over.job : JOB;
  const prisma = {
    job: { findUnique: jest.fn().mockResolvedValue(job ?? null) },
    savedJob: {
      create: jest.fn().mockResolvedValue({ id: 's1' }),
      findMany: jest.fn().mockResolvedValue(over.rows ?? []),
      deleteMany: jest.fn(),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  return { repo: new SavedJobRepository(prisma as never), prisma };
}

describe('SavedJob — surviving the posting', () => {
  describe('saving captures a snapshot', () => {
    it('copies title, company and url off the job', async () => {
      const { repo, prisma } = build();
      await repo.add('u1', 'job-1');

      expect(prisma.savedJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          jobId: 'job-1',
          title: JOB.title,
          companyName: 'Kirirom Tech',
          url: JOB.externalUrl,
        }),
      });
    });

    it('reads the job itself rather than trusting the caller to pass it', async () => {
      // Every caller would otherwise have to remember, and the one that forgets writes a
      // bookmark that dies exactly the way this fix exists to prevent.
      const { repo, prisma } = build();
      await repo.add('u1', 'job-1');
      expect(prisma.job.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'job-1' } }),
      );
    });

    it('still attempts the insert when the job is missing, so the FK decides', async () => {
      // An unknown id must stay a 400 with the existing message, not become a new
      // failure mode in the snapshot lookup.
      const { repo, prisma } = build({ job: null });
      await repo.add('u1', 'nope');

      expect(prisma.savedJob.create).toHaveBeenCalled();
      const data = prisma.savedJob.create.mock.calls[0][0].data as Record<string, unknown>;
      expect(data.title).toBeNull();
      expect(data.companyName).toBeNull();
    });
  });

  describe('orphans are never dressed up as live bookmarks', () => {
    it('excludes orphans from the id list', async () => {
      const { repo, prisma } = build({ rows: [{ jobId: 'job-1' }] });
      await repo.findJobIdsByUser('u1');

      expect(prisma.savedJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u1', jobId: { not: null } }),
        }),
      );
    });

    it('returns real ids only, never a null or an empty string', async () => {
      // A null here would be a broken id in an array a client fetches by.
      const { repo } = build({ rows: [{ jobId: 'job-1' }, { jobId: 'job-2' }] });
      await expect(repo.findJobIdsByUser('u1')).resolves.toEqual(['job-1', 'job-2']);
    });

    it('excludes orphans from the offline sync feed', async () => {
      // findByUser feeds GET /sync/saved-jobs, which pushes jobId to every device.
      const { repo, prisma } = build({ rows: [] });
      await repo.findByUser('u1');

      expect(prisma.savedJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ jobId: { not: null } }),
        }),
      );
    });

    it('THROWS rather than coercing a null jobId into the domain entity', async () => {
      // The entity promises a real job id. `?? ''` would satisfy the type and lie to
      // everything downstream — including the offline clients sync pushes to.
      const { repo } = build({
        rows: [{ id: 's1', userId: 'u1', jobId: null, createdAt: new Date() }],
      });
      await expect(repo.findByUser('u1')).rejects.toThrow(/orphaned/i);
    });
  });

  describe('orphans remain reachable', () => {
    it('reads them by their snapshot, not by a job that no longer exists', async () => {
      const orphan = {
        id: 's1',
        title: 'Primary School Mathematics Teacher',
        companyName: 'Kirirom Tech',
        url: 'https://bongthom.com/jobs/123',
        createdAt: new Date(),
      };
      const { repo, prisma } = build({ rows: [orphan] });

      await expect(repo.findOrphanedByUser('u1')).resolves.toEqual([orphan]);
      expect(prisma.savedJob.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'u1', jobId: null }),
        }),
      );
    });
  });
});
