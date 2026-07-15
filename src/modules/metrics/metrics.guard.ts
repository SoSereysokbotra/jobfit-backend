// src/modules/metrics/metrics.guard.ts
//
// Phase 3 — protects GET /metrics. Prometheus scrapers can't present a JWT, so the endpoint
// is @Public() to the JWT guard but gated here by a static bearer token:
//   * if `METRICS_TOKEN` is unset (local dev) -> open,
//   * if set -> require `Authorization: Bearer <token>` or `?token=<token>`.
// On Cloud Run, keep the scrape internal and set METRICS_TOKEN via Secret Manager.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class MetricsGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('app.metricsToken');
    if (!expected) return true; // no token configured -> open (dev)

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    const queryToken =
      typeof req.query.token === 'string' ? req.query.token : undefined;

    if (bearer === expected || queryToken === expected) return true;
    throw new UnauthorizedException('Invalid metrics token');
  }
}
