// src/infra/ai/ai-availability.service.spec.ts
//
// The rule under test is the one that makes this service worth having: REAL CALL OUTCOMES
// BEAT A PROBE, and "no evidence" is reported as `unknown` rather than guessed as `up`.
//
// The AI service's own /health returns {"status":"ok"} with Ollama offline, so anything
// that trusted a probe over observed behaviour would paint green through a total outage
// (docs/AI_DEGRADATION_PLAN.md §1).

import { Logger } from '@nestjs/common';
import { AiAvailabilityService } from './ai-availability.service';
import type { AiReady } from './ai.types';

type Listener = (outcome: 'success' | 'error', code: string, detail: string) => void;

describe('AiAvailabilityService', () => {
  let listener: Listener;
  let ready: jest.Mock<Promise<AiReady>, []>;
  let service: AiAvailabilityService;

  const build = (readyResult: AiReady = { status: 'ready' }) => {
    ready = jest.fn().mockResolvedValue(readyResult);
    const client = {
      onOutcome: (fn: Listener) => {
        listener = fn;
      },
      ready,
    };
    const svc = new AiAvailabilityService(client as never);
    svc.onModuleInit();
    return svc;
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    service = build();
  });

  afterEach(() => jest.restoreAllMocks());

  describe('state from real calls', () => {
    it('is unknown before anything has happened — never a guess', () => {
      // A readiness endpoint that claims "up" on no data is the exact failure this
      // service exists to avoid.
      expect(service.snapshot().state).toBe('unknown');
    });

    it('is up after a successful call', () => {
      listener('success', '', '');
      expect(service.snapshot().state).toBe('up');
    });

    it('is down when every recent call failed, and carries the reason', () => {
      listener('error', 'TIMEOUT', 'AI request to /resume/parse timed out after 60000ms');

      const snap = service.snapshot();
      expect(snap.state).toBe('down');
      expect(snap.reason).toBe('TIMEOUT');
      expect(snap.detail).toMatch(/timed out/);
    });

    it('is degraded when some calls land and some fail', () => {
      // The real shape of a struggling GPU: fast embeds land, slow parses time out.
      listener('success', '', '');
      listener('error', 'TIMEOUT', 'parse timed out');

      const snap = service.snapshot();
      expect(snap.state).toBe('degraded');
      expect(snap.recent).toEqual({ success: 1, error: 1 });
    });

    it('reports the LATEST error, not the first', () => {
      listener('error', 'NETWORK', 'connection refused');
      listener('error', 'MODEL_ERROR', 'Ollama returned 500');

      expect(service.snapshot().reason).toBe('MODEL_ERROR');
    });

    it('recovers to up once failures age out of the window', () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-08-25T10:00:00Z'));
      listener('error', 'TIMEOUT', 'timed out');
      expect(service.snapshot().state).toBe('down');

      // Three minutes later, past the two-minute window.
      jest.setSystemTime(new Date('2026-08-25T10:03:00Z'));
      listener('success', '', '');

      expect(service.snapshot().state).toBe('up');
      jest.useRealTimers();
    });
  });

  describe('the /ready probe', () => {
    it('is not consulted when recent calls already answer', async () => {
      listener('success', '', '');

      await service.refresh();

      // A probe costs a round trip to learn less than we already know.
      expect(ready).not.toHaveBeenCalled();
    });

    it('is consulted when nothing has been called', async () => {
      const snap = await service.refresh();

      expect(ready).toHaveBeenCalledTimes(1);
      expect(snap.state).toBe('up');
    });

    it('reports down with the reason when /ready says not_ready', async () => {
      service = build({
        status: 'not_ready',
        reason: 'MODEL_NOT_INSTALLED',
        detail: 'qwen3:4b is not installed',
        missing: ['qwen3:4b'],
      });

      const snap = await service.refresh();

      expect(snap.state).toBe('down');
      expect(snap.reason).toBe('MODEL_NOT_INSTALLED');
      expect(snap.missing).toEqual(['qwen3:4b']);
    });

    it('does not re-probe inside the cooldown', async () => {
      await service.refresh();
      await service.refresh();
      await service.refresh();

      // /health/ready is polled continuously by Cloud Run; one probe per cooldown.
      expect(ready).toHaveBeenCalledTimes(1);
    });

    it('shares one in-flight probe between concurrent callers', async () => {
      await Promise.all([service.refresh(), service.refresh(), service.refresh()]);

      expect(ready).toHaveBeenCalledTimes(1);
    });

    it('lets a real call override a stale "ready" probe', async () => {
      await service.refresh();
      expect(service.snapshot().state).toBe('up');

      listener('error', 'NETWORK', 'connection refused');

      // The probe said ready; an actual call just proved otherwise. Proof wins.
      expect(service.snapshot().state).toBe('down');
    });
  });

  it('never throws when the probe itself misbehaves', async () => {
    // AiClient.ready() is contracted never to throw, and today it does not. This must not
    // depend on that: the caller is a readiness endpoint, and a health check that 500s
    // because its own probe threw is worse than one reporting "cannot tell".
    service = build();
    ready.mockRejectedValue(new Error('boom'));

    const snap = await service.refresh();

    expect(snap.state).toBe('down');
    expect(snap.reason).toBe('PROBE_FAILED');
    expect(snap.detail).toMatch(/boom/);
  });

  it('does not retry a thrown probe inside the cooldown either', async () => {
    service = build();
    ready.mockRejectedValue(new Error('boom'));

    await service.refresh();
    await service.refresh();

    // A failing probe must not become a hot loop against a service that is already sick.
    expect(ready).toHaveBeenCalledTimes(1);
  });
});
