// src/config/logger.config.ts
//
// Phase 0 (monitoring plan) — structured logging foundation.
// Builds the nestjs-pino `Params` used by `LoggerModule.forRootAsync` in AppModule.
//
//  * Emits GCP-structured JSON in production: Pino level -> `severity`, message under
//    `message`, ISO timestamps — so Cloud Logging + Error Reporting parse it natively.
//  * Pretty, human-readable output in development (LOG_FORMAT=pretty).
//  * Correlation IDs: every request gets an `x-request-id` (read from the incoming
//    header / X-Cloud-Trace-Context, or generated). With `quietReqLogger`, that id is
//    bound onto the per-request logger, so EVERY log line during the request carries
//    `requestId` (nestjs-pino propagates it via AsyncLocalStorage).
//
// Redaction here is intentionally minimal (auth headers only) — full body/field
// redaction is Phase 1.

import { randomUUID } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { stdTimeFunctions } from 'pino';
import type { Params } from 'nestjs-pino';
import { redactValue } from '../common/logging/redaction';

export type LogFormat = 'json' | 'pretty';

/** Pino level label -> Google Cloud Logging `severity`. */
const GCP_SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Derive a correlation id for the request. Preference order:
 *  1. an inbound `x-request-id` (client / load balancer supplied),
 *  2. the trace id from GCP's `X-Cloud-Trace-Context` (`TRACE_ID/SPAN_ID;o=1`),
 *  3. a fresh UUID.
 * The chosen id is echoed back on the response so clients can correlate.
 */
function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const headers = req.headers;
  const fromHeader = headers[REQUEST_ID_HEADER];
  const existing = Array.isArray(fromHeader) ? fromHeader[0] : fromHeader;

  const cloudTrace = headers['x-cloud-trace-context'];
  const traceValue = Array.isArray(cloudTrace) ? cloudTrace[0] : cloudTrace;
  const traceId = traceValue ? traceValue.split('/')[0] : undefined;

  const id = existing || traceId || randomUUID();
  res.setHeader(REQUEST_ID_HEADER, id);
  return id;
}

/**
 * Build nestjs-pino params from validated env.
 * @param nodeEnv  process env (test silences logs)
 * @param level    LOG_LEVEL (trace|debug|info|warn|error|fatal|silent)
 * @param format   LOG_FORMAT (json|pretty)
 */
export function buildLoggerParams(
  nodeEnv: string,
  level: string,
  format: LogFormat,
): Params {
  const isPretty = format === 'pretty';

  return {
    pinoHttp: {
      level: nodeEnv === 'test' ? 'silent' : level,
      // GCP wants the human text under `message` (not pino's default `msg`).
      messageKey: 'message',
      timestamp: stdTimeFunctions.isoTime,

      // formatters.log runs the central redactor on EVERY log object before any sink
      // (Phase 1). formatters.level, in JSON mode only, replaces the numeric level with
      // a GCP `severity` string (pretty mode keeps the numeric level so pino-pretty can
      // colourise).
      formatters: {
        ...(isPretty
          ? {}
          : {
              level: (label: string) => ({
                severity: GCP_SEVERITY[label] ?? 'DEFAULT',
              }),
            }),
        log: (obj: Record<string, unknown>) => redactValue(obj),
      },

      // Correlation id -> bound onto the per-request logger as `requestId`.
      genReqId: resolveRequestId,
      quietReqLogger: true,
      customAttributeKeys: { reqId: 'requestId' },

      // fast-redact layer for known paths. Complements the recursive `formatters.log`
      // redactor: fast-redact also covers child-logger bindings (e.g. anything added
      // via PinoLogger.assign), which formatters.log does not see.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          // Top-level secret keys (catch child-bound values too).
          'authorization',
          'password',
          'token',
          'accessToken',
          'refreshToken',
          'apiKey',
          'secret',
        ],
        censor: '**REDACTED**',
      },

      transport: isPretty
        ? {
            target: 'pino-pretty',
            options: {
              messageKey: 'message',
              singleLine: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
  };
}
