// src/shared/services/logger.service.ts
//
// Thin injectable wrapper over nestjs-pino's PinoLogger (Phase 0). Keeps the small
// log/error/warn/debug API but routes through the structured pino pipeline, so any
// caller automatically gets JSON output, GCP `severity`, and the request-scoped
// `requestId` (via AsyncLocalStorage) for free.

import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class LoggerService {
  constructor(private readonly logger: PinoLogger) {}

  log(message: string, context?: string): void {
    this.logger.info({ context }, message);
  }

  error(message: string, trace?: string, context?: string): void {
    this.logger.error({ context, trace }, message);
  }

  warn(message: string, context?: string): void {
    this.logger.warn({ context }, message);
  }

  debug(message: string, context?: string): void {
    this.logger.debug({ context }, message);
  }
}
