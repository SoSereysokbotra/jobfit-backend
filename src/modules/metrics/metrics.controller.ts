// src/modules/metrics/metrics.controller.ts
//
// Phase 3 — GET /metrics (Prometheus exposition format). @Public() to the JWT guard, gated
// by MetricsGuard (token). Uses @Res() so the raw text bypasses the JSON TransformInterceptor.

import {
  Controller,
  Get,
  NotFoundException,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '@common/decorators/public.decorator';
import { MetricsService } from './metrics.service';
import { MetricsGuard } from './metrics.guard';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Public()
  @UseGuards(MetricsGuard)
  @ApiExcludeEndpoint()
  async scrape(@Res() res: Response): Promise<void> {
    if (!this.metrics.enabled) {
      throw new NotFoundException('Metrics are disabled');
    }
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    res.send(await this.metrics.scrape());
  }
}
