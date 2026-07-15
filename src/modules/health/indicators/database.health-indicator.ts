// src/modules/health/indicators/database.health-indicator.ts
//
// Phase 3 — readiness HARD dependency. A failing DB probe marks readiness `down`, which
// makes GET /health/ready return 503 so Cloud Run / the load balancer stops routing
// traffic to (or rolls back) the instance. Uses a trivial `SELECT 1` round-trip.

import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '@infra/prisma/prisma.service';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key = 'database'): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return indicator.up({ latencyMs: Date.now() - start });
    } catch (err) {
      return indicator.down({ message: (err as Error).message });
    }
  }
}
