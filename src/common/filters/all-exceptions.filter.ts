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
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

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

    const logContext = {
      context: AllExceptionsFilter.name,
      method: request.method,
      path: request.url,
      statusCode: status,
      userId,
      err:
        exception instanceof Error
          ? {
              type: exception.name,
              message: exception.message,
              // Stack only for genuine failures — keeps 4xx logs lean.
              ...(isServerError ? { stack: exception.stack } : {}),
            }
          : { message: String(exception) },
    };

    const logMessage = `[${request.method}] ${request.url} -> ${status}`;
    if (isServerError) {
      this.logger.error(logContext, logMessage);
    } else {
      this.logger.warn(logContext, logMessage);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: clientMessage,
    });
  }
}
