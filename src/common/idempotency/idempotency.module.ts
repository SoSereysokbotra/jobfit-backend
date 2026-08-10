// src/common/idempotency/idempotency.module.ts
//
// Global so IdempotencyService is injectable by the app-wide interceptor (registered in
// AppModule) and by the admin cleanup route, without either having to import this module.
// PrismaModule is itself @Global, so nothing else needs wiring here.

import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

@Global()
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
