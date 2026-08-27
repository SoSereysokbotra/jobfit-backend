import { Global, Module } from '@nestjs/common';

import { MetricsModule } from '@modules/metrics/metrics.module';
import { AiClient } from './ai.client';
import { AiAvailabilityService } from './ai-availability.service';

/**
 * AiModule — the backend's single door to jobfits-ai-service.
 *
 * `@Global` so any feature module (resume, matching, generation…) can inject
 * {@link AiClient} without re-importing. Config comes from the global
 * ConfigModule (`ai.*`, loaded in app.module.ts).
 *
 * Imports MetricsModule so every AI call is counted in one place — being the single door
 * is exactly what makes this the right place to measure GPU and paid-API load
 * (MENTOR_REVIEW_2026-08-18 §11). AiClient takes MetricsService as an @Optional
 * dependency, so nothing here is load-bearing for behaviour.
 */
@Global()
@Module({
  imports: [MetricsModule],
  providers: [AiClient, AiAvailabilityService],
  exports: [AiClient, AiAvailabilityService],
})
export class AiModule {}
