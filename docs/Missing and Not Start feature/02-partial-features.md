# 🟡 Partial Features (12)

Requirements with working code that does not yet meet the SRS acceptance criteria.
Each entry: what exists, what's missing, why it matters, and what closing it involves.

---

## AUTH-001 — User Authentication (OAuth missing)

**Have.** 11 endpoints in [auth.controller.ts](../../src/modules/auth/presentation/controllers/auth.controller.ts):
register, verify-email (+resend), the 3-step password reset (request / verify / reset, +resend),
login, refresh-token, logout, me. bcryptjs hashing, per-route named throttlers, `RefreshToken`
model with rotation.

**Missing.** OAuth 2.0 entirely. Zero hits for `passport`, `oauth`, `google`, or `linkedin` in
auth code.

**Why it matters.** SRS *Journey 1: Signup* opens with "Clicks **Sign up with Google**". The
documented primary onboarding path does not exist.

**Closing it.** `@supabase/supabase-js` and
[supabase-auth.service.ts](../../src/infra/supabase/supabase-auth.service.ts) are already present.
Cheapest route: use Supabase's OAuth providers, then exchange the Supabase session for your own
JWT at `POST /auth/oauth/callback`. This keeps the self-managed JWT model intact and avoids
adding passport strategies. Alternative is `passport-google-oauth20` + `passport-linkedin-oauth2`
directly.
**Estimate: ~1–2 days.**

---

## PROFILE-001 — Profile Creation & Management

**Have.** A rich `Profile` model — firstName/lastName, phone, photoUrl, bio, headline,
city/state/country/lat/lng, `desiredJobLevels`, `desiredRemoteTypes`, `desiredEmploymentTypes`,
`desiredIndustries`, min/maxSalary + currency, LinkedIn/GitHub/portfolio URLs, and the 1024-dim
BGE-M3 embedding. Endpoints: create, get, patch, patch preferences, patch salary.

**Missing.**
1. **Completeness % (0–100)** — no field, no calculation. The only "completeness" in the repo is
   inside [resume-scorer.service.ts:147](../../src/modules/resume/application/services/resume-scorer.service.ts#L147),
   which scores a résumé, not a profile.
2. **Public/private visibility toggle** — no field.

**Worth a decision.** `GET /profiles/:userId` is annotated `@Public()`, as is
`GET /profiles/:userId/skills`. Any unauthenticated caller holding a UUID can read a full profile.
FR-AUTH-002 states "Candidates cannot view other candidate profiles." UUIDs are not enumerable so
this is not urgent, but it contradicts a stated requirement and should be an explicit decision
rather than an accident.

**Closing it.** Add `isPublic Boolean @default(false)`; compute completeness on read (or store
`completenessPct Int` and recompute on write); gate the public GET behind the toggle.
**Estimate: ~half a day.**

---

## PROFILE-004 — Skills Management

**Have.** `UserSkill` with `proficiencyLevel`, `yearsOfExperience`, `endorsementCount`, unique on
`(userId, skillId)`. A `Skill` taxonomy table with unique `name`/`slug`. Endpoints: add, list,
delete, endorse.

**Missing.**
1. **No autocomplete endpoint** against the `Skill` table — `SkillModule` exposes no routes, so
   "add skills via search/autocomplete" has no backend.
2. **No 50-skill cap.**
3. **No ordering column on `UserSkill`** — "skills reorderable by importance" is structurally
   impossible without one.
4. `proficiencyLevel` is `String @default("INTERMEDIATE")`, not a Prisma enum, so the four SRS
   levels (Beginner/Intermediate/Advanced/Expert) aren't enforced at the database layer.

**Closing it.** Add `displayOrder Int`, promote proficiency to an enum, add `GET /skills?q=`,
add a count guard in `SkillsService.addSkill`.
**Estimate: ~1 day.**

---

## JOBS-001 — Job Ingestion (scheduling missing)

**Have.** TheMuse source adapter, normalization to the internal schema, company upsert,
**deduplication** via `@@unique([source, externalId])` + upsert-by-source, `lastSeenAt` for
freshness, `externalUrl`, and `GET /employer/ingest/jobs` to list imported postings.

**Missing.**
1. **The 6-hour schedule.** `@nestjs/schedule` is not installed; no `@Cron`; no BullMQ repeatable
   jobs. [ingestion.controller.ts:5](../../src/modules/ingestion/presentation/controllers/ingestion.controller.ts#L5)
   acknowledges this in its own header comment.
2. **No `IngestionRun` table** — so "ingestion history viewable in admin panel" and "rollback
   capability for bad ingestions" have nowhere to live.
3. Only one source; no ingestion-failure alerting wired to the existing alerting module.

**Closing it.** `pnpm add @nestjs/schedule`, register `ScheduleModule`, add
`@Cron('0 */6 * * *')` calling `IngestionService` (~1 day). Then an `IngestionRun` model
(source, startedAt, finishedAt, counts, status, error) for history + rollback (~1 day).

---

## JOBS-002 — Job Data Enrichment

**Have.** BGE-M3 job embeddings (1024-dim), a `searchTsv` generated tsvector column, the
`JobSkill` join, and the `JobLevel` / `RemoteType` / `EmploymentType` enums.

**Missing, with a knock-on effect.**
1. **`Job` has no `industryId`.** The `Industry` table exists and `Profile.desiredIndustries`
   stores industry IDs — but jobs are never categorized, so that preference is collected from the
   user and then silently unusable for matching or filtering.
2. **`JobSkill` has no `importance` / weight column** — "calculate skills importance scores" has
   no storage.
3. No automatic seniority inference on ingested jobs.
4. `Job.remoteType` is a raw `String` while the `RemoteType` enum exists elsewhere in the schema.

**Closing it.** Add `Job.industryId` (FK) and `JobSkill.importance Float`; run an enrichment pass
(LLM or regex) during ingestion; migrate `remoteType` to the enum.
**Estimate: ~2–3 days.**

---

## JOBS-003 — Job Search

**Have.** PostgreSQL full-text search with `plainto_tsquery` + `ts_rank` in
[search.service.ts](../../src/infra/search/search.service.ts). Separately, the matching module has
genuine hybrid retrieval — RRF fusion plus an LLM reranker.

**Missing.**
1. **Elasticsearch** — a deliberate, documented deviation (the service header calls Postgres FTS
   "Phase 1"). This is a reasonable call; the SRS should be amended to match rather than the code
   changed.
2. **Autocomplete / suggestions** — no endpoint.
3. **Search history** (SRS: last 5 searches) — no model.

**Bug worth fixing now.** [search.service.ts:24](../../src/infra/search/search.service.ts#L24)
recomputes `to_tsvector('english', title || ' ' || description)` inline in both the `WHERE` and
the `ORDER BY`, instead of querying the `searchTsv` generated column that `Job` already maintains.
That bypasses the index and forces a sequential scan — it will degrade badly as the corpus grows
toward the SRS's 500K-job target. Roughly a one-line fix.

**Estimate: ~1–2 days** for the index fix, a `SearchHistory` model + endpoint, and a
trigram/prefix suggest.

---

## JOBS-004 — Job Filtering & Sorting

**Have.** [search-job.query.dto.ts](../../src/modules/job/presentation/dto/search-job.query.dto.ts)
supports `q`, `status`, `remoteType`, `location`, `skillIds`, `minSalary`, `maxSalary`, `limit`,
`offset`.

**Missing.**
1. **No sort parameter at all.**
   [prisma-job.repository.ts:38](../../src/modules/job/infrastructure/repositories/prisma-job.repository.ts#L38)
   hardcodes `orderBy: { createdAt: 'desc' }`. The SRS asks for relevance, match score, salary
   (both directions), posted date (both directions), and location proximity.
2. **No `total` count** in the response — the frontend cannot render "X results" or correct
   pagination controls.
3. Missing filter dimensions: company size, industry, posted date, employment type.

**Closing it.** Add a `sort` enum and a `total` count (~half a day). The industry and
company-size filters are blocked on JOBS-002.

---

## APP-002 — Draft Applications

**Have.** `ApplicationStatus.DRAFT` exists in the enum.

**Missing — the value is unreachable.** `SubmitApplicationDto` accepts `jobId`, `resumeId`,
`coverLetter`, `notes` — no status field — and
[application.service.ts:65](../../src/modules/application/application.service.ts#L65) hardcodes
`status: ApplicationStatus.SUBMITTED`. **No draft can be created through the API.** Beyond that:
no auto-save target, no 30-day expiry sweep (needs the scheduler), no draft deletion.

**Closing it.** `POST /applications/draft`, `PATCH /applications/:id/draft` as the auto-save
target, a promote-to-submitted transition, and a scheduled expiry sweep.
**Estimate: ~1 day.**

---

## APP-004 — Application Withdrawal

**Have.** `WITHDRAWN` in the enum, reachable through `PATCH /applications/:id/status`. The
`updateStatus` path correctly writes both `ApplicationTimeline` and `ApplicationStageHistory`.

**The real gap is not the endpoint — it is the missing state machine.** `updateStatus` accepts
whatever `newStatus` the client sends after only an ownership check. **A job seeker can set their
own application to `OFFER` or `ACCEPTED`.** This is a correctness problem larger than the missing
convenience endpoint.

Also missing: withdrawal confirmation semantics, the "can't withdraw if interview scheduled"
guard, a `withdrawnAt` timestamp, and hiding withdrawn applications from the main list while
keeping them viewable.

**Closing it.** Add an allowed-transition map in `ApplicationService` — a seeker may move only to
`WITHDRAWN`/`ARCHIVED`; every other transition is employer-driven. Then add
`POST /applications/:id/withdraw`.
**Estimate: ~half a day. Recommended early.**

---

## SAVED-002 — Manage Saved Jobs

**Have.** `SavedJob` is a bare join table — `userId`, `jobId`, `createdAt`, unique on the pair —
plus list / add / toggle / remove endpoints.

**Missing.** No `tags` field, no `notes` field, no query parameters on the list endpoint, no bulk
operations. The SRS asks for custom + predefined tags ("Interested", "Dream Job", "Backlog"),
filter by tag/score/date, sort by score/date/salary, and bulk apply/tag/remove.

**Closing it.** Add `tags String[] @default([])` and `notes String?` to `SavedJob`; add filter and
sort query params; add one bulk endpoint.
**Estimate: ~1 day.**

---

## INTERVIEW-001 — Interview Prep Resources

**Have.** `POST /generate/interview` produces seniority-tailored questions *and* feedback on a
candidate's submitted answer (`kind=feedback`) — the feedback mode exceeds the SRS requirement.
Premium/Professional gated server-side in
[generation.controller.ts](../../src/modules/generation/generation.controller.ts).

**Missing.** Company research (overview, news, culture, hiring trends), format-specific tips
(phone / video / on-site), questions to ask the interviewer, thank-you email template,
post-interview checklist, PDF export.

**Cost issue.** There are no `interview_tips` / `interview_questions` tables (both are in the SRS
ERD), so **nothing is cached** — every request re-hits the LLM and re-spends tokens generating
content that is largely static per role.

**Closing it.** The static content is cheap: a catalog module mirroring the existing
[learning-resources.catalog.ts](../../src/modules/learning/domain/learning-resources.catalog.ts)
(~1 day). Company research is the expensive part — recommend scoping it to an LLM summary over the
`Company` record you already store, rather than live web research.

---

## SALARY-002 — Offer Analysis

**Have.** A genuinely complete offer lifecycle. The `Offer` model captures `baseSalary`,
`currency`, `signingBonus`, `annualBonusPct`, `equityShares`, `equityPrice`, `startDate`,
`responseDeadline`, `notes`, and who extended it. Employers can extend / update / withdraw
([employer-offer.controller.ts](../../src/modules/offer/employer-offer.controller.ts)); seekers can
list / get / accept / decline / negotiate
([offer.controller.ts](../../src/modules/offer/offer.controller.ts)); accepting auto-archives the
seeker's other active offers.

**Missing — the analysis half.** **Every input for total compensation is stored and never
computed.** No market percentile (blocked on SALARY-001), no negotiation talking points, no
side-by-side multi-offer comparison endpoint, no downloadable report.

**Closing it.** Total comp + side-by-side comparison is pure computation over data already in the
table — **~half a day for disproportionate perceived value.** Percentiles wait on SALARY-001.
