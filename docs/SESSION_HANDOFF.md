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
- **7 phases** (Phase 0 structured logging w/ `nestjs-pino` + `AsyncLocalStorage` correlation IDs; 1 redaction; 2 Error Reporting/optional Sentry; 3 `@nestjs/terminus` health + `prom-client` metrics + Cloud Trace; 4 Cloud Monitoring + Slack alerts + `system_events`; 5 Cloud Logging dashboards/retention; 6 docs + Cloud Build→Cloud Run deploy). **Plan only — NOT yet implemented.**

## KNOWN ISSUES (IMPORTANT)
- **Pre-existing Prisma SCHEMA DRIFT:** `schema.prisma` declares columns the live DB lacks (e.g. `resumes.parsingStatus`). Causes 500s on some endpoints, incl. `GET /admin/users/{id}` (via `countResumes`) and anything touching `resumes`. Reconcile with `npx prisma migrate dev` (review the diff carefully) **before** the Cloud SQL migration.
- **MailerService is a stub** (no real email send). `email_events` would be populated by a provider webhook that doesn't exist yet.
- Current observability is **console/unstructured** (NestJS `Logger`); no Sentry/Slack/metrics/correlation IDs yet.

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
<Replace this line with what you want next, e.g.:>
- "Reconcile the Prisma schema drift and fix the `/admin/users/{id}` 500."
- "Implement **Phase 0** of the monitoring plan (`nestjs-pino` + correlation IDs)."
- "Draft `docs/DEPLOYMENT.md` (Cloud Build → Cloud Run + Secret Manager + Workload Identity)."
- "Do the Supabase → Cloud SQL migration (Appendix A)."
