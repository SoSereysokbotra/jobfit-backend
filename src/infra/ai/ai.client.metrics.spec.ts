// AiClient counts what it spends. MENTOR_REVIEW_2026-08-18 §11.
//
// The interesting assertions are the ones about NOT breaking: metrics are observability,
// so a missing or throwing MetricsService must never change what the AI call does.

import { AiClient } from './ai.client';
import { AiServiceError } from './ai.errors';

const config = {
  serviceUrl: 'http://ai.test/',
  serviceKey: 'k',
  timeoutMsEmbed: 1000,
  timeoutMsGenerate: 1000,
} as never;

function metricsSpy() {
  return { observeAiCall: jest.fn() };
}

function mockFetch(impl: jest.Mock) {
  (global as unknown as { fetch: unknown }).fetch = impl;
}

const okResponse = () => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve({ embeddings: [[0.1]] }),
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AiClient metrics', () => {
  it('counts a successful call with its operation and duration', async () => {
    const metrics = metricsSpy();
    mockFetch(jest.fn().mockResolvedValue(okResponse()));

    await new AiClient(config, metrics as never).embed(['hello']);

    expect(metrics.observeAiCall).toHaveBeenCalledTimes(1);
    const [labels, seconds] = metrics.observeAiCall.mock.calls[0];
    expect(labels).toEqual({ operation: '/embed', outcome: 'success' });
    expect(typeof seconds).toBe('number');
    expect(seconds).toBeGreaterThanOrEqual(0);
  });

  it('labels the operation by PATH, not by full URL', async () => {
    // The URL contains the host, which varies by environment. A host in the label would
    // split one metric into several series for no reason.
    const metrics = metricsSpy();
    mockFetch(jest.fn().mockResolvedValue(okResponse()));

    await new AiClient(config, metrics as never).embed(['x']);

    expect(metrics.observeAiCall.mock.calls[0][0].operation).toBe('/embed');
  });

  it('counts a 4xx as an error and does not retry it', async () => {
    const metrics = metricsSpy();
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: { code: 'BAD', message: 'no' } }),
      }),
    );

    await expect(
      new AiClient(config, metrics as never).embed(['x']),
    ).rejects.toBeInstanceOf(AiServiceError);

    expect(metrics.observeAiCall).toHaveBeenCalledTimes(1);
    expect(metrics.observeAiCall.mock.calls[0][0].outcome).toBe('error');
  });

  it('counts a RETRIED call twice — a retry is a second inference and a second bill', async () => {
    const metrics = metricsSpy();
    mockFetch(
      jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: { code: 'X', message: 'down' } }),
        })
        .mockResolvedValueOnce(okResponse()),
    );

    await new AiClient(config, metrics as never).embed(['x']);

    expect(metrics.observeAiCall).toHaveBeenCalledTimes(2);
    expect(metrics.observeAiCall.mock.calls.map((c) => c[0].outcome)).toEqual([
      'error',
      'success',
    ]);
  });

  it('counts a network failure', async () => {
    const metrics = metricsSpy();
    mockFetch(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));

    await expect(
      new AiClient(config, metrics as never).embed(['x']),
    ).rejects.toBeInstanceOf(AiServiceError);

    // Two attempts (one retry), both counted as errors.
    expect(metrics.observeAiCall).toHaveBeenCalledTimes(2);
    for (const [labels] of metrics.observeAiCall.mock.calls) {
      expect(labels.outcome).toBe('error');
    }
  });

  it('works with NO metrics service at all', async () => {
    // Every existing unit test constructs AiClient with a config alone. Optional
    // injection is what keeps that true.
    mockFetch(jest.fn().mockResolvedValue(okResponse()));

    await expect(new AiClient(config).embed(['x'])).resolves.toEqual({
      embeddings: [[0.1]],
    });
  });

  it('still returns the AI result when recording THROWS', async () => {
    const metrics = {
      observeAiCall: jest.fn(() => {
        throw new Error('registry exploded');
      }),
    };
    mockFetch(jest.fn().mockResolvedValue(okResponse()));

    await expect(
      new AiClient(config, metrics as never).embed(['x']),
    ).resolves.toEqual({ embeddings: [[0.1]] });
  });
});
