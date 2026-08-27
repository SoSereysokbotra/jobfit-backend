// The rule: silent degradation is a production virtue and a development liability.
// These pin that the two environments genuinely differ — the original bug was that they
// did not (docs/AI_DEGRADATION_PLAN.md §6, item 1).

import { Logger } from '@nestjs/common';
import { AiServiceError } from './ai.errors';
import { aiFailuresAreLoud, logAiFallback } from './ai-degradation.logger';

describe('AI degradation logging', () => {
  const original = process.env.NODE_ENV;
  let logger: Logger;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    logger = new Logger('test');
    warn = jest.spyOn(logger, 'warn').mockImplementation();
    error = jest.spyOn(logger, 'error').mockImplementation();
  });

  afterEach(() => {
    process.env.NODE_ENV = original;
    jest.restoreAllMocks();
  });

  describe('aiFailuresAreLoud', () => {
    it('is quiet in production', () => {
      process.env.NODE_ENV = 'production';
      expect(aiFailuresAreLoud()).toBe(false);
    });

    it.each(['development', 'test', undefined])('is loud when NODE_ENV=%s', (env) => {
      if (env === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = env;
      // Defaults to loud: an unset NODE_ENV is someone's laptop, not a deployment.
      expect(aiFailuresAreLoud()).toBe(true);
    });
  });

  describe('logAiFallback', () => {
    const err = new AiServiceError('TIMEOUT', 'timed out after 60000ms');

    it('warns in production, without alarming wording', () => {
      process.env.NODE_ENV = 'production';

      logAiFallback(logger, err, 'Embedding', 'skipping 3 item(s)');

      expect(error).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Embedding unavailable (TIMEOUT); skipping 3 item(s)');
    });

    it('errors in development, and says the result is degraded', () => {
      process.env.NODE_ENV = 'development';

      logAiFallback(logger, err, 'Embedding', 'skipping 3 item(s)');

      expect(warn).not.toHaveBeenCalled();
      const msg = error.mock.calls[0][0] as string;
      // The whole point: a developer looking at this output must know the answer they
      // are about to judge is not what the product produces when the AI is up.
      expect(msg).toMatch(/THIS RESULT IS DEGRADED/);
      expect(msg).toMatch(/timed out after 60000ms/);
    });

    it('always carries the error code — it points at different fixes', () => {
      process.env.NODE_ENV = 'production';

      logAiFallback(logger, new AiServiceError('UNAUTHORIZED', 'bad key'), 'Rerank', 'x');

      // TIMEOUT means raise a limit; UNAUTHORIZED means fix a key; NETWORK means start
      // the service. Collapsing them to "AI failed" costs an investigation.
      expect(warn.mock.calls[0][0]).toMatch(/UNAUTHORIZED/);
    });

    it('handles a non-AiServiceError without throwing', () => {
      process.env.NODE_ENV = 'development';

      expect(() =>
        logAiFallback(logger, new Error('something else'), 'Parse', 'x'),
      ).not.toThrow();
      expect(error.mock.calls[0][0]).toMatch(/UNKNOWN/);
    });
  });
});
