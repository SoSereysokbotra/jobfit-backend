# Project Progress Report

**Project:** JobFit / JobFits — AI-assisted job matching platform
**Report date:** 2026-07-23
**Repositories analyzed:**


| Repo (as requested) | Actual path on disk                                            | Last commit                                                     |
| ------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- |
| `jobfit-frontend`   | `D:\Year2\Jobfit\jobfit-frontend`                              | `17f68f0 feat(dashboard): remove mock data`                     |
| `jobfit-Backend`    | `D:\Year2\Jobfit\jobfit-backend`                               | `d73200e feat(ai service): completed ai service`                |
| `jobfit-Extension`  | `D:\Year2\Jobfit\jobfit-extension`                             | `fb3784a feat(connect backend): connect extension with backend` |
| `jobfit-AI-Service` | `D:\Year2\Jobfit\jobfits-ai-service` (note the different name) | `bda726a completed engine for AI service`                       |


> Method: implementation was treated as the source of truth. Type-checks and test suites were executed; endpoints were counted from controller decorators; the schema was read from `prisma/schema.prisma` and the migration folder. Documentation was used only as corroboration and every conflict found is listed explicitly.

---



## Executive Summary

JobFit is a four-component job-matching platform: a NestJS DDD backend, a Next.js 15 web app, a FastAPI AI microservice fronting Ollama, and an MV3 Chrome extension for LinkedIn. All four components exist as real, compiling code — not scaffolding.

Verified state of the build:

- **Backend:** 402 TypeScript files, 16 feature modules, 30 controllers exposing **107 route handlers**, 24 Prisma models across 10 applied migrations. `tsc --noEmit` is clean; **19 test suites / 111 tests pass**. Deployed to Google Cloud Run (per `docs/DEPLOYMENT_STATUS.md`, 2026-07-15).
- **Frontend:** 192 TS/TSX files, 41 pages, 6 layouts, feature-sliced architecture. `tsc --noEmit` is clean. Integration phases 0–9 of the 10-phase `INTEGRATION_PLAN.md` are substantially complete — auth, profile, resumes, jobs, applications, offers, employer, admin, analytics, learning, saved jobs and recommendations all call the live API.
- **AI service:** fully implemented FastAPI app (6 endpoints, 5 prompt templates, JSON repair, typed errors). **20/20 tests pass** against mocked Ollama. Real output requires Ollama + `qwen3` + `bge-m3`, which could not be verified from the repo state.
- **Extension:** builds and packages cleanly (`release/jobfit-extension-v0.0.1.zip`), but **7 of its 9 data features still run on deterministic mock data**; only auth and the application tracker are live.

The dominant risk is not incompleteness of code but **verification and residual mock data**: several user-facing surfaces present fabricated numbers, the frontend has zero automated tests, and the AI pipeline's real-model behaviour is unproven in this repo state.

**Estimated overall completion: ~72%** (w~80%, fronteeighted: backend nd ~78%, AI service ~85% of its own scope, extension ~55%, cross-cutting QA/deployment ~45%).

---



## Current Development Status


| Component  | Stage                                             | Evidence                                                                                                              |
| ---------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Backend    | Late feature-build / early hardening              | All planned phases 0–7 committed; observability phases 0–6 marked done in `SESSION_HANDOFF.md`; deployed to Cloud Run |
| Frontend   | Integration nearing completion                    | `INTEGRATION_PLAN.md` phases 0–9 wired; phase 10 (gap features + hardening) partially done                            |
| AI service | Feature-complete, unvalidated against real models | All 6 contract endpoints implemented; tests use `respx` mocks, not Ollama                                             |
| Extension  | Shipped-as-demo, blocked on backend routes        | `docs/INTEGRATION_STATUS.md` (2026-07-22) states plainly: "the mocks cannot be switched off yet"                      |


**Active uncommitted work** (a real signal of what is in progress right now):

- `jobfit-backend`: `src/modules/matching/application/use-cases/match-external-job.use-case.ts` (195 lines, untracked), `src/modules/matching/presentation/dtos/external-job-match.dto.ts` (untracked), plus modifications to `matching.controller.ts`, `matching.module.ts`, `main.ts`, `cookie.util.ts`, `cloudbuild.yaml`, `.env.example`. This implements `GET /recommendations/by-job`, the endpoint that unblocks the extension.
- `jobfits-ai-service`: modified `app/prompts/cover_letter.txt` and `app/schemas/generate.py`; untracked `AI_INTEGRATION_HANDOFF.md`.
- `jobfit-extension`: modified `docs/extension_build_plan.md`.
- `jobfit-frontend`: clean working tree.

---



## Technology Stack



### Backend (`jobfit-backend`)

- **Runtime/framework:** Node.js 22, NestJS 10, TypeScript 5.1
- **Architecture:** DDD modular monolith with CQRS (`@nestjs/cqrs`, custom command/query/event buses in `src/shared/`)
- **ORM/DB:** Prisma 5.10 → PostgreSQL (Supabase, `ap-northeast-1` pooler); `pgvector` for 1024-dim embeddings
- **Cache/queue:** Redis (`ioredis`) + BullMQ (`@nestjs/bullmq`)
- **Auth:** self-managed JWT (`@nestjs/jwt`, `jsonwebtoken`, `bcryptjs`), httpOnly refresh cookie
- **Validation:** `class-validator` + `class-transformer` (global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`), `zod` for env validation
- **Docs:** `@nestjs/swagger` at `/api/docs`
- **Observability:** `nestjs-pino`/`pino`, `prom-client`, `@nestjs/terminus`, OpenTelemetry → Cloud Trace
- **Files:** `pdf-parse`, `mammoth`; storage via Supabase buckets
- **Package manager:** pnpm 10.33



### Frontend (`jobfit-frontend`)

- Next.js 15.1 (App Router), React 19, TypeScript 5.7
- Tailwind CSS 3.4 with a CSS-variable token layer; `clsx` + `tailwind-merge`
- TanStack React Query 5.101 (server state), `recharts` (charts), `lucide-react` (icons)
- No component library; all UI is hand-built in `src/shared/components/`



### AI service (`jobfits-ai-service`)

- Python, FastAPI ≥0.110, Uvicorn, Pydantic 2 + `pydantic-settings`, `httpx`
- Ollama backend: `qwen3` (generation), `bge-m3` (1024-dim embeddings)
- Tests: `pytest` + `respx` (HTTP mocking, no GPU required)



### Extension (`jobfit-extension`)

- Chrome MV3, Vite 5 + `@crxjs/vite-plugin`, React 19, TypeScript 5.7
- Tailwind 3.4 with **two builds**: popup (preflight on) and content script (`jf-` prefix, preflight off, Shadow DOM)

---



## Architecture Overview

```
                 ┌────────────────────────┐
   Browser  ───► │  jobfit-frontend       │ Next.js 15 App Router
                 │  (Vercel target)       │ TanStack Query + in-memory access token
                 └───────────┬────────────┘
                             │ HTTPS  /api/v1  (Bearer + httpOnly refresh cookie)
   Chrome    ───────────────►│
   extension  (cookie SSO)   │
                 ┌───────────▼────────────┐
                 │  jobfit-backend        │ NestJS DDD modular monolith
                 │  Cloud Run             │ global JwtAuthGuard + RolesGuard
                 └──┬──────────┬──────┬───┘
                    │          │      │
        Prisma      │          │      │ X-AI-Service-Key
                    ▼          ▼      ▼
            PostgreSQL     Redis /   jobfits-ai-service (FastAPI)
            (Supabase,     BullMQ           │
             pgvector)                      ▼
                                        Ollama (qwen3, bge-m3)
```

Key structural properties verified in code:

- **Secure-by-default routing.** `JwtAuthGuard` and `RolesGuard` are registered as `APP_GUARD` in `app.module.ts`; routes opt out with `@Public()` and restrict with `@Roles('ADMIN'|'EMPLOYER'|'JOB_SEEKER')`.
- **Uniform response envelope.** `TransformInterceptor` wraps every response as `{ success, statusCode, timestamp, data }`; the frontend `apiClient` unwraps it centrally.
- **Layered modules.** Most modules follow `domain / application / infrastructure / presentation` (auth, user, resume, application, employer, admin, matching, job, saved-job). Older/simpler modules (company, payment, notification, offer, generation) are flat.
- **Event-driven side effects.** `@nestjs/event-emitter` + listener classes (`matching/listeners/job-published.listener.ts`, `user-profile-updated.listener.ts`, `notification/listeners/`*).
- **Graceful AI degradation.** Every AI call path (`resume-parser`, `resume-scorer`, `generation`, `matching-embedding`) catches `AiServiceError` and falls back to a heuristic. This is confirmed by test output showing `AI resume parse unavailable (MODEL_TIMEOUT); falling back to heuristic`.

---



## Completed Features



### 1. Authentication & session management

- **Description:** Register → email verification code → login → JWT access token + rotating httpOnly refresh cookie → logout; full 6-digit password-reset flow.
- **Status:** Complete and live end-to-end.
- **Backend files:** `src/modules/auth/`** (CQRS commands/queries, domain value objects, `RefreshTokenEntity`, exception filters), `src/common/guards/jwt-auth.guard.ts`, `roles.guard.ts`.
- **Tables:** `users`, `refresh_tokens`.
- **APIs:** 11 endpoints under `/auth` (`register`, `verify-email`, `resend-email-verification`, `request-password-reset`, `verify-password-reset`, `reset-password`, `resend-password-reset-verification`, `login`, `refresh-token`, `logout`, `me`) + `POST /admin/login`, `POST /admin/logout`.
- **Frontend pages:** `login`, `signup`, `verify-email`, `forgot-password`; `src/providers/auth-provider.tsx` (186 lines) with single-attempt silent refresh.
- **Integration:** Live. Refresh-token hashes are stored (`tokenHash`, SHA-256) with `revokedAt` soft-delete for replay detection.



### 2. User profile, experience, education, skills

- **Status:** Complete.
- **Files:** `src/modules/user/`** (5 controllers), frontend `src/features/user-profile/` (273-line api + 220-line mapper).
- **Tables:** `profiles`, `experiences`, `educations`, `certifications`, `user_skills`, `skills`, `industries`, `user_analytics`.
- **APIs:** 24 endpoints (profiles CRUD + preferences + salary; skills add/list/delete/endorse; experience and education CRUD; `GET /analytics/my-stats`; users admin-side CRUD).
- **Frontend:** `(seeker)/profile`, `(auth)/onboarding/profile`. Onboarding completion is derived from "does `GET /profiles/{userId}` return a profile", documented in `(seeker)/layout.tsx` — there is no `onboardingComplete` column.



### 3. Résumé upload, parsing and scoring

- **Status:** Complete, with AI + heuristic dual paths.
- **Files:** `src/modules/resume/`** — `resume.service.ts` (Supabase upload, 5 MB cap, PDF/DOCX only), `resume-parser.service.ts` (AI-first, regex fallback, records `parsedBy: 'ai'|'heuristic'`), `resume-scorer.service.ts`, `infrastructure/queue/resume-parsing.processor.ts` (BullMQ).
- **Tables:** `resumes`, `parsed_resume_data`.
- **APIs:** 11 endpoints (`POST /resumes` multipart, list, detail, delete, `set-default`, `parsing-status`, `parsed-data`, `ats-score`, `quality-score`, `scores`, `POST /:id/score`).
- **Frontend:** `(seeker)/resumes`, `resumes/[resumeId]`, `(auth)/onboarding/resume`.
- **Integration:** Live; upload is async (`PENDING` → processor → `SUCCESS`/`FAILED`) and the UI polls parsing status. Suggestions are subscription-tier gated (`resume.controller.tier.spec.ts` covers this).



### 4. Jobs: search, detail, ingestion

- **Status:** Complete for the implemented scope.
- **Files:** `src/modules/job/`**, `src/modules/ingestion/sources/themuse.source.ts`.
- **Tables:** `jobs`, `job_skills`, `companies`.
- **APIs:** `GET /jobs` (q, status, remoteType, location, skillIds, salary range, limit/offset — public), `GET /jobs/{id}` (public), `POST /employer/ingest/themuse`, `GET /employer/ingest/jobs`.
- **Frontend:** `(seeker)/jobs`, `jobs/[jobId]`, `employer/imported-jobs`.
- **Integration:** Live. Dedup uses `@@unique([source, externalId])`; ingested rows carry `source`, `externalId`, `externalUrl`, `lastSeenAt`.



### 5. Applications & pipeline

- **Status:** Complete.
- **Tables:** `applications`, `application_timelines`, `application_stage_history`, `contact_persons`.
- **APIs:** seeker `POST/GET /applications`, `GET /applications/{id}`, `PATCH /{id}/status`, `GET /{id}/timeline`, `POST /{id}/contact-person`; employer `GET /employer/applications`, `PATCH /{id}/status`, `POST /{id}/notes`.
- **Frontend:** `(seeker)/applications`, `applications/[applicationId]`, `employer/applications`, `employer/jobs/[jobId]/applicants`.



### 6. Offers & decisions

- **Status:** Complete.
- **Files:** `src/modules/offer/` (seeker + employer controllers), frontend `src/features/offer/`.
- **Tables:** `offers` (compensation, equity, deadlines, `OfferStatus`).
- **APIs:** `GET /offers`, `GET /offers/{id}`, `POST /{id}/accept|decline|negotiate`; employer `POST/PATCH /employer/applications/{id}/offer`, `POST /{id}/offer/withdraw`.
- **Frontend:** `(seeker)/offers` — live.



### 7. Employer module

- **Status:** Complete.
- **APIs (13):** company claim/verify-email/me/detail/update; jobs list/create/update/publish/analytics; applications list/status/notes.
- **Tables:** `employer_profiles`, `companies` (with `isVerified`, `verificationMethod`, `verifiedAt`).
- **Frontend:** `employer/dashboard`, `jobs`, `jobs/new`, `jobs/[jobId]`, `applicants`, `applications`, `settings`, `imported-jobs`.
- **Caveat:** `GET /employer/jobs/{id}/analytics` returns a documented placeholder for views — "no view tracking exists yet (always 0 for now)" (`job-analytics-response.dto.ts`).



### 8. Admin module

- **Status:** Backend complete (15 endpoints); frontend partially complete.
- **Tables:** `system_events`, `email_events`, `audit_logs`.
- **APIs:** admin login/logout, user search/detail/reset-password/unlock/GDPR-delete, system health/metrics/alerts/acknowledge, email metrics/bounces/suppress, audit-logs.
- **Frontend:** `admin/page.tsx`, `admin/users`, `admin/system`, `admin/email` are implemented. `admin/companies`**,** `admin/jobs`**,** `admin/reports` **are literal stubs —** `export default function Page() { return null; }`**.**



### 9. Saved jobs

- **Status:** Complete and live end-to-end (backend module + migration `20260719074331_add_saved_jobs` + frontend `saved-jobs.api.ts` calling real endpoints).
- **APIs:** `GET /saved-jobs`, `POST /saved-jobs`, `POST /saved-jobs/{jobId}/toggle`, `DELETE /saved-jobs/{jobId}`.



### 10. Semantic matching & recommendations

- **Status:** Implemented; correctness depends on the AI service being reachable.
- **Files:** `matching-embedding.service.ts` (writes `vector(1024)` via raw SQL, batches of 4), `recompute-user-matches.use-case.ts`, `recommendations-query.service.ts` (lazy compute on first request), scorers for skills (cosine)/experience/location/salary, `weighted-match.calculator.ts`.
- **Tables:** `recommendations`, `profiles.embedding`, `jobs.embedding` (both `Unsupported("vector(1024)")`), migration `20260720060000_semantic_matching`.
- **APIs:** `GET /recommendations`, `GET /recommendations/by-job` (the latter uncommitted).
- **Frontend:** `(seeker)/recommendations` calls the live endpoint and overlays real `match`, `breakdown`, `reason`.
- **Tests:** `scoring.spec.ts` covers the deterministic scorers.



### 11. Observability & deployment

- **Status:** Complete in-repo; partially applied in GCP.
- Structured pino JSON with correlation IDs, recursive secret redaction (`redaction.spec.ts`), hardened `AllExceptionsFilter` with GCP Error Reporting payloads, `/health/live` + `/health/ready` + `/health/heartbeat`, `/metrics` (Prometheus, token-guarded), OTel→Cloud Trace behind `TRACE_ENABLED`, Slack alerting with Redis dedup and startup grace.
- IaC under `infra/gcp/` (log retention, sinks, dashboards, alert policies); `Dockerfile` + `cloudbuild.yaml`.
- Deployed: `https://jobfit-backend-7g3b6oc3ja-an.a.run.app`, project `jobfit-prod-8869`, region `asia-northeast1`.

---



## Backend Progress

**Modules implemented (16 feature + 2 shared-kernel + infra):** auth, user, company, job, resume, application, offer, saved-job, ingestion, matching, generation, notification, payment, admin, employer, learning, health, metrics, alerting; shared-kernel `skills` and `industries`.

**Authentication.** Self-managed JWT. Access token (Bearer) + rotating single-use refresh token stored as a SHA-256 hash with `revokedAt` for reuse detection. Account lockout service exists (referenced by the admin unlock endpoint). Named throttlers configured in `throttler.config.ts` — **the file itself flags its values as placeholders** because the source policy document was never provided.

**Authorization.** Global `RolesGuard` with `@Roles()`; three roles. Ownership checks are additionally enforced in controllers (e.g. profile sub-resources are "own-only" with the JWT subject compared to `:userId`).

**Database models.** 24 Prisma models (listed under *Database Progress*).

**Services / controllers / DTOs.** 30 controllers, 107 route handlers, 66 `*.dto.ts` files. 39 files import `class-validator`; 61 files use `@ApiProperty`, so Swagger coverage is broad but not universal.

**Validation.** Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })` — unknown properties are rejected platform-wide. Environment variables are validated at boot via `zod` (`src/config/env.validation.ts`).

**File upload.** Multipart résumé upload → Supabase private bucket via `StorageService`; MIME allow-list (PDF/DOCX) and 5 MB cap enforced in `ResumeService`.

**Background jobs.** BullMQ `resume-parsing` queue registered in `ResumeModule` with a `ResumeParsingProcessor`. Note: `src/infra/queue/queue.module.ts` is an **empty shell** whose docstring still says "Phase 2: Add BullModule.registerQueue" — the real registration moved into `ResumeModule`, leaving stale scaffolding behind.

**API documentation.** Swagger UI at `/api/docs` with two bearer schemes and cookie auth registered; `docs/API_ENDPOINTS_REFERENCE.md` was auto-generated from the live OpenAPI spec at **81 operations**. The code now exposes **107 route handlers**, so that document is ~26 operations out of date.

**Error handling.** DI-provided `AllExceptionsFilter`: 5xx→ERROR / 4xx→WARN, non-`HttpException` 500s return a generic message (no internal leakage), stack traces redacted, GCP Error Reporting event emitted, and `AlertingService.onServerError()` fired.

**Known backend stubs (verified in code):**


| File                                                             | State                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------- |
| `modules/company/company.controller.ts`                          | `@Controller('companies')` with **zero routes**                  |
| `modules/payment/payment.controller.ts`                          | `@Controller('payments')` with **zero routes**                   |
| `modules/payment/gateways/stripe.adapter.ts`                     | `createSubscription` returns `''`; `cancelSubscription` empty    |
| `modules/notification/notification.service.ts`                   | `sendEmail` and `createInAppNotification` are empty `/* TODO */` |
| `modules/notification/listeners/*.ts` (3 files)                  | All three handlers are empty TODOs                               |
| `infra/mailer/mailer.service.ts`                                 | `console.log` stub — **no email is actually sent**               |
| `modules/auth/application/queries/get-current-user.query.ts`     | "Placeholder scaffold — no logic yet"                            |
| `modules/auth/infrastructure/external-services/email.service.ts` | "Placeholder scaffold — no logic yet"                            |
| `modules/job/listeners/application-submitted.listener.ts`        | TODO: increment `applicantCount` — column does not exist         |
| `infra/queue/queue.module.ts`                                    | Empty module, stale docstring                                    |


**Testing.** 19 spec files in `src/`, 111 tests, all passing (37 s). Two e2e specs exist in `test/` (`app.e2e-spec.ts`, `auth.e2e-spec.ts`). One suite (`refresh-token.handler.spec.ts`) is an **integration test that hits the real** `DATABASE_URL`, which makes the suite environment-dependent.

---



## Frontend Progress

**Pages completed (41** `page.tsx` **across 5 route groups):**

- `(marketing)`: landing, `about`, `pricing`, `ui-reference`
- `(auth)`: `login`, `signup`, `verify-email`, `forgot-password`, `onboarding/{resume,profile,recommendations}`
- `(seeker)`: `dashboard`, `jobs`, `jobs/[jobId]`, `applications`, `applications/[applicationId]`, `resumes`, `resumes/[resumeId]`, `profile`, `saved-jobs`, `recommendations`, `offers`, `insights`, `learning`, `notifications`, `settings`
- `employer`: `dashboard`, `jobs`, `jobs/new`, `jobs/[jobId]`, `jobs/[jobId]/applicants`, `applications`, `imported-jobs`, `settings`
- `admin`: root, `users`, `system`, `email` (implemented) + `companies`, `jobs`, `reports` (**stubs returning** `null`)

**Layouts (6):** root + one per route group. Seeker/employer/admin layouts enforce role via `useRequireAuth` and gate rendering behind an overlay so SSR and client HTML match.

**Components.** Feature-sliced: `src/features/<domain>/{api,components,hooks}` for 16 domains. Shared UI in `src/shared/components/`:

- `ui/`: button, badge, modal, text-field, form-controls, notes-editor
- `data-display/`: badge, empty-state, match-score-badge, metric-bar, stat-card
- `feedback/`: alert, skeleton
- `layout/`: sidebar, topnav, bottom-tab-bar, dashboard-shell, section-card
- `motion/`: reveal

**Routing.** Next.js App Router with route groups; dynamic segments for job/application/resume detail. One `src/app/api/webhooks/stripe/route.ts` handler exists (a stub, no billing backend).

**Forms.** Hand-rolled controlled forms using `shared/components/ui/form-controls` and `text-field`; no form library. Note `features/auth/components/login-form.tsx` and `signup-form.tsx` are **0-byte files** — the forms live inline in the pages instead.

**State management.** TanStack React Query for all server state, with a central query-key factory (`src/lib/api/query-keys.ts`). Client state is minimal: `src/stores/ui-store.ts` and `src/stores/job-compare-store.ts` (the latter is **0 bytes**). Auth token is held in memory in React context — deliberately not in `localStorage`.

**API integration.** `src/lib/api/client.ts` (328 lines): base URL from `NEXT_PUBLIC_API_URL`, `credentials: "include"`, Bearer injection, envelope unwrapping, typed `ApiError`, and a single-flight silent-refresh latch on 401.

**Responsive design.** 49 of 131 `.tsx` files use Tailwind responsive prefixes; a dedicated `BottomTabBar` exists for mobile alongside the desktop `Sidebar`. Coverage is real but uneven.

**Accessibility.** 40 `aria-`* attributes and 3 explicit `role=` attributes across 131 components. This is thin — no skip links, no documented focus management outside the extension's sidebar, and no automated a11y checking.

**Build health.** `npx tsc --noEmit` exits 0. `npm run build` was not executed for this report. There are **no tests of any kind** in the frontend (no test runner in `package.json`).

**Empty placeholder files (21, all 0 bytes)** — these are declared architecture that was never filled:

```
features/auth/components/login-form.tsx          features/matching/components/match-score-breakdown.tsx
features/auth/components/signup-form.tsx         features/matching/components/recommendation-card.tsx
features/company/api/company.api.ts              features/matching/components/recommendation-tabs.tsx
features/company/components/company-insights-card.tsx   features/matching/components/swipe-deck.tsx
features/company/components/company-profile-form.tsx    features/matching/hooks/use-match-feedback.ts
features/company/hooks/use-company.ts            features/payment/components/billing-settings.tsx
features/insights/components/applications-chart.tsx     features/marketing/components/testimonials-section.tsx
features/insights/components/salary-insights-chart.tsx  providers/theme-provider.tsx
features/insights/components/skill-gap-chart.tsx        shared/hooks/use-media-query.ts
features/job/components/job-detail.tsx           stores/job-compare-store.ts
features/job/components/job-form.tsx
```

---



## Database Progress

**Engine:** PostgreSQL on Supabase, with the `vector` extension enabled for semantic matching.

**Tables completed (24 models):**


| Domain        | Models                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity/auth | `users`, `refresh_tokens`                                                                                                                       |
| Profile       | `profiles`, `experiences`, `educations`, `certifications`, `user_skills`, `user_analytics`, `job_seeker_profiles` (legacy), `employer_profiles` |
| Catalog       | `skills`, `industries`, `job_skills`                                                                                                            |
| Jobs          | `companies`, `jobs`, `saved_jobs`                                                                                                               |
| Résumés       | `resumes`, `parsed_resume_data`                                                                                                                 |
| Applications  | `applications`, `application_timelines`, `application_stage_history`, `contact_persons`, `offers`                                               |
| Matching      | `match_scores` (legacy), `recommendations`                                                                                                      |
| Admin         | `system_events`, `email_events`, `audit_logs`                                                                                                   |


**Enums (12):** `UserRole`, `JobStatus`, `ApplicationStatus`, `SubscriptionTier`, `JobLevel`, `RemoteType`, `EmploymentType`, `DegreeLevel`, `ResumeParsingStatus`, `OfferStatus`, `CompanyVerificationMethod`, plus the four admin enums (`SystemEventType`, `SystemEventSeverity`, `EmailEventType`, `AuditActionType`, `AuditResourceType`).

**Relationships.** Well specified with explicit named relations where a table references `User` more than once (`PostedByEmployer`, `ReviewedByEmployer`, `ExtendedOffers`, `MovedByUser`, `AdminAuditLogs`, `AcknowledgedSystemEvents`). Delete behaviour is deliberate: `Cascade` for owned data, `SetNull` for actor references, `Restrict` on `UserSkill → Skill`.

**Constraints.** Meaningful uniqueness throughout: `applications(userId, jobId)`, `saved_jobs(userId, jobId)`, `recommendations(userId, jobId)`, `match_scores(jobId, jobSeekerProfileId)`, `user_skills(userId, skillId)`, `jobs(source, externalId)` (NULL-distinct, so direct postings never collide), `refresh_tokens.tokenHash`.

**Indexes.** Present on every foreign key used for filtering plus query-shaped composites: `users(email|role|subscriptionTier)`, `refresh_tokens(userId, revokedAt)`, `recommendations(userId, score)`, `resumes(parsingStatus)`, `system_events(severity|createdAt|acknowledgedAt)`, `jobs(source)`, `jobs(postedByEmployerId)`.

**Soft deletes.** `deletedAt` on users, profiles, experiences, educations, certifications, user_skills, user_analytics, companies, resumes, applications.

**Migrations (10, all named and ordered):**
`init_schema_with_auth` → `user_module` → `company_module` → `admin_module` → `employer_module` → `reconcile_resume_application_drift` → `add_saved_jobs` → `job_ingestion_fields` → `add_parsed_by` → `semantic_matching`.

**Seed data.** `prisma/seed.ts` (12.7 KB) seeds skills, industries and baseline records; `scripts/create-test-users.ts` provisions pre-verified ADMIN/EMPLOYER/JOB_SEEKER accounts.

**Missing entities / known gaps:**

- **No** `notifications` **table.** `EmailEvent.notificationId` is explicitly a soft reference with no FK, commented "there is no notifications table yet".
- **No payments/subscriptions tables.** `User.subscriptionTier` exists but nothing records transactions, invoices, or Stripe customer/subscription IDs.
- **No interview-scheduling entity.** The frontend `InterviewScheduler` component has no backing store.
- `Job` **lacks** `employmentType`**,** `experienceLevel`**,** `industry` — the frontend mappers hardcode `"Full-time"`, `"Mid-level"`, `"Technology"` with `TODO(backend)` markers.
- **No job-view tracking**, so employer analytics returns 0 views by design.
- **No deadline field on** `SavedJob` — required by the extension's deadline chip.
- **Legacy duplication:** `JobSeekerProfile` coexists with the newer `Profile`; `MatchScore` (keyed on `jobSeekerProfileId`) coexists with `Recommendation` (keyed on `userId`). The schema comment on `Recommendation` states it exists specifically because the legacy table is empty. This is unresolved technical debt.

---



## AI Progress

**AI service implemented endpoints (all under** `/api/v1`**, guarded by** `X-AI-Service-Key`**):**


| Endpoint                      | Purpose                                     | Implementation                 |
| ----------------------------- | ------------------------------------------- | ------------------------------ |
| `GET /health`                 | Liveness + `modelsLoaded`                   | `routers/health.py`, no auth   |
| `POST /embed`                 | BGE-M3 1024-dim vectors                     | `services/embed_service.py`    |
| `POST /resume/parse`          | Text → structured résumé JSON               | `services/resume_service.py`   |
| `POST /resume/score`          | ATS + quality score, breakdown, suggestions | `services/resume_service.py`   |
| `POST /generate/cover-letter` | Cover letter                                | `services/generate_service.py` |
| `POST /generate/interview`    | Questions or answer feedback                | `services/generate_service.py` |


**Models integrated.** Ollama `qwen3` (generation) and `bge-m3` (embeddings, dim 1024), configured in `app/config.py` with separate timeouts (60 s generate / 10 s embed).

**Prompt engineering.** Five externalized templates in `app/prompts/`: `resume_parse.txt`, `resume_score.txt`, `cover_letter.txt`, `interview.txt`, `interview_feedback.txt`, loaded via `app/core/prompts.py`. `app/core/json_repair.py` (57 lines) recovers malformed model JSON — a pragmatic and necessary piece for local LLM output.

**Embedding pipeline.** Backend-side in `matching-embedding.service.ts`: job vector = title + description + skills; candidate vector = profile (headline/bio/industries) + latest parsed résumé (summary/skills/experience titles). Written via raw SQL because Prisma cannot handle the `vector` type. Inputs are capped at 8000 characters and batched 4-at-a-time to stay inside the 10 s embed timeout. Events (`job-published`, `user-profile-updated`) trigger re-embedding.

**Résumé parsing.** AI-first with a regex/section heuristic fallback; the chosen path is persisted as `ParsedResumeData.parsedBy` (`'ai'` | `'heuristic'`), so data provenance is auditable — a good design decision.

**Recommendation system.** Weighted blend of cosine similarity (skills, 40%) plus deterministic experience/location/salary scorers; results persisted to `recommendations` with `breakdown` and `reasonExplanation`; computed lazily on first request and re-computable in batch.

**Testing.** `tests/{test_health,test_embed,test_resume,test_generate}.py` — **20 tests, all passing** in 2.7 s using `respx` to mock Ollama. Backend-side, `ai.client.spec.ts` verifies retry-on-5xx, timeout handling and typed errors.

**Missing / unverified AI work:**

1. **No end-to-end validation against real models.** All tests mock Ollama. Nothing in the repos demonstrates a successful `qwen3`/`bge-m3` round-trip. *Unable to verify from the current project state.*
2. **No deployment artifacts for the AI service** — no Dockerfile, no `cloudbuild.yaml`, no infra directory in `jobfits-ai-service`. The backend's `AI_SERVICE_URL` is set in `.env` but the service's own hosting story is undefined.
3. **Cover-letter contract conflict.** `CoverLetterRequest.job_description` is required and non-empty; the extension's privacy rule forbids transmitting job descriptions. `docs/INTEGRATION_STATUS.md` calls this "Blocker B". The uncommitted edits to `app/schemas/generate.py` and `app/prompts/cover_letter.txt` appear to be the in-progress fix, but the change is unverified.
4. **No answer-feedback or interview-coaching UI** on the frontend consuming `POST /generate/interview` beyond the empty `interview-scheduler` seam.
5. **No embedding backfill job** for jobs/profiles that existed before the `semantic_matching` migration — only event-driven and per-user lazy paths were found.

---



## API Progress

**Implemented:** 107 route handlers across 30 controllers. Distribution:


| Area                                                           | Endpoints |
| -------------------------------------------------------------- | --------- |
| Auth (incl. admin auth)                                        | 13        |
| Users / profiles / skills / experience / education / analytics | 24        |
| Résumés                                                        | 11        |
| Applications (seeker)                                          | 6         |
| Offers (seeker + employer)                                     | 8         |
| Jobs (public)                                                  | 2         |
| Saved jobs                                                     | 4         |
| Recommendations / matching                                     | 2         |
| Learning                                                       | 2         |
| Generation                                                     | 2         |
| Employer (company/jobs/applications)                           | 13        |
| Ingestion                                                      | 2         |
| Admin (system/users/email/audit)                               | 15        |
| Health / metrics / root                                        | 5         |


**REST resource design.** Consistent and predictable: plural nouns, nested sub-resources (`/profiles/{userId}/skills/{skillId}/endorse`), verbs only for genuine state transitions (`/publish`, `/accept`, `/decline`, `/toggle`, `/acknowledge`).

**Request validation.** Global `ValidationPipe` with `forbidNonWhitelisted` — unknown fields are rejected everywhere. 66 DTOs; 39 files use `class-validator` decorators.

**Response consistency.** Uniform `{ success, statusCode, timestamp, data }` envelope via `TransformInterceptor`, with two deliberate exceptions: `/metrics` (uses `@Res` for Prometheus exposition format) and `GET /recommendations/by-job` (returns 204 with an empty body when there is no profile, rather than a fabricated score).

**Authentication requirements.** Secure by default; `@Public()` opens only: auth entry points, `GET /jobs`, `GET /jobs/{id}`, `GET /profiles/{userId}`, the profile sub-resource list routes, `GET /users/email/{email}`, `GET /skills/{skillId}/learning-resources`, the three health probes, and `/metrics` (token-guarded separately).

**Missing endpoints (each has a consumer waiting):**


| Missing endpoint                                                                                                                                                       | Consumer                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Notifications CRUD/feed                                                                                                                                                | `(seeker)/notifications`, notification bell                          |
| Billing: checkout, subscription, invoices                                                                                                                              | `(marketing)/pricing`, `settings` billing, Stripe webhook stub       |
| Company: public read/search                                                                                                                                            | `features/company/api/company.api.ts` (0 bytes), seeker company view |
| Salary insights                                                                                                                                                        | `(seeker)/insights` salary section; extension salary panel           |
| Application/interview trend time-series                                                                                                                                | seeker dashboard chart, employer dashboard chart                     |
| Interview scheduling                                                                                                                                                   | `features/application/components/interview-scheduler.tsx`            |
| Per-résumé ATS issue list                                                                                                                                              | `(seeker)/resumes`                                                   |
| Session/device list, activity log                                                                                                                                      | `(seeker)/settings`                                                  |
| Self-serve account unlock                                                                                                                                              | `login` page                                                         |
| OAuth (Google)                                                                                                                                                         | `signup`/`login` (buttons rendered but disabled)                     |
| `GET /learning/gap`, `GET /companies/by-name`, `GET /salary`, `GET /saved-jobs/deadline`, `GET /recommendations/scout`, extension-shaped `POST /generate/cover-letter` | Chrome extension (5 of its 7 mocked features)                        |
| Admin: companies, jobs, reports                                                                                                                                        | the three stub admin pages                                           |


**Documentation drift:** `docs/API_ENDPOINTS_REFERENCE.md` claims **81 operations**; the code now has **107 handlers**. The document also lists the base URL as `localhost:3000` while `INTEGRATION_PLAN.md` and both clients standardize on `localhost:4000`.

---



## Current Work in Progress

1. `GET /recommendations/by-job` **— ad-hoc external job matching (backend, uncommitted).** `match-external-job.use-case.ts` scores a LinkedIn posting from title + company alone (fresh embedding vs. stored profile vector + deterministic scorers), persisting nothing. This directly addresses "Blocker A" in the extension's integration status. Code is written and type-checks; it is neither committed nor deployed.
2. **AI cover-letter contract relaxation (AI service, uncommitted).** Modified `app/schemas/generate.py` and `app/prompts/cover_letter.txt` — consistent with option 1 of the documented fix for "Blocker B" (make `job_description` optional).
3. **Extension mock-to-real cutover (blocked).** `src/data/source.ts` has 8 per-feature flags; only `applications` is `"real"`. The `recommendations` flag carries an explicit note: the backend endpoint *is* implemented, but flipping the flag before that backend is deployed would show errors on every job page.
4. **Residual mock data on live pages (frontend).**
  - `(seeker)/dashboard`: `applicationTrendData` and `recentActivity` are hardcoded arrays.
  - `(seeker)/settings`: `MOCK_SESSIONS` and `MOCK_ACTIVITY_LOG`.
  - `(seeker)/insights`: salary section has no live source.
  - `employer/dashboard`: `EMPLOYER_TREND_PLACEHOLDER` series.
  - `features/notification/api/notification.api.ts`: 5 hardcoded notifications; read state is client-only.
  - `features/payment/api/payment.api.ts`: hardcoded plan definitions.
  - `features/auth/components/google-oauth-modal.tsx`: `MOCK_ACCOUNTS` demo modal.
  - `features/job/api/job.mock.ts`: 214 lines of `MOCK_JOBS` that **no file imports any more** — dead code.
5. **Placeholder components.** 21 zero-byte files (listed above), 3 admin pages returning `null`, `interview-scheduler.tsx` with no backend.
6. **Backend TODOs still open.** Mailer stub, notification service and its 3 listeners, Stripe adapter, `get-current-user.query.ts`, `email.service.ts`, job `applicantCount` increment, and the throttler values flagged as placeholders.

---



## Remaining Tasks



### High priority

1. **Commit and deploy the uncommitted backend matching work** (`match-external-job.use-case.ts`, `external-job-match.dto.ts`, controller/module changes) — the extension is blocked behind it.
2. **Decide Cloud Run access policy.** The service currently returns 403 without a Google identity token (`DEPLOYMENT_STATUS.md`), which means the deployed frontend and extension cannot reach it as-is. Either make it public or front it appropriately.
3. **Rotate the Supabase service-role key.** `docs/DEPLOYMENT_STATUS.md` records that the real service-role key, anon key and JWT secret were pasted into a chat transcript. Explicitly flagged as an open security action.
4. **Provision Redis in production.** `REDIS_URL` is an empty Secret Manager entry and is omitted from `--set-secrets`. Without it, BullMQ résumé parsing, refresh-token caching, and Slack alert dedup all run degraded or not at all.
5. **Define AI-service hosting.** No Dockerfile or deploy pipeline exists for `jobfits-ai-service`; without it, résumé parsing/scoring, embeddings, recommendations and generation all silently fall back to heuristics in production.
6. **Validate the full AI pipeline against real Ollama models** (parse → score → embed → recommend → cover letter) and record the results.
7. **Replace the mailer stub with a real provider.** Email verification and password reset are core auth flows that currently only `console.log`. This makes the deployed registration flow non-functional.
8. **Finish or remove the three stub admin pages** (`companies`, `jobs`, `reports`).



### Medium priority

1. Build the **notifications** backend (table + endpoints) and swap `notification.api.ts` to live.
2. Add missing `Job` columns (`employmentType`, `experienceLevel`, `industry`) and remove the hardcoded defaults in `job.mappers.ts` / `employer.mappers.ts`.
3. Add **trend/time-series analytics endpoints** for seeker and employer dashboards; delete the hardcoded chart arrays.
4. Build the extension-facing endpoints: `GET /learning/gap`, `GET /companies/by-name`, `GET /salary`, `GET /saved-jobs/deadline`, `GET /recommendations/scout`, and an external-job-shaped cover-letter route.
5. **Regenerate** `docs/API_ENDPOINTS_REFERENCE.md` from the live OpenAPI spec (81 → 107) and correct the base URL.
6. **Correct or retire** `docs/JobFits_ER_Diagram.md` — it does not describe the implemented schema (details under *Risks*).
7. Introduce a **frontend test setup** (at minimum: API client, auth provider, mappers, and one route-protection test).
8. Resolve the **legacy/new model duplication**: migrate off `JobSeekerProfile` and `MatchScore`, or document why both must remain.
9. Delete dead code: `job.mock.ts`, `infra/queue/queue.module.ts`, and either fill or remove the 21 empty files.
10. Add an **embedding backfill job** for pre-existing jobs and profiles.
11. Replace the placeholder throttler limits with a deliberate rate-limit policy.



### Low priority

1. Billing/subscription backend (Stripe) and the `billing-settings` component.
2. Session/device management and activity log for `(seeker)/settings`.
3. Google OAuth, or remove the disabled buttons and the mock modal.
4. Interview scheduling entity + endpoints.
5. Accessibility pass (focus management, skip links, automated a11y checks).
6. Chrome Web Store submission (listing pack and privacy policy are already written).
7. Supabase → Cloud SQL migration (planned as Appendix A of the monitoring plan, "before real prod traffic").
8. Second ingestion source and/or Indeed adapter in the extension.

---



## Risks

**Technical debt**

- Two parallel model pairs for the same concept (`JobSeekerProfile`/`Profile`, `MatchScore`/`Recommendation`) — every future query must know which one is authoritative.
- 21 empty files and 3 `return null` pages create a false impression of completeness when browsing the tree.
- `queue.module.ts` and `job.mock.ts` are dead code with misleading docstrings.
- Inconsistent module depth: some modules are full DDD (4 layers), others are flat single files (`company`, `payment`, `notification`). Both patterns are in `app.module.ts` side by side.

**Missing tests**

- Frontend: **zero tests**, across 41 pages and 192 files. This is the single largest coverage gap.
- Extension: **zero tests**.
- Backend: 111 tests, but concentrated in auth/logging/AI-client/scoring. There are no tests for the employer, admin, application, offer, saved-job, or ingestion modules, and only 2 e2e specs.
- One backend suite hits a live database, so results depend on environment rather than code.

**Security concerns**

- **Known credential exposure**: Supabase service-role key rotation is documented as outstanding.
- `.env` files with real values exist in `jobfit-backend`, `jobfit-extension` and `jobfits-ai-service` working trees. `.gitignore` coverage should be re-verified before any repository is made public.
- The AI service default `ai_service_key` is `"change-me"` — safe only if the environment always overrides it.
- Rate-limit values are self-declared placeholders on auth endpoints (brute-force surface).
- No email delivery means password-reset and verification codes cannot reach users in production — a functional and a support-burden risk.
- The extension ships mock "analysis" that looks authoritative; `INTEGRATION_STATUS.md` §6 explicitly warns it "must not be shown to real users as if it were real analysis". Shipping in this state would be a user-trust problem.

**Performance bottlenecks**

- Embeddings are generated 4-at-a-time because Ollama embeds sequentially and the timeout is 10 s. Recomputing recommendations for a large user base will be slow.
- `RecommendationsQueryService` computes matches **synchronously inside the HTTP request** when the cache is empty — first-request latency is bounded by AI-service round-trips.
- No pgvector ANN index (e.g. IVFFlat/HNSW) was found in the migrations; similarity search will degrade linearly with job count.
- Company search uses case-insensitive `contains` — the schema comment itself notes a tsvector GIN index is needed for production-grade search.

**Scalability issues**

- Single-instance BullMQ worker colocated with the API process; no separate worker deployment.
- Supabase pooler as the production database, with a Cloud SQL migration still pending.
- The monolith is well modularized, so this is manageable, but résumé parsing and embedding are CPU/IO-heavy tenants of the same process.

**Missing documentation**

- Frontend `README.md` is one line (`# jobfit-frontend`); backend `README.md` is one line.
- No ADRs — `docs/adr/` exists but is **empty**, despite many significant decisions having been made.
- No consolidated environment-variable matrix spanning all four services.

**Dependency risks**

- `@crxjs/vite-plugin@2.0.0-beta.34` — a beta plugin in the extension build path.
- `pdf-parse@1.1.4` is long unmaintained.
- Frontend `requirements`/versions are pinned loosely (`^`); AI service requirements are lower bounds only, with the file itself noting "pin exact versions with `pip freeze` once building starts" — that pinning never happened.
- Hard dependency on a self-hosted GPU box running Ollama, with no managed fallback provider.

**Documentation/implementation conflicts found (implementation is correct in each case):**


| Conflict                                                                                     | Reality                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jobfits-ai-service/README.md`: "**Status:** Planning. No application logic is written yet." | The service is fully implemented with 20 passing tests. `AI_INTEGRATION_HANDOFF.md` also calls the README stale.                                   |
| `docs/JobFits_ER_Diagram.md`: `users` has `firstName`/`lastName`, role enum `USER            | PREMIUM                                                                                                                                            |
| `docs/API_ENDPOINTS_REFERENCE.md`: "81 operations", base URL `:3000`                         | 107 route handlers; both clients target `:4000`                                                                                                    |
| `INTEGRATION_PLAN.md` Phase 10: saved-jobs and matching listed as "no endpoint, keep mocked" | Both are now implemented backend-side and wired live in the frontend                                                                               |
| `infra/queue/queue.module.ts`: "Phase 2: Add BullModule.registerQueue here"                  | Queue registration lives in `ResumeModule`; this module is empty                                                                                   |
| Extension `README.md`: "Testing Phases 3–5 … all on MOCK data" vs. `INTEGRATION_STATUS.md`   | Consistent, but both are ahead of `source.ts`, where `recommendations` is still `"mock"` even though the backend endpoint now exists (uncommitted) |


---



## Technical Decisions


| Area                   | Decision                                                                                                                                                               | Evidence                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Backend framework      | NestJS 10, **DDD modular monolith with CQRS** rather than microservices                                                                                                | `src/modules/*/{domain,application,infrastructure,presentation}`, `src/shared/{command,query,event}-bus` |
| ORM                    | Prisma 5.10; raw SQL only where Prisma cannot help (pgvector)                                                                                                          | `schema.prisma` `Unsupported("vector(1024)")` + `matching-embedding.service.ts`                          |
| Database               | PostgreSQL on Supabase now, **Cloud SQL before production** (phased, deliberate)                                                                                       | `SESSION_HANDOFF.md`, `DEPLOYMENT.md` Appendix A                                                         |
| Authentication         | **Self-managed JWT, not Supabase Auth**: in-memory access token + rotating httpOnly refresh cookie, hashed at rest                                                     | `auth` module, `auth-provider.tsx`, `refresh_tokens.tokenHash`                                           |
| Authorization          | Global guards, opt-out (`@Public()`) rather than opt-in                                                                                                                | `app.module.ts` `APP_GUARD`                                                                              |
| API shape              | Versioned prefix `/api/v1` + uniform response envelope                                                                                                                 | `main.ts`, `TransformInterceptor`                                                                        |
| Frontend framework     | Next.js 15 App Router + React 19, **feature-sliced** (`features/<domain>/{api,components,hooks}`)                                                                      | directory structure                                                                                      |
| Frontend state         | **TanStack Query for server state**; deliberately minimal client state; **no token in localStorage**                                                                   | `INTEGRATION_PLAN.md` "Locked decisions", `auth-provider.tsx`                                            |
| Data shape adaptation  | Per-feature **mapper layer** (`*.mappers.ts`) so backend DTO changes never reach components                                                                            | 5 mapper files                                                                                           |
| Styling                | Tailwind over a CSS-variable token layer; **no hardcoded colors, no arbitrary values**; tokens shared verbatim with the extension                                      | `rule_for_develop_frontend.md`, `tailwind.theme.ts`                                                      |
| File storage           | Supabase Storage private buckets (résumés, company logos, job attachments)                                                                                             | `StorageService`, `supabase.config.ts`                                                                   |
| Background jobs        | BullMQ + Redis, fail-open (Redis unavailability degrades rather than breaks)                                                                                           | `redis.health-indicator`, health readiness design                                                        |
| AI topology            | Separate **stateless** FastAPI service; backend does all file handling and persistence; **every AI call has a heuristic fallback**                                     | `AI_INTEGRATION_HANDOFF.md`, fallbacks in 4 backend services                                             |
| AI provenance          | Persist which path produced the data (`parsedBy: 'ai'                                                                                                                  | 'heuristic'`)                                                                                            |
| Deployment             | Docker → Cloud Build → **Cloud Run**, secrets in Secret Manager, migrations as a build step                                                                            | `Dockerfile`, `cloudbuild.yaml`, `DEPLOYMENT_STATUS.md`                                                  |
| Observability          | Provider-agnostic app code (pino/prom-client/OTel) with GCP-native sinks; log-based error reporting instead of an APM SDK                                              | `docs/observability/*`, `src/common/logging/*`                                                           |
| Extension architecture | MV3 service worker owns all network + auth interpretation; content script renders in **Shadow DOM** with a prefixed Tailwind build; **cookie SSO** — no separate login | `background/features.ts`, `content/shadow.ts`, `background/auth.ts`                                      |
| Extension data policy  | **Never scrape or transmit job descriptions**; identifiers only; per-feature mock/real flags                                                                           | `manifest.config.ts` comments, `data/source.ts`, `PRIVACY.md`                                            |
| Ingestion policy       | Only licensed API sources (TheMuse); **no LinkedIn/Indeed scraping**, treated as a hard TOS constraint                                                                 | `INTEGRATION_STATUS.md` §3                                                                               |


---



## Quality Assessment


| Category              | Score  | Justification                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Code organization** | 8.5/10 | Consistent DDD layering in the major backend modules, clean feature slicing in the frontend, and a genuinely shared design-token layer between web and extension. Marked down for mixed module depth (flat `company`/`payment`/`notification` next to 4-layer modules) and 21 empty placeholder files.                                                                                                                                       |
| **Maintainability**   | 7.5/10 | Strong seams: mapper layer isolates DTO drift, `AiClient` isolates the AI dependency, `source.ts` makes the extension's mock→real cutover a one-line change. Held back by dead code, duplicated legacy models, and stubs that require tribal knowledge to interpret.                                                                                                                                                                         |
| **Readability**       | 9/10   | Unusually good. Comments explain *why*, not *what* — e.g. why `Recommendation` exists alongside `MatchScore`, why NULL-distinct dedup works, why CORS cannot use a wildcard with credentials, why the auth overlay renders identical SSR/client HTML. Naming is consistent throughout.                                                                                                                                                       |
| **Consistency**       | 7/10   | Response envelope, guard strategy, path aliases, error handling and token usage are uniform. Inconsistencies: two profile models, two match models, DDD vs. flat modules, and Swagger annotations on 61 of ~100+ relevant files.                                                                                                                                                                                                             |
| **Architecture**      | 8.5/10 | Sound service boundaries, event-driven side effects, graceful degradation everywhere the AI is involved, secure-by-default routing, and a deliberate stateless AI service. Deducted for synchronous match computation in the request path and no ANN index behind the vector search.                                                                                                                                                         |
| **Documentation**     | 6.5/10 | Volume is high (17 backend docs, 7 frontend, 5 extension, 4 AI-service) and the planning documents are genuinely good. But it is measurably stale: a README saying "no logic written" for a finished service, an ER diagram that does not match the schema, an endpoint reference 26 operations behind, an empty ADR folder, and one-line repo READMEs for the two largest codebases.                                                        |
| **Scalability**       | 6.5/10 | Modular monolith is the right call at this stage and the DB indexing is thoughtful. But: no vector index, sequential embedding with small batches, a worker colocated with the API, Supabase pooler in production, and lazy match computation inside HTTP requests.                                                                                                                                                                          |
| **Security**          | 6/10   | Strong fundamentals — global guards, hashed rotating refresh tokens, `forbidNonWhitelisted` validation, recursive log redaction, generic 500s, MIME/size upload limits, private storage buckets, service-to-service key auth. Offset by a documented un-rotated credential exposure, placeholder rate limits, a default `"change-me"` service key, no working email (so account recovery is broken), and real `.env` files in working trees. |
| **Testing**           | 4/10   | 131 tests total across four repos (111 backend + 20 AI service), all passing, with good coverage of auth, redaction, scoring and AI fallbacks. But the frontend and extension have **no tests at all**, most backend modules are untested, only 2 e2e specs exist, one suite needs a live DB, and no AI test exercises a real model.                                                                                                         |


**Weighted overall: 7.1/10** — well-architected and unusually well-commented code, held back by verification (tests, staleness of docs) rather than by design.

---



## Recommended Next Milestones



### Milestone 1 — Make the deployed stack actually usable

**Objective:** A real user can register, verify, log in and use the app against the deployed backend.
**Expected outcome:** Cloud Run reachable from the deployed frontend; real emails delivered; Redis provisioned so résumé parsing runs; Supabase service-role key rotated; frontend `.env` pointing at the deployed API instead of `localhost:4000`.
**Dependencies:** GCP project access, an email provider account, Memorystore or an equivalent Redis.
**Complexity:** Medium.

### Milestone 2 — Stand up and validate the AI service in a deployed environment

**Objective:** AI features produce real output rather than silently falling back to heuristics.
**Expected outcome:** Dockerfile + deploy pipeline for `jobfits-ai-service`; Ollama host with `qwen3` + `bge-m3` reachable; a recorded end-to-end run of parse → score → embed → recommend; `parsedBy: 'ai'` observed in the database; the AI service README corrected.
**Dependencies:** Milestone 1 (backend must reach it); a GPU host.
**Complexity:** High.

### Milestone 3 — Unblock and honestly ship the extension

**Objective:** Remove fabricated data from user-visible extension surfaces.
**Expected outcome:** The uncommitted `by-job` matching work committed and deployed; `recommendations` flipped to `"real"`; the AI cover-letter `job_description` relaxation completed and verified; `learning/gap`, `companies/by-name`, `salary`, `saved-jobs/deadline`, `scout` either implemented or their features hidden rather than mocked.
**Dependencies:** Milestones 1 and 2.
**Complexity:** Medium-High.

### Milestone 4 — Eliminate residual mock data in the web app

**Objective:** No live page shows fabricated numbers.
**Expected outcome:** Notifications backend built and wired; trend/time-series endpoints added for both dashboards; salary-insights source decided (build or remove); settings sessions/activity either implemented or removed; the three stub admin pages finished or deleted; `job.mock.ts`, `MOCK_SESSIONS`, `MOCK_ACTIVITY_LOG` and the Google OAuth mock removed.
**Dependencies:** Backend endpoints from this milestone's own scope.
**Complexity:** Medium.

### Milestone 5 — Test and documentation truth-up

**Objective:** The repositories can be trusted without reading every file.
**Expected outcome:** A frontend test runner with coverage of the API client, auth provider, mappers and route protection; backend tests for employer/admin/application/offer/saved-job; the DB-dependent suite isolated from the default run; `API_ENDPOINTS_REFERENCE.md` regenerated; the ER diagram corrected or retired; ADRs written for the decisions listed in *Technical Decisions*; real READMEs for the two main repos.
**Dependencies:** None — can run in parallel with Milestones 3 and 4.
**Complexity:** Medium.

### Milestone 6 — Performance and scale hardening

**Objective:** Matching stays fast as jobs and users grow.
**Expected outcome:** pgvector ANN index (IVFFlat or HNSW); embedding backfill job for pre-existing rows; recommendation computation moved out of the request path into the queue; separate worker deployment; tsvector GIN index for company search; deliberate rate-limit policy replacing the placeholders.
**Dependencies:** Milestone 2 (embeddings must be real first).
**Complexity:** High.

### Milestone 7 — Monetization and remaining product surface

**Objective:** Close the commercial and secondary-feature gaps.
**Expected outcome:** Stripe subscription backend + tables + the `billing-settings` component; interview scheduling entity and endpoints; Google OAuth or its removal; Chrome Web Store submission; Supabase → Cloud SQL migration.
**Dependencies:** Milestones 1–4.
**Complexity:** High.

---



## Overall Project Health

**Status: Healthy, with concentrated verification risk.**

**Strengths**

- Four components that all compile cleanly (`tsc --noEmit` exits 0 in all three TypeScript repos) and whose 131 automated tests all pass.
- A backend that is substantially more mature than typical at this stage: 107 endpoints, 10 ordered migrations with no outstanding drift, complete observability (structured logging, correlation IDs, redaction, health probes, metrics, tracing, alerting), and a live Cloud Run deployment.
- Design decisions that consistently favour resilience: heuristic fallbacks behind every AI call, fail-open Redis, NULL-distinct dedup, data provenance recorded in the schema.
- Genuine architectural discipline shared across repos — the same design tokens, the same auth model, the same envelope, a mapper layer that keeps DTO churn out of components.
- Honest internal documentation: `docs/INTEGRATION_STATUS.md` states plainly that mocks cannot yet be switched off, and explicitly warns that the mock data must not be shown to users as real analysis. Self-reporting of this quality is rare and materially reduces project risk.

**Concerns**

1. **Nothing about the AI pipeline has been validated against real models.** Because every AI path degrades silently to a heuristic, a fully non-functional AI layer would look identical to a working one in production. This is the highest-severity risk in the project.
2. **The deployed backend is unreachable without a Google identity token**, so "deployed" does not yet mean "usable by the frontend or extension".
3. **Email does not work.** The mailer is a `console.log` stub, which breaks verification and password reset — both mandatory paths in the shipped auth flow.
4. **Zero frontend and extension test coverage** across 41 pages and a Chrome extension prepared for store submission.
5. **A documented, unrotated credential exposure.**
6. **Fabricated data on user-visible surfaces** in both the web app and the extension.

**Trajectory.** Commit cadence is steady and the recent direction is correct — the last commits in each repo (`feat(dashboard): remove mock data`, `feat(ai service): completed ai service`, `feat(connect backend): connect extension with backend`) all move toward real data. The remaining work is weighted heavily toward *proving* and *deploying* what exists rather than writing new features, which is a comfortable position to be in.

**Recommended immediate focus:** Milestones 1 and 2 — production reachability and real AI validation. Both are prerequisites for essentially every remaining item, and both are currently masked by design decisions (graceful degradation, private Cloud Run access) that make failure look like success.