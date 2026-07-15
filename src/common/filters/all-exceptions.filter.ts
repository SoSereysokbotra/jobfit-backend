// src/common/filters/all-exceptions.filter.ts
//
// Catch-all exception filter. Normalises every error — HttpException or otherwise —
// into a consistent JSON body and logs it with full context. Fully generic; no
// domain/auth coupling.
//
// Phase 1 hardening:
//  * Structured logging via PinoLogger — attaches method, path, statusCode, userId
//    and the error (type/message/stack). requestId is auto-added by the pino request
//    logger (AsyncLocalStorage), so every error line correlates to its request.
//  * Severity by status: 5xx -> ERROR (a real failure), 4xx -> WARN (expected/
//    operational) so Error Reporting stays focused on genuine bugs.
//  * Never leak internals: non-HttpException (programming/system) errors return a
//    generic 'Internal server error' to the client; the real message/stack is logged
//    server-side only.
//  * All logged fields pass through the central redactor (pino formatters.log).

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { redactString } from '../logging/redaction';
import { toReportedErrorEvent } from '../logging/error-reporting';
import { AlertingService } from '@modules/alerting/alerting.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly service: string;
  private readonly version: string;

  constructor(
    private readonly logger: PinoLogger,
    config: ConfigService,
    private readonly alerting: AlertingService,
  ) {
    this.service = config.get<string>('app.serviceName', 'jobfit-backend');
    this.version = config.get<string>('app.serviceVersion', 'local');
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    // Client-facing message. Defaults to the generic 500 text; only HttpExceptions
    // (whose messages are intended for the client) override it.
    let clientMessage: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      clientMessage =
        typeof res === 'string'
          ? res
          : ((res as Record<string, any>).message ?? exception.message);
    }

    const isServerError = status >= 500;
    const userId = (request as Request & { user?: { id?: string } }).user?.id;

    if (isServerError) {
      // Emit as a GCP Error Reporting ReportedErrorEvent so it is auto-grouped with
      // stack trace, serviceContext (release), request + user context. requestId is
      // attached by the pino request logger. The stack `message` is scrubbed for any
      // secret-shaped substrings before it leaves the process.
      const { payload, message } = toReportedErrorEvent(exception, {
        service: this.service,
        version: this.version,
        method: request.method,
        path: request.url,
        statusCode: status,
        userId,
        userAgent: request.headers['user-agent'],
        remoteIp: request.ip,
      });
      this.logger.error(payload, redactString(message));

      // Phase 4 — raise an in-app + Slack alert (deduped, suppressed during boot). Fire-
      // and-forget: alerting is fully fail-open and must never affect the response.
      const requestId = (request as Request & { id?: string }).id;
      void this.alerting.onServerError({
        error: exception,
        statusCode: status,
        method: request.method,
        path: request.url,
        requestId: typeof requestId === 'string' ? requestId : undefined,
        userId,
      });
    } else {
      // 4xx are expected/operational — WARN, not ERROR, so Error Reporting stays
      // focused on genuine failures.
      this.logger.warn(
        {
          context: AllExceptionsFilter.name,
          method: request.method,
          path: request.url,
          statusCode: status,
          userId,
          err:
            exception instanceof Error
              ? { type: exception.name, message: exception.message }
              : { message: String(exception) },
        },
        `[${request.method}] ${request.url} -> ${status}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: clientMessage,
    });
  }
}
