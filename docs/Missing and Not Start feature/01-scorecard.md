# Scorecard — All 33 Functional Requirements

Status assigned from code evidence as of 2026-07-28.

- ✅ **Done** — satisfies the SRS acceptance criteria
- 🟡 **Partial** — working code exists but the requirement is not met
- ❌ **Not started** — no functioning path, even where models/DTOs exist

---

## ✅ Done (11)

| FR | Requirement | Evidence |
|---|---|---|
| AUTH-002 | Authorization & access control | Guards + roles + `AuditLog`, [admin-audit.controller.ts](../../src/modules/admin/presentation/controllers/admin-audit.controller.ts) |
| PROFILE-002 | Experience management | Full CRUD — [experience.controller.ts](../../src/modules/user/presentation/controllers/experience.controller.ts) |
| PROFILE-003 | Education management | Full CRUD — [education.controller.ts](../../src/modules/user/presentation/controllers/education.controller.ts) |
| RESUME-001 | Resume upload | POST/GET/DELETE + set-default; Supabase buckets via [storage.service.ts](../../src/infra/storage/storage.service.ts) |
| RESUME-002 | Resume parsing | BullMQ [resume-parsing.processor.ts](../../src/modules/resume/infrastructure/queue/resume-parsing.processor.ts) → AI `/resume/parse`; `ParsedResumeData`; status endpoints |
| RESUME-004 | ATS compatibility analysis | `GET /resumes/:id/ats-score` + [resume-scorer.service.ts](../../src/modules/resume/application/services/resume-scorer.service.ts) |
| RECS-001 | Recommendation generation | [recompute-user-matches.use-case.ts](../../src/modules/matching/application/use-cases/recompute-user-matches.use-case.ts); weighted scorers; hybrid RRF + LLM rerank |
| RECS-002 | Recommendation explanation | `RecommendedJobDto` returns `match`, `reason`, `breakdown` |
| APP-001 | Apply for job | `POST /applications` |
| APP-003 | Application tracking | List/detail/status/timeline + `ApplicationStageHistory` |
| SAVED-001 | Save jobs | [saved-job.controller.ts](../../src/modules/saved-job/presentation/controllers/saved-job.controller.ts) incl. toggle |

## 🟡 Partial (12)

| FR | Requirement | One-line gap |
|---|---|---|
| AUTH-001 | User authentication | No OAuth (Google/LinkedIn) anywhere in the code |
| PROFILE-001 | Profile creation & management | No completeness %; no public/private toggle (and the GET is `@Public()`) |
| PROFILE-004 | Skills management | No autocomplete, no 50-skill cap, no ordering column |
| JOBS-001 | Job ingestion | Manual trigger only — no scheduler; no run history / rollback |
| JOBS-002 | Job data enrichment | `Job` has no `industryId`; `JobSkill` has no importance score |
| JOBS-003 | Job search | Postgres FTS not Elasticsearch; no autocomplete; no search history |
| JOBS-004 | Job filtering & sorting | Sort order is hardcoded; no `total` count; several filters absent |
| APP-002 | Draft applications | `DRAFT` enum value is unreachable through the API |
| APP-004 | Application withdrawal | No dedicated endpoint and **no status transition guard** |
| SAVED-002 | Manage saved jobs | `SavedJob` has no tags/notes; no filter/sort/bulk |
| INTERVIEW-001 | Interview prep resources | AI questions only; no static content, nothing persisted |
| SALARY-002 | Offer analysis | Full lifecycle, but no total-comp / percentile / comparison |

## ❌ Not started (10)

| FR | Requirement | One-line state |
|---|---|---|
| PROFILE-005 | Certification management | Model + entity + DTO exist; **no controller** |
| RESUME-003 | Resume optimization | No "optimize for this job" flow at all |
| RECS-003 | Recommendation filtering & sorting | `GET /recommendations` accepts no query params |
| RECS-004 | Recommendation feedback | No dismiss/report endpoint |
| SAVED-003 | Saved search alerts | No model, no endpoints |
| NOTIF-001 | Email notifications | Mailer is a TODO stub — **no email is ever sent** |
| NOTIF-002 | In-app notifications | No `Notification` model; service is two empty methods |
| NOTIF-003 | Notification preferences | Nothing |
| INTERVIEW-002 | Interview reminders | Nothing; triple-blocked |
| SALARY-001 | Salary benchmarks | No `salary_data` model, no endpoints |

---

## Correction to an earlier draft

JOBS-001 was initially reported as lacking deduplication. **That was wrong** — dedup is
implemented via `@@unique([source, externalId])` on `Job` plus upsert-by-source in the ingestion
run, with `lastSeenAt` tracking freshness. Rollback and run-history remain absent.
