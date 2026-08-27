import { HealthIndicatorService } from '@nestjs/terminus';
import {
  AiAvailabilityService,
  type AiAvailabilitySnapshot,
} from '@infra/ai/ai-availability.service';
import { AiHealthIndicator } from './ai.health-indicator';

const makeHealthIndicatorService = () =>
  ({
    check: (key: string) => ({
      up: (data?: Record<string, unknown>) => ({
        [key]: { status: 'up', ...data },
      }),
      down: (data?: Record<string, unknown>) => ({
        [key]: { status: 'down', ...data },
      }),
    }),
  }) as unknown as HealthIndicatorService;

const makeAvailability = (snap: Partial<AiAvailabilitySnapshot>) =>
  ({
    refresh: jest.fn().mockResolvedValue({
      state: 'up',
      recent: { success: 0, error: 0 },
      ...snap,
    }),
  }) as unknown as AiAvailabilityService;

const build = (snap: Partial<AiAvailabilitySnapshot>) =>
  new AiHealthIndicator(makeAvailability(snap), makeHealthIndicatorService());

describe('AiHealthIndicator (soft / annotated)', () => {
  it('reports up and undegraded when the AI is working', async () => {
    const result = await build({
      state: 'up',
      recent: { success: 3, error: 0 },
    }).isHealthy('ai');

    expect(result.ai.status).toBe('up');
    expect(result.ai.state).toBe('up');
    expect(result.ai.degraded).toBeUndefined();
  });

  it('stays up but degraded when the AI is down', async () => {
    const result = await build({
      state: 'down',
      reason: 'TIMEOUT',
      detail: 'AI request to /resume/parse timed out after 60000ms',
      recent: { success: 0, error: 2 },
    }).isHealthy('ai');

    // SOFT, like Redis and mail. An instance with no AI still serves registration,
    // applying, screening and the employer pipeline — marking readiness `down` would
    // turn a partial outage into a total one.
    expect(result.ai.status).toBe('up');
    expect(result.ai.degraded).toBe(true);
    expect(result.ai.reason).toBe('TIMEOUT');
    expect(result.ai.impact).toMatch(/applying, screening/);
  });

  it('names what still works in the impact line', async () => {
    const result = await build({ state: 'down' }).isHealthy('ai');

    // The impact must tell an operator what is NOT broken, or a red line reads as
    // "everything is down" and someone rolls back a healthy deploy.
    expect(result.ai.impact).toMatch(/unaffected/);
  });

  it('marks partial failure as degraded too', async () => {
    const result = await build({
      state: 'degraded',
      reason: 'INTERMITTENT',
      recent: { success: 2, error: 1 },
    }).isHealthy('ai');

    expect(result.ai.status).toBe('up');
    expect(result.ai.degraded).toBe(true);
    expect(result.ai.recent).toEqual({ success: 2, error: 1 });
  });

  it('is NOT degraded when nothing has been exercised yet', async () => {
    const result = await build({ state: 'unknown' }).isHealthy('ai');

    // Right after boot no call has run and no probe has resolved. Reporting that as a
    // problem would make every cold start look like an outage.
    expect(result.ai.degraded).toBeUndefined();
    expect(result.ai.state).toBe('unknown');
    expect(result.ai.note).toMatch(/has not been exercised/);
  });

  it('surfaces missing models when that is the cause', async () => {
    const result = await build({
      state: 'down',
      reason: 'MODEL_NOT_INSTALLED',
      missing: ['qwen3:4b'],
    }).isHealthy('ai');

    // "Which model" is the difference between a five-second fix and an investigation.
    expect(result.ai.missingModels).toEqual(['qwen3:4b']);
  });

  it('omits empty optional fields rather than reporting nulls', async () => {
    const result = await build({ state: 'up' }).isHealthy('ai');

    expect(result.ai).not.toHaveProperty('reason');
    expect(result.ai).not.toHaveProperty('missingModels');
    expect(result.ai).not.toHaveProperty('lastErrorAt');
  });
});
