// Guards the internal/external application rule.
//
// Before Job.sourceType existed a user could click "Apply" on all 51 published jobs, but 43
// were ingested from TheMuse — no employer in JobFits receives those, and the real posting
// lives elsewhere. The application was stored and the user believed they had applied for a
// job they had not applied for. Enforcement lives here, in the service: a UI that merely
// hides the button is not a guarantee.

import { BadRequestException } from '@nestjs/common';
import { ApplicationService } from './application.service';

describe('ApplicationService.submitApplication — internal vs external', () => {
  const user = { id: 'u1' };

  // `status` is a JobStatus value object on the real entity, and submitApplication now
  // refuses anything that is not PUBLISHED — a draft is not an invitation to apply.
  // These fixtures are published unless a test says otherwise.
  const makeJob = (
    sourceType: 'INTERNAL' | 'EXTERNAL',
    externalUrl?: string,
    isPublished = true,
  ) => ({
    id: 'j1',
    sourceType,
    externalUrl,
    isApplicableInApp: sourceType === 'INTERNAL',
    status: { isPublished: () => isPublished },
  });

  let applicationRepository: {
    findByUserAndJob: jest.Mock;
    save: jest.Mock;
  };
  let timelineRepository: { addEvent: jest.Mock };
  let userRepository: { findById: jest.Mock };
  let jobRepository: { findById: jest.Mock };
  let eventBus: { publish: jest.Mock };
  let screening: { screen: jest.Mock };
  let activeResume: { findActiveResumeId: jest.Mock };
  let prisma: { resume: { findFirst: jest.Mock } };
  let service: ApplicationService;

  beforeEach(() => {
    applicationRepository = {
      findByUserAndJob: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    timelineRepository = { addEvent: jest.fn().mockResolvedValue(undefined) };
    userRepository = { findById: jest.fn().mockResolvedValue(user) };
    jobRepository = { findById: jest.fn() };
    eventBus = { publish: jest.fn().mockResolvedValue(undefined) };
    screening = { screen: jest.fn().mockResolvedValue({ screened: true }) };
    // No default résumé unless a test says otherwise.
    activeResume = { findActiveResumeId: jest.fn().mockResolvedValue(null) };
    prisma = { resume: { findFirst: jest.fn().mockResolvedValue(null) } };

    service = new ApplicationService(
      applicationRepository as never,
      { transition: jest.fn().mockResolvedValue({}) } as never, // transitions — not on the apply path
      timelineRepository as never,
      {} as never, // contactPersonRepository — unused on this path
      userRepository as never,
      jobRepository as never,
      eventBus as never,
      screening as never,
      activeResume as never,
      prisma as never,
    );
  });

  it('refuses an EXTERNAL job and hands back the real posting URL', async () => {
    jobRepository.findById.mockResolvedValue(
      makeJob('EXTERNAL', 'https://themuse.com/jobs/123'),
    );

    await expect(
      service.submitApplication('u1', { jobId: 'j1' } as never),
    ).rejects.toThrow(BadRequestException);

    // Nothing is persisted — a stored row is exactly the lie this rule prevents.
    expect(applicationRepository.save).not.toHaveBeenCalled();
    expect(timelineRepository.addEvent).not.toHaveBeenCalled();
  });

  it('includes externalUrl in the error so the client can redirect', async () => {
    jobRepository.findById.mockResolvedValue(
      makeJob('EXTERNAL', 'https://themuse.com/jobs/123'),
    );

    const error = await service
      .submitApplication('u1', { jobId: 'j1' } as never)
      .catch((e: BadRequestException) => e);

    expect((error as BadRequestException).getResponse()).toMatchObject({
      externalUrl: 'https://themuse.com/jobs/123',
      sourceType: 'EXTERNAL',
    });
  });

  it('still refuses when an EXTERNAL job has no externalUrl recorded', async () => {
    // A missing URL is a data gap, not permission to accept an application that
    // nobody will ever receive.
    jobRepository.findById.mockResolvedValue(makeJob('EXTERNAL', undefined));

    await expect(
      service.submitApplication('u1', { jobId: 'j1' } as never),
    ).rejects.toThrow(BadRequestException);
    expect(applicationRepository.save).not.toHaveBeenCalled();
  });

  it('refuses a job that is not published, and stores nothing', async () => {
    // A DRAFT is a half-written posting the employer has not released. The public
    // listing hides drafts, and this is the guard behind that: a guessed job id must
    // not be able to create the application row the listing refuses to show. Found by
    // the 2026-08-30 end-to-end run, where a seeker applied to an unpublished job and
    // it entered the employer's pipeline — see docs/EMPLOYER_E2E_FINDINGS.md finding 1.
    jobRepository.findById.mockResolvedValue(makeJob('INTERNAL', undefined, false));

    await expect(
      service.submitApplication('u1', { jobId: 'j1' } as never),
    ).rejects.toThrow(BadRequestException);
    expect(applicationRepository.save).not.toHaveBeenCalled();
    expect(timelineRepository.addEvent).not.toHaveBeenCalled();
    expect(screening.screen).not.toHaveBeenCalled();
  });

  it('accepts an INTERNAL job', async () => {
    jobRepository.findById.mockResolvedValue(makeJob('INTERNAL'));

    const application = await service.submitApplication('u1', {
      jobId: 'j1',
    } as never);

    expect(application.jobId).toBe('j1');
    expect(applicationRepository.save).toHaveBeenCalledTimes(1);
    expect(timelineRepository.addEvent).toHaveBeenCalledTimes(1);
  });

  it('screens the application after accepting it', async () => {
    jobRepository.findById.mockResolvedValue(makeJob('INTERNAL'));

    const application = await service.submitApplication('u1', { jobId: 'j1' } as never);

    expect(screening.screen).toHaveBeenCalledWith(application.id);
  });

  it('does not screen an application it refused', async () => {
    jobRepository.findById.mockResolvedValue(makeJob('EXTERNAL', 'https://themuse.com/1'));

    await service
      .submitApplication('u1', { jobId: 'j1' } as never)
      .catch(() => undefined);

    expect(screening.screen).not.toHaveBeenCalled();
  });

  it('still rejects a duplicate application to an INTERNAL job', async () => {
    jobRepository.findById.mockResolvedValue(makeJob('INTERNAL'));
    applicationRepository.findByUserAndJob.mockResolvedValue({ id: 'existing' });

    await expect(
      service.submitApplication('u1', { jobId: 'j1' } as never),
    ).rejects.toThrow(BadRequestException);
  });
});
