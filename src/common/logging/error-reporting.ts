// src/common/logging/error-reporting.ts
//
// Phase 2 (monitoring plan) — GCP Error Reporting, log-based (free, no SDK).
//
// Google Cloud Error Reporting automatically ingests a Cloud Logging entry as a
// grouped error when the entry is a `ReportedErrorEvent`: it carries the `@type`
// marker, a `serviceContext` (service + version, for per-release grouping/regression
// tracking), the exception **stack trace as the log `message`** (Error Reporting parses
// the stack from `message`), and an optional `context` (httpRequest + user).
//
// This helper builds that payload from an exception; AllExceptionsFilter uses it for
// 5xx / unhandled errors. The object is redacted by the central pino `formatters.log`
// hook, and the filter additionally scrubs the stack `message` with `redactString`.

export const REPORTED_ERROR_TYPE =
  'type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent';

export interface ErrorReportContext {
  service: string;
  version: string;
  method: string;
  path: string;
  statusCode: number;
  userId?: string;
  userAgent?: string;
  remoteIp?: string;
}

export interface ReportedError {
  /** Structured fields for the log entry (passed as pino's merging object). */
  payload: Record<string, unknown>;
  /** The log message — the exception stack trace, which Error Reporting groups on. */
  message: string;
}

/**
 * Convert an exception + request context into a Cloud Error Reporting `ReportedErrorEvent`.
 * The `message` is the stack trace (or `Type: message` when no stack is available).
 */
export function toReportedErrorEvent(
  exception: unknown,
  ctx: ErrorReportContext,
): ReportedError {
  const message =
    exception instanceof Error
      ? (exception.stack ?? `${exception.name}: ${exception.message}`)
      : String(exception);

  const payload: Record<string, unknown> = {
    '@type': REPORTED_ERROR_TYPE,
    serviceContext: { service: ctx.service, version: ctx.version },
    context: {
      httpRequest: {
        method: ctx.method,
        url: ctx.path,
        responseStatusCode: ctx.statusCode,
        ...(ctx.userAgent ? { userAgent: ctx.userAgent } : {}),
        ...(ctx.remoteIp ? { remoteIp: ctx.remoteIp } : {}),
      },
      ...(ctx.userId ? { user: ctx.userId } : {}),
    },
    // Flat field kept for convenient Cloud Logging filtering alongside `requestId`
    // (which the pino request logger attaches automatically).
    statusCode: ctx.statusCode,
  };

  return { payload, message };
}
