// Archiving is per-actor, and the two sides must not be able to reach each other.
//
// It used to be the shared status ARCHIVED. A candidate tidying a job they had ACCEPTED
// dropped the card out of the employer's Hired column — and, because ARCHIVED mapped to
// "Rejected" on the board, filed someone they had hired under rejections. It also
// overwrote the status underneath, so the row stopped recording the hire at all.
//
// The guarantee now is structural: each side reads and writes its OWN column.

import { ApplicationRepository } from './application.repository';
import { EmployerApplicationRepository } from '@modules/employer/infrastructure/repositories/employer-application.repository';

const CANDIDATE_COL = 'archivedByCandidateAt';
const EMPLOYER_COL = 'archivedByEmployerAt';

const makePrisma = () => ({
  application: {
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({}),
  },
});

describe('archiving is separated by actor', () => {
  describe('the candidate side', () => {
    it('hides only what the CANDIDATE archived', async () => {
      const prisma = makePrisma();
      await new ApplicationRepository(prisma as never).findByUserId('u1');

      const { where } = prisma.application.findMany.mock.calls[0][0];
      expect(where[CANDIDATE_COL]).toBeNull();
      expect(where).not.toHaveProperty(EMPLOYER_COL);
    });

    it('can show them again on request', async () => {
      const prisma = makePrisma();
      await new ApplicationRepository(prisma as never).findByUserId('u1', 0, 20, true);

      const { where } = prisma.application.findMany.mock.calls[0][0];
      expect(where).not.toHaveProperty(CANDIDATE_COL);
    });

    it('writes only the candidate column, and never a status', async () => {
      const prisma = makePrisma();
      await new ApplicationRepository(prisma as never).setArchivedByCandidate('a1', true);

      const { data } = prisma.application.update.mock.calls[0][0];
      expect(data[CANDIDATE_COL]).toBeInstanceOf(Date);
      expect(data).not.toHaveProperty(EMPLOYER_COL);
      // The hire keeps saying it is a hire. This is the bug, in one assertion.
      expect(data).not.toHaveProperty('status');
    });

    it('unarchives by clearing the timestamp', async () => {
      const prisma = makePrisma();
      await new ApplicationRepository(prisma as never).setArchivedByCandidate('a1', false);

      expect(prisma.application.update.mock.calls[0][0].data[CANDIDATE_COL]).toBeNull();
    });
  });

  describe('the employer side', () => {
    it('hides only what the EMPLOYER archived', async () => {
      const prisma = makePrisma();
      await new EmployerApplicationRepository(prisma as never).findForCompany({
        companyId: 'c1', skip: 0, take: 20,
      });

      const { where } = prisma.application.findMany.mock.calls[0][0];
      expect(where[EMPLOYER_COL]).toBeNull();
      // The candidate's housekeeping must not remove a candidate from this board.
      expect(where).not.toHaveProperty(CANDIDATE_COL);
    });

    it('can show them again on request', async () => {
      const prisma = makePrisma();
      await new EmployerApplicationRepository(prisma as never).findForCompany({
        companyId: 'c1', includeArchived: true, skip: 0, take: 20,
      });

      const { where } = prisma.application.findMany.mock.calls[0][0];
      expect(where).not.toHaveProperty(EMPLOYER_COL);
    });

    it('writes only the employer column, and never a status', async () => {
      const prisma = makePrisma();
      await new EmployerApplicationRepository(prisma as never)
        .setArchivedByEmployer('a1', 'emp-1', true);

      const { data } = prisma.application.update.mock.calls[0][0];
      expect(data[EMPLOYER_COL]).toBeInstanceOf(Date);
      expect(data).not.toHaveProperty(CANDIDATE_COL);
      expect(data).not.toHaveProperty('status');
    });
  });
});
