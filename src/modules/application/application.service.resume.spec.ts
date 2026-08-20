// src/modules/application/application.service.resume.spec.ts
//
// "Which CV did you send, then?" — MENTOR_REVIEW_2026-08-18 §5.
//
// `Application.resumeId` existed but nothing wrote it carefully and nothing read it:
// a client-supplied id went onto the row with no ownership check, and an omitted one
// stored NULL even when the user had a default. Now that screening reads the column,
// both of those became live defects rather than latent ones.

import { BadRequestException } from '@nestjs/common';
import { ApplicationService } from './application.service';

describe('ApplicationService.submitApplication — which résumé gets recorded', () => {
  const INTERNAL_JOB = {
    id: 'j1',
    sourceType: 'INTERNAL' as const,
    externalUrl: undefined,
    isApplicableInApp: true,
  };

  let applicationRepository: { findByUserAndJob: jest.Mock; save: jest.Mock };
  let activeResume: { findActiveResumeId: jest.Mock };
  let prisma: { resume: { findFirst: jest.Mock } };
  let screening: { screen: jest.Mock };
  let service: ApplicationService;

  /** The resumeId actually persisted on the saved aggregate. */
  const savedResumeId = () =>
    (applicationRepository.save.mock.calls[0][0] as { resumeId?: string }).resumeId;

  beforeEach(() => {
    applicationRepository = {
      findByUserAndJob: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    activeResume = { findActiveResumeId: jest.fn().mockResolvedValue(null) };
    prisma = { resume: { findFirst: jest.fn().mockResolvedValue(null) } };
    screening = { screen: jest.fn().mockResolvedValue({ screened: true }) };

    service = new ApplicationService(
      applicationRepository as never,
      { transition: jest.fn().mockResolvedValue({}) } as never,
      { addEvent: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      { findById: jest.fn().mockResolvedValue({ id: 'u1' }) } as never,
      { findById: jest.fn().mockResolvedValue(INTERNAL_JOB) } as never,
      { publish: jest.fn().mockResolvedValue(undefined) } as never,
      screening as never,
      activeResume as never,
      prisma as never,
    );
  });

  it('records a résumé the caller owns', async () => {
    prisma.resume.findFirst.mockResolvedValue({ id: 'r-design' });

    await service.submitApplication('u1', {
      jobId: 'j1',
      resumeId: 'r-design',
    } as never);

    expect(prisma.resume.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r-design', userId: 'u1', deletedAt: null },
      }),
    );
    expect(savedResumeId()).toBe('r-design');
  });

  it('refuses a résumé belonging to someone else, and stores nothing', async () => {
    // findFirst is scoped by userId, so another user's résumé simply does not match.
    prisma.resume.findFirst.mockResolvedValue(null);

    await expect(
      service.submitApplication('u1', {
        jobId: 'j1',
        resumeId: 'r-someone-elses',
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(applicationRepository.save).not.toHaveBeenCalled();
    expect(screening.screen).not.toHaveBeenCalled();
  });

  it('does not leak whether that résumé exists at all', async () => {
    prisma.resume.findFirst.mockResolvedValue(null);

    await expect(
      service.submitApplication('u1', {
        jobId: 'j1',
        resumeId: 'r-someone-elses',
      } as never),
    ).rejects.toThrow(/does not belong to you/);
    // A 404 would confirm the id is real; a 400 with this wording does not.
  });

  it('ignores a soft-deleted résumé even if the caller owns it', async () => {
    // The `deletedAt: null` clause is what enforces this; assert it is in the query.
    prisma.resume.findFirst.mockResolvedValue(null);

    await expect(
      service.submitApplication('u1', { jobId: 'j1', resumeId: 'r-old' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.resume.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  it('back-fills the default résumé when the client omits one', async () => {
    activeResume.findActiveResumeId.mockResolvedValue('r-default');

    await service.submitApplication('u1', { jobId: 'j1' } as never);

    expect(activeResume.findActiveResumeId).toHaveBeenCalledWith('u1');
    // Previously stored NULL here, leaving the application unattributable forever.
    expect(savedResumeId()).toBe('r-default');
  });

  it('still lets a user with no résumé apply, recording none', async () => {
    activeResume.findActiveResumeId.mockResolvedValue(null);

    await service.submitApplication('u1', { jobId: 'j1' } as never);

    expect(applicationRepository.save).toHaveBeenCalled();
    // NULL means "there was no CV to record", not "we forgot" — and must not block a
    // candidate who has not uploaded one.
    expect(savedResumeId()).toBeUndefined();
  });

  it('does not consult the default when the client named a résumé', async () => {
    prisma.resume.findFirst.mockResolvedValue({ id: 'r-design' });

    await service.submitApplication('u1', {
      jobId: 'j1',
      resumeId: 'r-design',
    } as never);

    expect(activeResume.findActiveResumeId).not.toHaveBeenCalled();
  });
});
