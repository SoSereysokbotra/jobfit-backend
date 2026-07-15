# Logging

The app logs **structured JSON** via `nestjs-pino`. On Cloud Run, stdout is captured by
Cloud Logging automatically — no agent. Config: [`src/config/logger.config.ts`](../../src/config/logger.config.ts).

## Fields on every line
| Field | Meaning |
|-------|---------|
| `severity` | GCP severity (`DEBUG`/`INFO`/`WARNING`/`ERROR`/`CRITICAL`) — mapped from the pino level |
| `message` | human text (GCP's default summary field) |
| `time` | ISO 8601 timestamp |
| `requestId` | correlation id — **same across every line of one request** (from `x-request-id` / `X-Cloud-Trace-Context`, else generated; echoed back on the response) |
| `context` | logger/class name |
| `logging.googleapis.com/trace` | present when `TRACE_ENABLED=true` → links the line to its Cloud Trace span |

## Levels — when to use which
- **debug** — dev troubleshooting only (off in prod; `LOG_LEVEL=info`).
- **info** — normal lifecycle events ("user registered", "server started").
- **warn** — unexpected but handled (retry, Redis fail-open, deprecated route, **4xx**).
- **error** — an operation failed / a request 5xx'd (auto-grouped in Error Reporting).
- **fatal** — process can't continue.

`LOG_LEVEL` / `LOG_FORMAT` are env-driven (`info`+`json` in prod, `debug`+`pretty` in dev) —
change verbosity without a code change.

## Usage
Inject the logger and log an **object first** (structured fields), message second:
```ts
constructor(private readonly logger: PinoLogger) {}
this.logger.info({ userId, jobId }, 'application submitted');
```
Do **not** use `console.log`. `requestId` is added automatically — never pass it manually.

## Redaction (never log secrets)
All log objects pass through the central redactor before any sink
([`src/common/logging/redaction.ts`](../../src/common/logging/redaction.ts)): ~30 sensitive
keys (`password`, `authorization`, `token`, `refreshToken`, verification/reset codes, …) →
`**REDACTED**`, plus card/SSN/Bearer **patterns** in message strings. See
[SECURITY_LOGGING.md](SECURITY_LOGGING.md). Don't hand-build log strings containing secrets —
only field-name and pattern redaction apply, not arbitrary free text.

## Errors
The global filter ([`all-exceptions.filter.ts`](../../src/common/filters/all-exceptions.filter.ts))
logs 5xx at ERROR (as a GCP Error Reporting event, stack-trace = grouping key) and 4xx at
WARN, attaching `requestId`/`userId`/`method`/`path`/`statusCode`. Clients never see internal
error messages (generic `Internal server error` for non-HTTP exceptions).
