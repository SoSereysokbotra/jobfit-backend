// R2, caller side: what the user is told when parsing could not be scheduled.
//
// By the time the enqueue runs, the upload has ALREADY succeeded — the file is in
// storage and the row is saved. So a queue outage must not fail the request (that would
// orphan the file); it must stop the row claiming something untrue. `PENDING` means "a
// worker will pick this up", and if nothing was scheduled the user watches a spinner
// that never resolves.

import { QueueUnavailableError } from '@infra/queue/bull-queue.service';
import { Logger } from '@nestjs/common';
import { ResumeService } from './resume.service';

describe('ResumeService.uploadResume — when the queue is unavailable', () => {
  let resumeRepository: { save: jest.Mock; findDefaultByUserId: jest.Mock };
  let queue: { addJob: jest.Mock };
  let service: ResumeService;

  const file = {
    originalname: 'cv.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('x'),
  };

  /** The entity as persisted by the LAST save() call. */
  const lastSaved = () =>
    resumeRepository.save.mock.calls[resumeRepository.save.mock.calls.length - 1][0];

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    resumeRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findDefaultByUserId: jest.fn().mockResolvedValue(null),
    };
    queue = { addJob: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    service = new ResumeService(
      resumeRepository as never,
      { findById: jest.fn().mockResolvedValue({ id: 'u1' }) } as never,
      { upload: jest.fn().mockResolvedValue('https://storage/cv.pdf') } as never,
      queue as never,
      { publish: jest.fn().mockResolvedValue(undefined) } as never,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('still returns the résumé — the file is stored, do not orphan it', async () => {
    queue.addJob.mockRejectedValue(new QueueUnavailableError('addJob', 5000));

    const resume = await service.uploadResume('u1', file as never, 'My CV');

    expect(resume).toBeDefined();
    expect(resume.fileUrl).toBe('https://storage/cv.pdf');
  });

  it('marks the résumé FAILED rather than leaving it PENDING forever', async () => {
    queue.addJob.mockRejectedValue(new QueueUnavailableError('addJob', 5000));

    await service.uploadResume('u1', file as never, 'My CV');

    // PENDING would promise a worker that was never scheduled.
    expect(lastSaved().parsingStatus).toBe('FAILED');
  });

  it('records a reason the user can act on', async () => {
    queue.addJob.mockRejectedValue(new QueueUnavailableError('addJob', 5000));

    await service.uploadResume('u1', file as never, 'My CV');

    expect(lastSaved().parsingError).toMatch(/queue is unavailable/i);
    expect(lastSaved().parsingError).toMatch(/try again/i);
  });

  it('persists the corrected status — not just an in-memory mutation', async () => {
    queue.addJob.mockRejectedValue(new QueueUnavailableError('addJob', 5000));

    await service.uploadResume('u1', file as never, 'My CV');

    // Saved once for the initial row, once more to correct it.
    expect(resumeRepository.save).toHaveBeenCalledTimes(2);
  });

  it('leaves the résumé PENDING when the queue is healthy', async () => {
    await service.uploadResume('u1', file as never, 'My CV');

    expect(lastSaved().parsingStatus).toBe('PENDING');
    expect(resumeRepository.save).toHaveBeenCalledTimes(1);
  });

  it('does not swallow a non-queue error', async () => {
    queue.addJob.mockRejectedValue(new Error('something else entirely'));

    // Only queue unavailability is recoverable here. Anything else is a real bug and
    // must not be recorded as "the queue was down".
    await expect(
      service.uploadResume('u1', file as never, 'My CV'),
    ).rejects.toThrow('something else entirely');
  });
});
