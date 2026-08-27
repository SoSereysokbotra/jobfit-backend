// src/modules/health/indicators/ai.health-indicator.ts
//
// Readiness visibility for the AI service (docs/AI_DEGRADATION_PLAN.md §6).
//
// DESIGN: SOFT, like Redis and mail. It never marks readiness `down`. An instance whose
// AI is unavailable still serves every non-AI route correctly — registration, applying,
// screening, the employer pipeline — and pulling it out of the load balancer would take
// those down too, turning a partial outage into a total one. It annotates
// `degraded: true` with the impact named instead, so /health/ready surfaces the problem
// and a client can check it proactively rather than discovering it through a 60-second
// hang.
//
// SOURCE OF TRUTH: AiAvailabilityService, which derives state from real call outcomes
// first and a /ready probe only when recent calls say nothing.
//
// It deliberately does NOT read the AI service's own `/health`. That endpoint returns
// `{"status":"ok"}` with Ollama offline — it reports the FastAPI process, not the models
// — so a probe against it would paint this indicator green through a total outage. A
// health check that reads green during an outage is worse than none.

import { Injectable } from '@nestjs/common';
import {
  HealthIndicatorService,
  type HealthIndicatorResult,
} from '@nestjs/terminus';

import { AiAvailabilityService } from '@infra/ai/ai-availability.service';

const IMPACT: Record<string, string> = {
  down:
    'résumé parsing, fresh match scores and AI writing are unavailable; ' +
    'applying, screening and saved matches are unaffected',
  degraded:
    'some AI calls are failing — slow operations (parsing, generation) fail first; ' +
    'cached matches and applying are unaffected',
  unknown: 'AI has not been exercised yet, and no probe has run',
};

@Injectable()
export class AiHealthIndicator {
  constructor(
    private readonly availability: AiAvailabilityService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  /**
   * Always `up` (soft), annotated with the real AI state.
   *
   * `async` because it may probe `/ready` when no recent call has reported — but only
   * when nothing else can answer, and at most once per cooldown, so a continuously-polled
   * readiness endpoint does not turn into a continuous probe.
   */
  async isHealthy(key = 'ai'): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    const snap = await this.availability.refresh();

    // `unknown` is NOT degraded. Right after boot nothing has been called and no probe
    // has resolved; reporting that as a problem would make every cold start look like an
    // outage.
    const degraded = snap.state === 'down' || snap.state === 'degraded';

    return indicator.up({
      state: snap.state,
      recent: snap.recent,
      ...(snap.reason ? { reason: snap.reason } : {}),
      ...(snap.detail ? { detail: snap.detail } : {}),
      ...(snap.missing?.length ? { missingModels: snap.missing } : {}),
      ...(snap.lastSuccessAt ? { lastSuccessAt: snap.lastSuccessAt } : {}),
      ...(snap.lastErrorAt ? { lastErrorAt: snap.lastErrorAt } : {}),
      ...(snap.probedAt ? { probedAt: snap.probedAt } : {}),
      ...(degraded ? { degraded: true, impact: IMPACT[snap.state] } : {}),
      ...(snap.state === 'unknown' ? { note: IMPACT.unknown } : {}),
    });
  }
}
