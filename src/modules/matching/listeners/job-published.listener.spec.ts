import { Logger } from '@nestjs/common';
import { JobPublishedListener } from './job-published.listener';

describe('JobPublishedListener', () => {
  let embeddings: { embedJob: jest.Mock };
  let staleness: { markStaleForJob: jest.Mock; removeForClosedJob: jest.Mock };
  let listener: JobPublishedListener;

  beforeEach(() => {
    embeddings = { embedJob: jest.fn().mockResolvedValue(true) };
    staleness = {
      markStaleForJob: jest.fn().mockResolvedValue(3),
      removeForClosedJob: jest.fn().mockResolvedValue(2),
    };
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    listener = new JobPublishedListener(embeddings as never, staleness as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(['onPublished', 'onUpdated'] as const)(
    '%s re-embeds the job before invalidating cached recommendations',
    async (handler) => {
      await listener[handler]({ jobId: 'j1' });

      expect(embeddings.embedJob).toHaveBeenCalledWith('j1');
      expect(staleness.markStaleForJob).toHaveBeenCalledWith('j1');
    },
  );

  it('does not invalidate when embedding is unavailable', async () => {
    embeddings.embedJob.mockResolvedValue(false);

    await listener.onUpdated({ jobId: 'j1' });

    expect(staleness.markStaleForJob).not.toHaveBeenCalled();
  });

  it('removes every cached recommendation when a job closes', async () => {
    await listener.onClosed({ jobId: 'j1' });

    expect(embeddings.embedJob).not.toHaveBeenCalled();
    expect(staleness.removeForClosedJob).toHaveBeenCalledWith('j1');
  });
});
