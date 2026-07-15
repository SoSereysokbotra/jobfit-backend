// src/modules/metrics/http-metrics.interceptor.ts
//
// Phase 3 — records HTTP duration + count for every request. Hooks `res.on('finish')`
// (not the RxJS stream) so the FINAL status code is captured even for errors mapped by the
// exception filter (which runs after interceptors). Route label uses the matched route
// PATTERN (e.g. /admin/users/:id), never the raw URL, to keep cardinality bounded.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || !this.metrics.enabled) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const route = this.routeOf(req);

    // Don't self-observe the scrape endpoint.
    if (route.endsWith('/metrics')) {
      return next.handle();
    }

    const start = process.hrtime.bigint();
    res.once('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.observeHttp(
        {
          method: req.method,
          route,
          status_code: String(res.statusCode),
        },
        durationSeconds,
      );
    });

    return next.handle();
  }

  private routeOf(req: Request): string {
    const pattern = (req as Request & { route?: { path?: string } }).route?.path;
    if (!pattern) return 'unmatched';
    const base = req.baseUrl || '';
    return `${base}${pattern}`;
  }
}
