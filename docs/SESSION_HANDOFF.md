# JobFit Backend — Session Handoff / New-Chat Context

Paste this whole file (or point the AI at it) to continue work in a fresh chat.

---

## PROJECT
- Repo: `d:\Year2\Jobfit\jobfit-backend` (Windows, PowerShell + Git Bash; package manager: **pnpm**)
- Stack: **NestJS 10** modular monolith, **DDD + CQRS**, **Prisma** ORM, **PostgreSQL (Supabase**, pooler `ap-northeast-1`), **Redis** (fail-open), **BullMQ**.
- Auth: **self-managed JWT** (NOT Supabase Auth). Roles: `JOB_SEEKER` / `EMPLOYER` / `ADMIN`. Global `JwtAuthGuard` + `RolesGuard` (APP_GUARD). `@Public()` opens a route; `@Roles('ADMIN')` restricts.
- Global route prefix: `api/v1`. Swagger UI: `http://localhost:3000/api/docs` (`/api/docs-json`). Response envelope: `{ success, statusCode, timestamp, data }` — tokens live at `data.accessToken`.
- Run: `npm run start:dev`. Path aliases: `@modules/@common/@config/@infra/@events/@core/@shared-kernel/@shared`.

## WHAT WAS BUILT / CHANGED (recent sessions)
1. **Admin module** (`src/modules/admin`, DDD layers) — 14 endpoints: admin auth (login/logout reuse auth CQRS + enforce ADMIN), system health/metrics/alerts/acknowledge, user mgmt (search/detail/reset-password/unlock/GDPR-delete), email metrics/bounces/suppress, audit-logs. Reuses `AccountLockoutService` (unlock), `RequestPasswordResetCommand` (reset), `RedisService` (suppression); writes `AuditLog` on mutations.
2. **Prisma:** added 3 tables (`system_events`, `email_events`, `audit_logs`) + 5 enums + User back-relations + `users.role` index. Migration `prisma/migrations/20260713000000_admin_module` applied via **`prisma migrate deploy`** (NOT `migrate dev` — it wanted a destructive change due to pre-existing drift). Enum members UPPERCASE (project convention).
3. **Boot fixes:** `pnpm install` (installed declared-but-missing `bullmq`/`@nestjs/bullmq`/`pdf-parse`/`mammoth`); made **`SharedModule` and `AuthModule` `@Global()`** so the global `JwtAuthGuard` resolves in feature modules that use `@UseGuards(JwtAuthGuard)`.
4. **`main.ts` Swagger:** `persistAuthorization`, two bearer schemes (`bearer` + `access-token`), tag/op sorting.
5. **`tsconfig.json`:** added `"strictPropertyInitialization": false` (matches existing DTO style; kills a phantom IDE `TS2564`).
6. Fixed `/admin/system/health` 500 — `countPendingQueue()` now try/catch → 0 (`system-health.service.ts`).
7. **`scripts/create-test-users.ts`** — seeds pre-verified ADMIN/EMPLOYER/JOB_SEEKER (`*@jobfit.test`, password `Password123`) + Industry / 2 Skills / Company, and **prints their IDs**. Run: `npx ts-node -r tsconfig-paths/register scripts/create-test-users.ts`.
8. **Docs created** in `docs/`: `BACKEND_TESTING_GUIDE.md`, `API_ENDPOINTS_REFERENCE.md` (81 ops), `TEST_FLOW_WALKTHROUGH.md` (copy-paste payloads), `SESSION_HANDOFF.md` (this file). In `docs/product design/`: `PRODUCTION_MONITORING_IMPLEMENTATION_PLAN.md`.
- **Employer module** (10 endpoints) was built earlier; requires claiming a company first (else `403`).

## MONITORING / DEPLOY PLAN (`docs/product design/PRODUCTION_MONITORING_IMPLEMENTATION_PLAN.md`)
- **Platform DECIDED: Google Cloud Platform.** App → **Cloud Run**; **Cloud Logging** (auto stdout), **Error Reporting**, **Cloud Monitoring**, **Cloud Trace**. App code stays provider-agnostic (Pino/Sentry/Slack).
- **DB DECIDED (phased): Supabase now → Cloud SQL before production** (Appendix A = migration checklist). Redis → Memorystore, same phasing.
- **7 phases** (Phase 0 structured logging w/ `nestjs-pino` + `AsyncLocalStorage` correlation IDs; 1 redaction; 2 Error Reporting/optional Sentry; 3 `@nestjs/terminus` health + `prom-client` metrics + Cloud Trace; 4 Cloud Monitoring + Slack alerts + `system_events`; 5 Cloud Logging dashboards/retention; 6 docs + Cloud Build→Cloud Run deploy).
- **Phase 0 DONE** (2026-07-15): `nestjs-pino`+`pino`+`pino-http`+`pino-pretty` installed; `src/config/logger.config.ts` builds GCP-structured JSON (level→`severity`, `msg`→`message`, ISO time); Pino is the app logger (`main.ts` `bufferLogs`+`useLogger`); correlation IDs via `genReqId` (reads `x-request-id`/`X-Cloud-Trace-Context` or generates, echoes back) + `quietReqLogger` so **every line carries `requestId`**; `LOG_LEVEL`/`LOG_FORMAT` env (pretty dev / JSON prod); duplicate request loggers deleted (pino-http only); `LoggerService` repointed to `PinoLogger`. Verified live: structured JSON, one request → correlated lines, endpoints still 200.
- **Phase 1 DONE** (2026-07-15): central redaction in `src/common/logging/redaction.ts` (recursive key-based + card/SSN/Bearer patterns) wired into pino via `formatters.log` so **secrets are redacted before any sink**; `AllExceptionsFilter` hardened (now DI-provided via `APP_FILTER`, injects `PinoLogger`): structured `requestId`/`userId`/`method`/`path`/`statusCode`/`err`, **5xx→ERROR / 4xx→WARN**, and non-HttpException 500s return a generic `Internal server error` (no internal leak — this was a real prior leak). Verified live: 4xx→WARNING, `authorization`→`**REDACTED**`, wrong password + JWT never appear in logs.
- **Phase 2 DONE** (2026-07-15, GCP Error Reporting only — no Sentry): `src/common/logging/error-reporting.ts` builds a `ReportedErrorEvent` (`@type` + `serviceContext{service,version}` + `context.httpRequest`/`user`, **stack trace as `message`** = the grouping key). `AllExceptionsFilter` emits it for every 5xx (injects `ConfigService` for service/version; scrubs the stack `message` via `redactString`). `SERVICE_NAME`/`SERVICE_VERSION` env added (version falls back to Cloud Run `K_REVISION` → `local`). Closed a redaction gap: added top-level secret keys to pino `redact.paths` so child-bound/`assign`ed secrets are also censored. On Cloud Run these ERROR logs auto-group in **Error Reporting** with stack + `requestId` + release + user; **no SDK, free**. Captured the real emitted JSON to confirm the shape (card # → `**CARD**`).
- **Phase 3 DONE** (2026-07-15, in the `d:\` checkout, branch `feat/observability-phase-3`): **Health** — `src/modules/health/` (`@nestjs/terminus` v11): `GET /health/live` (no deps) + `GET /health/ready` (**DB hard-gate → 503 if down**; Redis + queue are **soft/fail-open** → always `up` but `degraded:true` when unreachable, so Cloud Run never refuses traffic over optional Redis). **Metrics** — `src/modules/metrics/` (`prom-client`, own Registry): `GET /metrics` (@Public + `MetricsGuard` token; `@Res` bypasses the JSON envelope), global `HttpMetricsInterceptor` records `http_request_duration_seconds` + `http_requests_total` on `res.finish` (final status; route = matched **pattern**, low cardinality), `jobfit_resume_parsing_pending` gauge (DB proxy, collect-on-scrape). **Trace** — `src/tracing.ts` (OTel NodeSDK → Cloud Trace, **self-starting, guarded by `TRACE_ENABLED`**, imported first in `main.ts`) + pino `traceMixin` stamps `logging.googleapis.com/trace` when a span is active. Env added: `METRICS_ENABLED`/`METRICS_TOKEN`/`TRACE_ENABLED`/`GCP_PROJECT_ID`. Also added jest `moduleNameMapper` for `@infra`/`@shared`/etc. (specs load aliased source). Verified live: `/health/live` 200; `/health/ready` 200 with DB `up` + Redis/queue `degraded` (Redis off locally); `/metrics` scrapes with real HTTP + gauge samples. Full suite **56/56** green, `tsc` clean. **Phases 4–6 NOT yet implemented.**

## KNOWN ISSUES (IMPORTANT)
- ~~**Pre-existing Prisma SCHEMA DRIFT**~~ **RESOLVED (2026-07-15):** the live `resumes`/`applications` tables (+ enum + 3 child tables) had the old init shape; both tables were empty (0 rows), so a clean-rebuild migration `20260715000000_reconcile_resume_application_drift` (applied via `prisma migrate deploy`, **not** `migrate dev`) brought the DB fully in sync with `schema.prisma` (`migrate diff` now empty). Fixed the 500s on `GET /admin/users/{id}`, `GET /resumes`, `GET /applications` (all filtered `userId`+`deletedAt`). Read-only diagnostics live in `scripts/diagnostics/`.
- **MailerService is a stub** (no real email send). `email_events` would be populated by a provider webhook that doesn't exist yet.
- Observability: **Phases 0–3 done** — structured JSON logging, correlation IDs, secret redaction, hardened error filter, GCP Error Reporting (log-based), **health probes (`/health/live`+`/health/ready`), Prometheus `/metrics`, and OTel→Cloud Trace (guarded)**. Still TODO: Slack alerts + `system_events` wiring (Phase 4), Cloud Logging dashboards/retention (Phase 5), docs + Cloud Build→Cloud Run deploy (Phase 6). Live confirmation of metrics/traces in Cloud Monitoring/Trace needs a Cloud Run deploy.
- ⚠️ **Cross-checkout note:** Phase 3 was implemented in the **`d:\` copy** on branch `feat/observability-phase-3` (uncommitted). The `c:\` copy does NOT have it. Sync (git or copy the new `src/modules/health/`, `src/modules/metrics/`, `src/tracing.ts`, config edits, `package.json`) before working Phase 3+ from `c:\`.

## VERIFIED WORKING
Full boot OK; all routes mapped; admin login → 200; admin GET endpoints 200; authz correct (401 no token, 403 wrong role); employer 403 until company claimed (by design); `/jobs` public 200; write+audit works (suppress → `EMAIL_SUPPRESSED` in audit-logs). Redis not running locally = harmless fail-open warnings.

---

## FIRST STEPS FOR THE NEW CHAT (do before changing anything)
1. **Read `CLAUDE.md` and the memory index**, then confirm understanding.
2. **Read the entire `docs/product design/` folder** to understand the target architecture and the phased plan:
   - `PRODUCTION_MONITORING_IMPLEMENTATION_PLAN.md` — the JobFit-specific phased plan (phases, GCP services, env matrix, Appendix A migration checklist). **This defines "our phases."**
   - `Senior Backend Engineers (Google Cloud Platform Edition).md` — the full GCP observability reference the plan is derived from.
   - `production_monitoring_architecture_guide.md` — the cloud-agnostic source guide (log levels, redaction, error lifecycle, incident response).
   Summarize which phase we're on and what each phase requires before proposing changes.
3. Then proceed with the request below.

## MY REQUEST
Implement Phase 0 of the monitoring plan — add nestjs-pino + pino + pino-http +
pino-pretty, set Pino as the app logger in main.ts (bufferLogs), emit GCP-structured JSON
(level→severity, msg→message), add AsyncLocalStorage correlation-id middleware (requestId on
every line, read x-request-id / X-Cloud-Trace-Context), retire the duplicate request logger
(keep one), and wire LOG_LEVEL/LOG_FORMAT. Verify a request produces correlated JSON lines.
Follow docs/product design/PRODUCTION_MONITORING_IMPLEMENTATION_PLAN.md Phase 0.
- "Reconcile the Prisma schema drift and fix the `/admin/users/{id}` 500."
- "Implement **Phase 0** of the monitoring plan (`nestjs-pino` + correlation IDs)."
- "Draft `docs/DEPLOYMENT.md` (Cloud Build → Cloud Run + Secret Manager + Workload Identity)."
- "Do the Supabase → Cloud SQL migration (Appendix A)."
