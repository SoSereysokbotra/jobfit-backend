# JobFit — Production Monitoring & Documentation Plan (Google Cloud Platform)

**Purpose:** Turn the principles in [`Senior Backend Engineers (Google Cloud Platform Edition).md`](Senior%20Backend%20Engineers%20%28Google%20Cloud%20Platform%20Edition%29.md)
into a concrete, phased plan for **this** codebase — a NestJS 10 modular monolith
(Postgres + Redis) — **deployed to Google Cloud Platform** — so we can ship to production and
add features with real observability (structured logs, error tracking, alerting, metrics,
health checks, runbooks).

> **Target platform: Google Cloud Platform.** The app runs as a container on **Cloud Run**
> (stateless, autoscaling); its JSON stdout is captured by **Cloud Logging** automatically,
> unhandled errors surface in **Error Reporting**, metrics/dashboards live in **Cloud
> Monitoring**, and request traces in **Cloud Trace**. The application code stays
> provider-agnostic (Pino, Sentry, Slack all work unchanged) — only infrastructure config is
> GCP-specific.
>
> The reference guide targets Express + enterprise microservices. JobFit is a **single NestJS
> service (modular monolith)**, so this plan keeps the *principles* (structured logging,
> correlation IDs, log levels, redaction, Sentry, Slack, health/metrics, incident response)
> and adapts the *mechanics* to NestJS on GCP + our existing building blocks.

---

## 1. Current-state audit (what we have today)

| Capability | Status | Where |
|-----------|--------|-------|
| App logging | ⚠️ Console only, **unstructured text** | NestJS `Logger` via `src/shared/services/logger.service.ts` |
| Request logging | ⚠️ Duplicated, text | `common/interceptors/logging.interceptor.ts` **and** `common/middleware/request-logging.middleware.ts` |
| Global error handling | ✅ Present (text log) | `common/filters/all-exceptions.filter.ts` |
| Response envelope | ✅ | `common/interceptors/transform.interceptor.ts` |
| Correlation / request IDs | ❌ None | — |
| Structured JSON logs | ❌ None | — |
| Log level via env (`LOG_LEVEL`) | ❌ Not wired | — |
| Sensitive-data redaction | ❌ None | — |
| Error tracking (Sentry) | ❌ None | — |
| Critical alerting (Slack/Pager) | ❌ None (notification module is a stub) | `modules/notification/*` |
| Metrics (Prometheus `/metrics`) | ❌ None | — |
| Liveness/readiness health checks | ⚠️ Custom only | `GET /admin/system/health` (admin-only, app metrics) |
| App-level event/audit store | ✅ **Reusable** | `system_events`, `audit_logs`, `email_events` (Admin module) |
| Graceful degradation (fail-open) | ✅ Partial | Redis lockout/blacklist, health probe |
| Centralized log shipping | ❌ None | — |
| Runbooks / incident docs | ❌ None | — |

**Takeaway:** the error-handling *shape* is good; the gap is **structured logging, context
propagation, redaction, and the external integrations** (Sentry, Slack, metrics, centralized logs).

---

## 2. Target architecture (NestJS monolith on Google Cloud Platform)

```
                         Cloud Load Balancer (HTTPS, Cloud Armor/DDoS)
                                        │
Request ─▶ [correlation-id middleware]  ── generates/propagates requestId (AsyncLocalStorage)
        ─▶ [pino-http request logger]   ── structured JSON in/out, duration, status
        ─▶ Guards / Pipes / Controllers / Services       (running on Cloud Run)
        ─▶ [AllExceptionsFilter]        ── logs error w/ context, maps to safe JSON
                                           └─▶ Sentry.captureException (ERROR/5xx)  [optional]
                                           └─▶ Slack alert (FATAL / error-rate spike)

Logger (Pino) ──▶ stdout (JSON)  ──▶  Cloud Logging  (auto-captured by Cloud Run — no agent)
              └─▶ redaction applied before any sink        │
                                                           ├─▶ Error Reporting (auto: severity=ERROR + stack)
                                                           ├─▶ Log-based metrics + Log Router → BigQuery/GCS
                                                           └─▶ Log-based alerts → Slack / PagerDuty

Metrics: prom-client ─▶ GET /metrics  ──▶ Cloud Monitoring (managed dashboards + alerting)
Trace:   OpenTelemetry ─▶ Cloud Trace  (latency breakdown per request)
Health:  @nestjs/terminus ─▶ /health/live, /health/ready  ──▶ Cloud Run startup/liveness probes
Alerts:  system_events table (already exists) + Slack, driven by log level & thresholds
Data:    Cloud SQL (Postgres) or existing Supabase · Memorystore (Redis) or existing Redis
```

Everything runs **in-process** (one Cloud Run service), so we use **AsyncLocalStorage** for
context propagation instead of cross-service header plumbing. Because Cloud Run captures
`stdout`/`stderr` into Cloud Logging automatically, **no logging agent or sidecar is needed** —
writing structured JSON to stdout (Phase 0) is what wires us into the entire GCP observability
suite.

---

## 3. Technology choices (recommended, with rationale)

| Concern | Recommendation | Why (for this project) | Alternative |
|--------|----------------|------------------------|-------------|
| Compute / hosting | **Cloud Run** | Stateless container, autoscale-to-zero, stdout→Cloud Logging automatically, cheapest to operate | Compute Engine (VMs) / GKE (if you outgrow it) |
| Logger | **`nestjs-pino` + `pino`** | Fastest, JSON-first, first-class NestJS module, replaces the built-in Logger cleanly, `pino-http` gives request logging + auto requestId. Emit **GCP-structured JSON** (`severity`, `message`, `trace`) so Cloud Logging parses levels correctly | `nest-winston` + `@google-cloud/logging-winston` |
| Pretty dev logs | `pino-pretty` | Human-readable locally, JSON in prod | — |
| Context propagation | **`AsyncLocalStorage`** (Node built-in) | No deps; requestId flows to every log; also set `logging.googleapis.com/trace` to correlate with Cloud Trace | `nestjs-cls` (nice wrapper) |
| Centralized logs | **Cloud Logging** (automatic) | Cloud Run ships stdout to it with **no agent**; 50 GB/month free; searchable, log-based metrics & alerts | ELK / Grafana Loki (self-host) |
| Error tracking | **GCP Error Reporting** (free, auto) **±** `@sentry/nestjs` | Error Reporting groups ERROR logs for $0 with zero setup; add Sentry only if you want session replay / richer release tracking | Sentry-only, or self-host GlitchTip |
| Metrics | **`prom-client` → Cloud Monitoring** | Expose `/metrics`; scrape via the OpenTelemetry/Ops agent into **Cloud Monitoring** for managed dashboards + alert policies | Managed Prometheus (GMP) / Grafana |
| Tracing | **OpenTelemetry → Cloud Trace** | Per-request latency breakdown; free tier generous | Skip until latency debugging needed |
| Health checks | **`@nestjs/terminus`** | `/health/live` + `/health/ready` feed Cloud Run **startup/liveness** probes | Keep custom only |
| Alerting transport | **Slack incoming webhook** | Simplest 1-way; reuse `NotificationModule`; Cloud Monitoring alert policies can also post to Slack/PagerDuty | PagerDuty (later) |
| CI/CD | **Cloud Build → Artifact Registry → Cloud Run** | Native GCP pipeline: build image, push, deploy, health-gate | GitHub Actions deploying to Cloud Run |
| Database | Keep **Supabase Postgres** *or* migrate to **Cloud SQL (Postgres)** | Prisma is provider-agnostic; Cloud SQL co-locates with Cloud Run (lower latency, IAM auth) but Supabase is fine to start | — |
| Cache/queue | Existing Redis *or* **Memorystore (Redis)** | BullMQ + lockout/blacklist need Redis; Memorystore is the managed GCP option | Upstash / self-host |

> **Cost note (GCP-first):** the observability layer is essentially **free at our scale** —
> Cloud Logging (50 GB/mo free), Error Reporting (free), Cloud Monitoring (free), Cloud Trace
> (free). Cloud Run bills per-request and scales to zero (often < $10/mo early on). Sentry stays
> optional. Revisit log **sampling/retention** (guide §5, §14) only when volume grows past the
> free tiers.

### 3.1 Concern → GCP service map

| Observability concern | GCP service | How it's wired |
|-----------------------|-------------|----------------|
| Centralized logs | **Cloud Logging** | Cloud Run auto-captures JSON stdout |
| Error tracking | **Error Reporting** | Auto-groups logs with `severity>=ERROR` + stack trace |
| Metrics & dashboards | **Cloud Monitoring** | Scrapes `/metrics`; log-based metrics; alert policies |
| Distributed tracing | **Cloud Trace** | OpenTelemetry exporter; `trace` field links logs↔traces |
| Alerting | Cloud Monitoring alert policies **+ Slack webhook** | Notification channels |
| Log archive / analytics | **Log Router → BigQuery / Cloud Storage** | Cheap long-term retention & SQL queries |
| Secrets (DSN, webhook, creds) | **Secret Manager** | Injected as env vars into Cloud Run |
| Container registry | **Artifact Registry** | Built by Cloud Build |
| Identity for GCP APIs | **Workload Identity** (Cloud Run service account) | No key files in prod |

---

## 4. Documentation deliverables (the "doc plan")

Create these under `docs/` (the guide's §9 doc set, adapted). Each is a separate task.

| Doc | Purpose | Key contents |
|-----|---------|--------------|
| `docs/observability/LOGGING.md` | How the team logs | Log levels & when to use each (guide §3), the logger API, required fields (requestId, userId), do/don't, redaction rules |
| `docs/observability/MONITORING.md` | What we watch | Metrics catalogue, dashboards, health endpoints, SLOs (uptime, p95, error rate) |
| `docs/observability/ALERTING.md` | When we get paged | Alert rules & thresholds, Slack channels, escalation, alert-fatigue rules (guide §6) |
| `docs/observability/DEBUGGING.md` | How to debug prod | Querying logs by requestId/userId, reading Sentry, temporary DEBUG mode (guide §11) |
| `docs/runbooks/INCIDENT_RESPONSE.md` | Incident process | SEV levels, roles, comms cadence, MTTD/MTTR targets (guide §13) |
| `docs/runbooks/RUNBOOKS.md` | Fix common issues | DB down, Redis down, queue backlog, email bounce spike, high latency (guide §13 template) |
| `docs/DEPLOYMENT.md` | How we ship | Envs, env-var matrix (§6 here), migrations (`prisma migrate deploy`), rollback, health-gated deploys |
| `docs/SECURITY_LOGGING.md` | Data protection | Redaction field list, PII policy, retention, compliance (guide §12) |
| `docs/ARCHITECTURE.md` (update) | System overview | Add the observability layer + data flow diagram from §2 |

**Definition of done for docs:** each file is concrete to JobFit (real endpoints, real env
vars, real module names), not generic theory.

---

## 5. Phased implementation roadmap

Ordered so each phase is independently shippable and low-risk.

### Phase 0 — Foundations (structured logging + context)  ·  *~1–2 days*
- Add `nestjs-pino`, `pino`, `pino-pretty`, `pino-http`.
- Replace `LoggerService` internals + set Pino as the app logger in `main.ts` (`bufferLogs: true`, `app.useLogger`).
- **Emit GCP-structured JSON** so Cloud Logging + Error Reporting parse it natively: map Pino level → `severity` (e.g. `error`→`ERROR`), `msg`→`message`, and (Phase 3+) add `logging.googleapis.com/trace`. A small Pino `formatters`/`messageKey` config does this.
- Add **correlation-id** middleware using `AsyncLocalStorage`: read `x-request-id`/`X-Cloud-Trace-Context` or generate a UUID; bind to logger context so every line carries `requestId`.
- Retire the duplicate request logger — keep **one** (pino-http), delete/rename `logging.interceptor.ts` **or** `request-logging.middleware.ts`.
- Wire `LOG_LEVEL` + `LOG_FORMAT` env (pretty in dev, JSON in prod).
- **Acceptance:** on Cloud Run, each log line appears in **Cloud Logging** with the correct `severity` and a `requestId`; one request → correlated lines.

### Phase 1 — Redaction & error handling  ·  *~1 day*
- Central **redaction** (Pino `redact` paths + a recursive redactor for nested/body data): `password`, `passwordHash`, `authorization`, `token`, `refreshToken`, `verificationCode`, `passwordResetCode`, `apiKey`, card/SSN patterns (guide §12).
- Harden `AllExceptionsFilter`: attach `requestId`, `userId`, method/path; log 5xx at ERROR, 4xx at WARN/INFO; never leak internals to the client (already mostly done).
- **Acceptance:** unit test proves secrets are `**REDACTED**` before any sink; 5xx logs include full context.

### Phase 2 — Error tracking (Error Reporting, optional Sentry)  ·  *~1 day*
- **GCP-native (free, first):** ensure unhandled errors are logged at `severity=ERROR` with a stack trace — **Error Reporting groups them automatically**, no SDK needed. Add the `@google-cloud/error-reporting` middleware only if you want manual `report()` calls.
- **Optional Sentry:** add `@sentry/nestjs`; init in `main.ts` with `SENTRY_DSN`, `environment`, `release` (git SHA) for session replay / richer release tracking. Disable in dev/test (empty DSN).
- Capture in `AllExceptionsFilter` for 5xx/unhandled; set user context from the JWT (`id`, `email`), **after** redaction.
- **Acceptance:** a forced 500 appears in **Error Reporting** (and Sentry if enabled) with stack trace, requestId, release, user.

### Phase 3 — Health & metrics  ·  *~1–2 days*
- Add `@nestjs/terminus`: `GET /health/live` (process) and `GET /health/ready` (Prisma + Redis + queue) — wire these to Cloud Run **startup & liveness probes** and the Load Balancer health check.
- Add `prom-client`: `GET /metrics` (allowlisted) — default process metrics + custom: HTTP request duration histogram (by route/status), error counter, queue depth gauge. Scrape into **Cloud Monitoring** via the OpenTelemetry/Ops agent (or Google Managed Prometheus).
- Add **OpenTelemetry** trace export to **Cloud Trace**; stamp the trace id into logs for log↔trace correlation.
- Keep the existing **admin** `/admin/system/*` as the human dashboard; have it read the same signals.
- **Acceptance:** `/health/ready` returns 200 only when deps are up (and Cloud Run rolls back a bad revision on probe failure); `/metrics` shows in a Cloud Monitoring dashboard; traces appear in Cloud Trace.

### Phase 4 — Alerting (Cloud Monitoring + Slack) + system_events wiring  ·  *~1–2 days*
- Implement the `NotificationModule` Slack webhook (`SLACK_WEBHOOK_URL`) — reuse it as the in-app alert transport.
- Create **Cloud Monitoring alert policies** (and/or **log-based alerts**) for: error rate > 1% / 5 min, `/health/ready` failing, queue backlog high — route to a Slack **notification channel** (and PagerDuty later).
- On ERROR/FATAL, also **write a `system_events` row** (already modelled) so `GET /admin/system/alerts` reflects the same incidents in-app.
- Add **dedup + suppression window** (guide §6): collapse repeats, mute during deploys.
- **Acceptance:** a simulated error storm produces one Slack alert (deduped, via Cloud Monitoring) **and** a `system_events` row visible in `GET /admin/system/alerts`.

### Phase 5 — Cloud Logging dashboards & retention  ·  *~1 day*
- **Cloud Run already ships JSON stdout to Cloud Logging** (from Phase 0) — no drain to configure. Verify structured fields (`severity`, `requestId`, `trace`) parse correctly.
- Build 3 starter views/dashboards (guide §5) in **Cloud Logging + Cloud Monitoring**: **Overview** (error rate, p95, RPS), **Service health**, **User lookup** (filter by `userId`/`requestId`). Save common queries as Log Views.
- Configure **Log Router sinks**: keep hot logs in Cloud Logging (prod 90d / staging 30d / dev 7d retention buckets) and route an archive/analytics copy to **BigQuery or Cloud Storage**. Add exclusion filters to sample high-volume noise and stay in the free tier.
- **Acceptance:** in Cloud Logging you can answer "show all logs for requestId X" and "all errors last 1h"; retention buckets + archive sink are live.

### Phase 6 — Docs, runbooks, deploy hardening (Cloud Build → Cloud Run)  ·  *~1–2 days*
- Write the docs in §4.
- Add env-var validation for the new keys (`GCP_PROJECT_ID`, `SENTRY_DSN`, `SLACK_WEBHOOK_URL`, `LOG_LEVEL`, …) to `config/env.validation.ts`; store secrets in **Secret Manager**, injected into Cloud Run.
- **Cloud Build** pipeline: build image → push to **Artifact Registry** → deploy to **Cloud Run** with `--no-traffic` then **health-gated traffic migration**; run `prisma migrate deploy` as a release step; document rollback (`gcloud run services update-traffic ... --to-revisions=PREVIOUS=100`).
- **Reconcile the known Prisma schema drift** (see §8) so health/metrics don't hit missing columns.
- **Acceptance:** production-readiness checklist (§7) fully green; a bad revision auto-rolls-back on failed health probe.

---

## 6. Environment configuration matrix

| Var | Dev | Staging | Prod |
|-----|-----|---------|------|
| `LOG_LEVEL` | `debug` | `info` | `info` |
| `LOG_FORMAT` | `pretty` | `json` | `json` |
| `GCP_PROJECT_ID` | *(empty)* | `jobfit-staging` | `jobfit-prod` |
| `GOOGLE_APPLICATION_CREDENTIALS` | *(key file, local only)* | *(Workload Identity)* | *(Workload Identity — no key)* |
| `ERROR_REPORTING_ENABLED` | `false` | `true` | `true` |
| `TRACE_ENABLED` | `false` | `true` | `true` |
| `SENTRY_DSN` (optional) | *(empty)* | set/empty | set/empty |
| `SLACK_WEBHOOK_URL` | *(empty)* | `#staging-alerts` | `#production-alerts` |
| `LOG_SAMPLING` | `1.0` | `1.0` | `0.1` high-volume only |
| `METRICS_ENABLED` | `true` | `true` | `true` (allowlisted) |
| `RELEASE` (git SHA) | local | Cloud Build | Cloud Build |

Add all of these to `config/env.validation.ts` and a `.env.example`. In staging/prod, **inject
secrets from Secret Manager** and use **Workload Identity** (the Cloud Run service account) so no
credential files ship — `GOOGLE_APPLICATION_CREDENTIALS` is only needed for local dev.

---

## 7. Production-readiness checklist (adapted from guide §14)

**Logging** ☐ Pino GCP-JSON in prod ☐ lands in Cloud Logging with correct `severity` ☐ `requestId` on every line ☐ `LOG_LEVEL` via env ☐ secrets redacted
**Errors** ☐ global filter with context ☐ 5xx→ERROR, 4xx→WARN ☐ no internals leaked ☐ grouped in Error Reporting (± Sentry)
**Monitoring** ☐ `/health/live` + `/health/ready` wired to Cloud Run probes ☐ `/metrics` in Cloud Monitoring ☐ Cloud Trace ☐ p95 + error-rate tracked ☐ admin dashboard reads same signals
**Alerting** ☐ Cloud Monitoring policies + Slack tested ☐ rules + thresholds ☐ dedup + suppression ☐ escalation documented
**Docs** ☐ LOGGING/MONITORING/ALERTING/DEBUGGING ☐ runbooks ☐ incident response ☐ deployment
**Deploy** ☐ Cloud Build → Artifact Registry → Cloud Run ☐ Secret Manager + Workload Identity ☐ env validation ☐ migrations gated ☐ health-gated traffic + rollback ☐ schema drift reconciled
**Testing** ☐ redaction unit test ☐ forced-error → Error Reporting/Slack e2e ☐ health flips on dep down

---

## 8. Reuse & alignment notes (specific to JobFit)

- **Reuse `system_events`** (Admin module) as the internal alert ledger — Phase 4 writes to it; `GET /admin/system/alerts` already surfaces it. No new table needed.
- **Reuse `audit_logs`** for *who did what* (already wired to admin actions) — keep distinct from operational logs.
- **Reuse `NotificationModule`** as the Slack transport instead of a new module.
- **`AllExceptionsFilter` + `TransformInterceptor` stay** — we enrich, not replace.
- **Fail-open pattern** (Redis) is already the house style — apply the same to Sentry/Slack so a monitoring outage never breaks requests (guide §6 "monitoring the monitoring").
- **Known blocker to clear first:** the pre-existing **Prisma schema drift** (columns in `schema.prisma` not in the DB, e.g. `resumes.parsingStatus`) currently 500s some endpoints and skews health metrics. Reconcile with `npx prisma migrate dev` (review the diff) in Phase 6, ideally earlier.

---

## 9. Decisions to confirm before Phase 0

1. **Compute:** **Cloud Run** (recommended) vs Compute Engine vs GKE?
2. **Logger:** Pino (recommended) vs `nest-winston` + `@google-cloud/logging-winston`?
3. **Error tracking:** GCP **Error Reporting** only (free) vs also add **Sentry** (session replay / release tracking)?
4. **Alert channel(s)** and who is "on-call" for a student/small team (rotation vs single owner)?

> **Platform decided: Google Cloud Platform** — the earlier "hosting/log-drain target"
> decision is now resolved (Cloud Run + Cloud Logging).
>
> **Database decided (phased): Supabase now → Cloud SQL before production.**
> Keep **Supabase Postgres** for dev/demo/early users (zero migration; you use no
> Supabase-specific feature beyond Postgres). **Migrate to Cloud SQL (Postgres)** *before real
> production traffic* to get same-region/private-IP latency, IAM DB auth, and unified Cloud
> Monitoring. Same phasing for Redis → **Memorystore**. See **Appendix A** for the cutover
> checklist. To minimise cross-cloud latency while on Supabase, run Cloud Run in a region close
> to Supabase's `ap-northeast-1`.

---

*Derived from the reference guide's 14 sections (see the [GCP edition](Senior%20Backend%20Engineers%20%28Google%20Cloud%20Platform%20Edition%29.md)); scoped to JobFit's actual stack on Google Cloud and existing modules. Companion docs to be created per §4.*

---

## Appendix A — Supabase → Cloud SQL migration checklist

Run this **before real production traffic**. It's a plain Postgres move — Prisma is
provider-agnostic, so **no application code changes**, only `DATABASE_URL` + infra.

### A.0 Pre-flight (do first)
- [ ] **Reconcile the Prisma schema drift** (`schema.prisma` ↔ live DB, e.g. `resumes.parsingStatus`) with `npx prisma migrate dev` so you don't carry drift into Cloud SQL.
- [ ] Confirm nothing depends on Supabase-only features (Auth/Storage/Realtime/RLS). JobFit uses **self-managed JWT** — expected clean.
- [ ] Freeze/announce a short maintenance window (or use GCP **Database Migration Service** for near-zero downtime).
- [ ] Take a fresh Supabase backup.

### A.1 Provision Cloud SQL
- [ ] Create **Cloud SQL for PostgreSQL** (match your current major version) in the **same region as Cloud Run**.
- [ ] Enable **private IP** (VPC), automated **backups + PITR**, and (optionally) a read replica.
- [ ] Create the app DB + a least-privilege user; enable **IAM database authentication**.

### A.2 Move the data
- [ ] `pg_dump` from Supabase (schema + data): `pg_dump "$SUPABASE_URL" -Fc -f jobfit.dump`
- [ ] `pg_restore` into Cloud SQL: `pg_restore --no-owner --role=<appuser> -d "$CLOUDSQL_URL" jobfit.dump`
- [ ] Run `npx prisma migrate deploy` against Cloud SQL to verify the schema + `_prisma_migrations` line up.
- [ ] Row-count / spot-check parity between source and target (users, jobs, applications, `system_events`, `audit_logs`).

### A.3 Wire the app (Cloud Run)
- [ ] Add the **Cloud SQL connector** to the Cloud Run service (`--add-cloudsql-instances`) or connect via private IP.
- [ ] Put the new `DATABASE_URL` in **Secret Manager**; grant the Cloud Run **service account** the `Cloud SQL Client` role (Workload Identity — no key files).
- [ ] Set a conservative Prisma **`connection_limit`** (Cloud Run scales out → cap per-instance connections; use the connector's pooling / PgBouncer).

### A.4 Cut over & verify
- [ ] Deploy a Cloud Run revision pointing at Cloud SQL **with `--no-traffic`**, smoke-test it, then migrate traffic (health-gated).
- [ ] Run the existing **[TEST_FLOW_WALKTHROUGH](../TEST_FLOW_WALKTHROUGH.md)** end-to-end (auth → admin → employer → seeker).
- [ ] Watch **Cloud Monitoring**: DB latency down, error rate flat, `/health/ready` green.

### A.5 Aftercare
- [ ] Keep Supabase **read-only as a fallback** for a few days; don't delete until confident.
- [ ] Move `redis` → **Memorystore** the same way if desired (BullMQ + lockout/blacklist; fail-open means low risk).
- [ ] Rotate the old Supabase credentials; remove them from Secret Manager/env.
- [ ] Update `docs/DEPLOYMENT.md` and `.env.example` to the Cloud SQL values.

> **Rollback:** because Supabase stays intact until A.5, cutover rollback is just pointing
> `DATABASE_URL` back and migrating Cloud Run traffic to the previous revision.
