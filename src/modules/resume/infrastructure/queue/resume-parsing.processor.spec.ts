// src/modules/resume/infrastructure/queue/resume-parsing.processor.spec.ts
//
// Redis audit R5: there was no @OnWorkerEvent('failed') handler, so a worker-level crash
// was completely silent — the résumé stayed PENDING and nothing anywhere said why.
//
// Reaching 'failed' at all is significant here: ResumeParserService catches its own
// errors and records FAILED on the row, so a bad résumé RESOLVES the job. A failure event
// means the worker itself came apart.

import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ResumeParsingProcessor } from './resume-parsing.processor';
import { ResumeParserService } from '../../application/services/resume-parser.service';

function jobOf(over: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    name: 'parseResume',
    data: { resumeId: 'resume-1', fileUrl: 'https://x/f.pdf', fileType: 'pdf' },
    opts: { attempts: 3 },
    attemptsMade: 1,
    ...over,
  } as unknown as Job;
}

describe('ResumeParsingProcessor', () => {
  let parseResume: jest.Mock;
  let processor: ResumeParsingProcessor;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    parseResume = jest.fn().mockResolvedValue(undefined);
    processor = new ResumeParsingProcessor({
      parseResume,
    } as unknown as ResumeParserService);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('process', () => {
    it('delegates a parseResume job to the parser', async () => {
      await processor.process(jobOf() as Job<never>);

      expect(parseResume).toHaveBeenCalledWith(
        'resume-1',
        'https://x/f.pdf',
        'pdf',
      );
    });

    it('ignores a job name it does not own', async () => {
      await processor.process(jobOf({ name: 'somethingElse' }) as Job<never>);

      expect(parseResume).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('somethingElse'),
      );
    });
  });

  describe('onFailed (R5)', () => {
    it('logs a worker-level failure instead of swallowing it', () => {
      processor.onFailed(jobOf(), new Error('worker killed'));

      expect(errorSpy).toHaveBeenCalled();
      const message = errorSpy.mock.calls[0][0] as string;
      // The résumé id is the only thing that lets someone connect this line to a user's
      // stuck upload.
      expect(message).toContain('resume-1');
      expect(message).toContain('worker killed');
    });

    it('says a retry is still coming while attempts remain', () => {
      processor.onFailed(
        jobOf({ attemptsMade: 1, opts: { attempts: 3 } as Job['opts'] }),
        new Error('ECONNRESET'),
      );

      expect(errorSpy.mock.calls[0][0]).toContain('will retry');
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('says GIVING UP on the last attempt, and warns the row will not change', () => {
      processor.onFailed(
        jobOf({ attemptsMade: 3, opts: { attempts: 3 } as Job['opts'] }),
        new Error('ECONNRESET'),
      );

      expect(errorSpy.mock.calls[0][0]).toContain('GIVING UP');
      // A second line, because "this job failed" and "this résumé is now stuck" are
      // different facts and only the second one is actionable.
      expect(errorSpy).toHaveBeenCalledTimes(2);
      expect(errorSpy.mock.calls[1][0]).toContain('resume-1');
    });

    it('survives a failure event with no job attached', () => {
      // BullMQ can emit 'failed' with an undefined job (e.g. a job that vanished).
      expect(() =>
        processor.onFailed(undefined, new Error('job missing')),
      ).not.toThrow();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('onError (R5)', () => {
    it('reports a worker error that is not tied to a job', () => {
      processor.onError(new Error('connection lost'));

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('connection lost'),
      );
    });
  });
});
