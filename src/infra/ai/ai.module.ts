import { Global, Module } from '@nestjs/common';

import { AiClient } from './ai.client';

/**
 * AiModule — the backend's single door to jobfits-ai-service.
 *
 * `@Global` so any feature module (resume, matching, generation…) can inject
 * {@link AiClient} without re-importing. Config comes from the global
 * ConfigModule (`ai.*`, loaded in app.module.ts).
 */
@Global()
@Module({
  providers: [AiClient],
  exports: [AiClient],
})
export class AiModule {}
