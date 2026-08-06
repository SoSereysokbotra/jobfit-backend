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

  const makeJob = (sourceType: 'INTERNAL' | 'EXTERNAL', externalUrl?: string) => ({
    id: 'j1',
    sourceType,
    externalUrl,
    isApplicableInApp: sourceType === 'INTERNAL',
  });

  let applicationRepository: {
    findByUserAndJob: jest.Mock;
    save: jest.Mock;
  };
  let timelineRepository: { addEvent: jest.Mock };
  let userRepository: { findById: jest.Mock };
  let jobRepository: { findById: jest.Mock };
  let eventBus: { publish: jest.Mock };
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

    service = new ApplicationService(
      applicationRepository as never,
      timelineRepository as never,
      {} as never, // contactPersonRepository — unused on this path
      userRepository as never,
      jobRepository as never,
      eventBus as never,
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

  it('accepts an INTERNAL job', async () => {
    jobRepository.findById.mockResolvedValue(makeJob('INTERNAL'));

    const application = await service.submitApplication('u1', {
      jobId: 'j1',
    } as never);

    expect(application.jobId).toBe('j1');
    expect(applicationRepository.save).toHaveBeenCalledTimes(1);
    expect(timelineRepository.addEvent).toHaveBeenCalledTimes(1);
  });

  it('still rejects a duplicate application to an INTERNAL job', async () => {
    jobRepository.findById.mockResolvedValue(makeJob('INTERNAL'));
    applicationRepository.findByUserAndJob.mockResolvedValue({ id: 'existing' });

    await expect(
      service.submitApplication('u1', { jobId: 'j1' } as never),
    ).rejects.toThrow(BadRequestException);
  });
});
