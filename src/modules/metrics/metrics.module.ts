// src/modules/metrics/metrics.module.ts
//
// Phase 3 — Prometheus metrics. Registers the HTTP metrics interceptor GLOBALLY
// (APP_INTERCEPTOR) so every request is timed/counted. PrismaService (global) + ConfigService
// are injected by MetricsService.

import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsGuard } from './metrics.guard';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';

@Module({
  controllers: [MetricsController],
  providers: [
    MetricsService,
    MetricsGuard,
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
  exports: [MetricsService],
})
export class MetricsModule {}
