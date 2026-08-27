// src/infra/ai/ai-availability.service.ts
//
// "Will AI features actually work right now?" — asked in one place, from evidence.
//
// WHY THIS EXISTS AND NOT A HEALTH POLL. The AI service's own `/health` returns
// `{"status":"ok"}` with Ollama completely offline — it answers for the FastAPI process,
// not the models (verified: `jobfits-ai-service/app/routers/health.py` swallows the Ollama
// error and calls its status advisory). Anything that polled it would show green through a
// total outage, which is worse than having no signal at all.
//
// So availability is derived from two sources, in this order of trust:
//
//   1. REAL CALL OUTCOMES. A parse that just succeeded is proof; a probe is only an
//      opinion. AiClient calls `notify()` on every attempt and this service listens.
//   2. A /ready PROBE, used only when recent calls tell us nothing — a quiet period, or
//      right after boot. /ready reports whether the models are actually installed and
//      Ollama reachable, and a 503 from it is an ANSWER carrying the reason.
//
// WHAT THIS IS NOT. It is not a circuit breaker. Nothing here blocks a call or fails one
// early. Every AI-dependent path already degrades on its own (template cover letters,
// heuristic scoring, fused-order ranking, `parsingStatus: FAILED`), and adding a breaker
// would make this class load-bearing for behaviour rather than for reporting. It exists so
// `/health/ready` and the UI can say something true — see docs/AI_DEGRADATION_PLAN.md §6.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { AiClient } from './ai.client';

/** How the AI is behaving, as far as we can honestly tell. */
export type AiAvailabilityState = 'up' | 'degraded' | 'down' | 'unknown';

export interface AiAvailabilitySnapshot {
  state: AiAvailabilityState;
  /** Machine-readable cause when not `up` — e.g. TIMEOUT, NETWORK, MODEL_NOT_INSTALLED. */
  reason?: string;
  /** One sentence a human can act on. */
  detail?: string;
  /** Models /ready said were missing, when that is why. */
  missing?: string[];
  /** Outcomes counted in the current window. */
  recent: { success: number; error: number };
  /** When the last real call of each kind landed. */
  lastSuccessAt?: string;
  lastErrorAt?: string;
  /** When a /ready probe last ran, and what it said. */
  probedAt?: string;
}

/**
 * How long a real call outcome stays evidence.
 *
 * Long enough that a single slow minute does not erase what we know, short enough that a
 * recovery shows up on the next page load rather than ten minutes later.
 */
const WINDOW_MS = 2 * 60 * 1000;

/**
 * Don't re-probe more often than this. A probe costs a round trip and every readiness
 * check would otherwise trigger one — Cloud Run health checks run continuously.
 */
const PROBE_COOLDOWN_MS = 30 * 1000;

interface Outcome {
  at: number;
  ok: boolean;
  code: string;
  detail: string;
}

@Injectable()
export class AiAvailabilityService implements OnModuleInit {
  private readonly logger = new Logger(AiAvailabilityService.name);

  private outcomes: Outcome[] = [];
  private probe?: { at: number; ready: boolean; reason?: string; detail?: string; missing?: string[] };
  private probing?: Promise<void>;
  private lastReported?: AiAvailabilityState;

  constructor(private readonly client: AiClient) {}

  onModuleInit(): void {
    // Registered, not injected: AiAvailabilityService depends on AiClient, so injecting
    // this into the client would be a cycle. See AiClient.onOutcome.
    this.client.onOutcome((outcome, code, detail) => {
      this.outcomes.push({ at: Date.now(), ok: outcome === 'success', code, detail });
      this.prune();
      this.logTransition();
    });
  }

  /**
   * The current picture. Cheap and synchronous — safe to call from a health probe on
   * every request.
   *
   * Returns `unknown` rather than guessing when there is no evidence either way. A
   * readiness endpoint that claims "up" on no data is the exact failure this service was
   * written to avoid.
   */
  snapshot(): AiAvailabilitySnapshot {
    this.prune();
    const success = this.outcomes.filter((o) => o.ok).length;
    const error = this.outcomes.length - success;
    const lastSuccess = this.last(true);
    const lastError = this.last(false);

    const base = {
      recent: { success, error },
      lastSuccessAt: lastSuccess && new Date(lastSuccess.at).toISOString(),
      lastErrorAt: lastError && new Date(lastError.at).toISOString(),
      probedAt: this.probe && new Date(this.probe.at).toISOString(),
    };

    // 1. Real calls first — they are proof, and a probe is only an opinion.
    if (success > 0 && error === 0) return { ...base, state: 'up' };

    if (error > 0 && success === 0) {
      return {
        ...base,
        state: 'down',
        reason: lastError?.code || 'AI_CALL_FAILED',
        detail: lastError?.detail,
      };
    }

    if (success > 0 && error > 0) {
      // Both, in the same window: real but partial. Usually a timeout on the slow
      // operations (parse, generate) while the fast ones (embed) still land.
      return {
        ...base,
        state: 'degraded',
        reason: lastError?.code || 'INTERMITTENT',
        detail: lastError?.detail,
      };
    }

    // 2. No calls in the window — fall back to whatever the last probe said.
    if (this.probe) {
      return this.probe.ready
        ? { ...base, state: 'up' }
        : {
            ...base,
            state: 'down',
            reason: this.probe.reason,
            detail: this.probe.detail,
            missing: this.probe.missing,
          };
    }

    return { ...base, state: 'unknown', detail: 'No AI calls yet and no probe has run.' };
  }

  /**
   * Probe `/ready` if nothing recent tells us anything, then return the snapshot.
   *
   * Never throws — `AiClient.ready()` converts every failure into an `AiReady` body, so
   * an unreachable service is a `not_ready` answer rather than an exception. Concurrent
   * callers share one in-flight probe.
   */
  async refresh(): Promise<AiAvailabilitySnapshot> {
    if (this.shouldProbe()) {
      this.probing ??= this.runProbe().finally(() => {
        this.probing = undefined;
      });
      await this.probing;
    }
    return this.snapshot();
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private shouldProbe(): boolean {
    this.prune();
    // Recent real calls beat any probe — don't spend a round trip to learn less.
    if (this.outcomes.length > 0) return false;
    if (!this.probe) return true;
    return Date.now() - this.probe.at > PROBE_COOLDOWN_MS;
  }

  private async runProbe(): Promise<void> {
    try {
      const ready = await this.client.ready();
      this.probe = {
        at: Date.now(),
        ready: ready.status === 'ready',
        reason: ready.reason,
        detail: ready.detail,
        missing: ready.missing,
      };
    } catch (err) {
      // AiClient.ready() is contracted never to throw, and today it does not. This does
      // not rely on that: the caller is a readiness endpoint, and a health check that
      // 500s because its own probe misbehaved is strictly worse than one reporting
      // "cannot tell". Record the failure as a not-ready probe and carry on.
      this.probe = {
        at: Date.now(),
        ready: false,
        reason: 'PROBE_FAILED',
        detail: `The /ready probe itself threw: ${(err as Error).message}`,
      };
    }
    this.logTransition();
  }

  private prune(): void {
    const cutoff = Date.now() - WINDOW_MS;
    if (this.outcomes.length && this.outcomes[0].at < cutoff) {
      this.outcomes = this.outcomes.filter((o) => o.at >= cutoff);
    }
  }

  private last(ok: boolean): Outcome | undefined {
    for (let i = this.outcomes.length - 1; i >= 0; i--) {
      if (this.outcomes[i].ok === ok) return this.outcomes[i];
    }
    return undefined;
  }

  /**
   * Log only when the state CHANGES.
   *
   * Every AI call would otherwise write a line, and an outage would bury its own cause in
   * repetition. A transition is the thing worth seeing in a log.
   */
  private logTransition(): void {
    const { state, reason, detail } = this.snapshot();
    if (state === this.lastReported) return;
    this.lastReported = state;

    const message = `AI availability: ${state}${reason ? ` (${reason})` : ''}${detail ? ` — ${detail}` : ''}`;
    if (state === 'down') this.logger.error(message);
    else if (state === 'degraded') this.logger.warn(message);
    else this.logger.log(message);
  }
}
