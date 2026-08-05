# Roadmap — Unblocking the Remaining 22 Requirements

## The two keystones

Almost everything outstanding traces back to two missing pieces of infrastructure.

### 1. No scheduler

`@nestjs/schedule` is not installed. There are zero `@Cron` handlers and no BullMQ repeatable
jobs anywhere in `src/`. (BullMQ itself *is* installed and used — but only for the one-shot
résumé-parsing queue.)

**Blocks:**

| FR | What can't run |
|---|---|
| JOBS-001 | 6-hour ingestion cycle |
| APP-002 | 30-day draft expiry sweep |
| SAVED-003 | Saved-search alert matcher |
| INTERVIEW-002 | 1-day / 1-hour reminders |
| SALARY-001 | Monthly benchmark refresh |
| RECS-001 | Nightly batch regeneration (recs currently compute lazily on first request) |

### 2. No email delivery

`MailerService.sendMail` is a TODO stub; every notification listener body is empty.

**Blocks:**

| FR | What silently fails |
|---|---|
| AUTH-001 | Verification & password-reset emails are generated but never delivered |
| APP-001 | Application confirmation email |
| RESUME-002 | "Parsing complete" notification |
| SAVED-003 | Alert emails |
| INTERVIEW-002 | Reminder emails |
| NOTIF-003 | Preferences have nothing to govern |

---

## Suggested build order

### Phase 1 — Quick wins (~2 days)

Closes one full requirement and moves three partials to done.

- [ ] **PROFILE-005** — `CertificationController`, copied from `education.controller.ts` (~3h)
- [ ] **RECS-003** — query params on `GET /recommendations` (~4h)
- [ ] **JOBS-004** — `sort` enum + `total` count on job search (~4h)
- [ ] **SALARY-002 (part)** — total-comp calculation + side-by-side offer comparison (~4h)

### Phase 2 — Correctness & safety (~1 day)

Small changes, outsized risk reduction. Do these before adding surface area on top.

- [ ] **APP-004** — allowed-transition map in `ApplicationService`; seekers currently
      can set their own application to `OFFER`/`ACCEPTED`
- [ ] **PROFILE-001** — `isPublic` toggle; gate the `@Public()` profile and skills GETs
- [ ] **JOBS-003** — point the FTS query at the existing `searchTsv` column instead of
      recomputing `to_tsvector` inline (sequential scan today)

### Phase 3 — Keystones (~1 week)

- [ ] Email provider integration in `MailerService` + fill the three empty listeners
- [ ] MJML templates + plain-text fallback + unsubscribe links
- [ ] `pnpm add @nestjs/schedule`; register `ScheduleModule`
- [ ] **NOTIF-002** — `Notification` model + endpoints
- [ ] **NOTIF-003** — `NotificationPreference` model + settings endpoint (ship together with the above)

### Phase 4 — Newly unblocked (~1 week)

- [ ] **JOBS-001** — 6-hour cron + `IngestionRun` history/rollback
- [ ] **APP-002** — draft endpoints + expiry sweep
- [ ] **SAVED-003** — `SavedSearch` model + alert matcher
- [ ] **INTERVIEW-002** — scheduled-interview record + reminders + iCal
- [ ] **SALARY-001** — `SalaryBenchmark` model + monthly aggregation (mind the
      minimum-sample-size gate)

### Phase 5 — Big rocks (~1 week+)

- [ ] **RESUME-003** — optimization flow, incl. DOCX/PDF generation (spans both repos)
- [ ] **JOBS-002** — `Job.industryId` + `JobSkill.importance` + enrichment pass
- [ ] **AUTH-001** — OAuth via Supabase providers → own-JWT exchange
- [ ] **PROFILE-004** — `displayOrder`, proficiency enum, skill autocomplete
- [ ] **SAVED-002** — tags/notes + filter/sort/bulk
- [ ] **RECS-004** — `RecommendationFeedback` + dismissal exclusion *(worth pulling earlier —
      every day without it is training data lost)*
- [ ] **INTERVIEW-001** — static prep catalog + caching

---

## Sequencing notes

**Pull RECS-004 forward if you can.** It's a 1-day task whose value compounds — dismissal signal
you don't capture today can't be recovered later, and the SRS relies on it for the Phase 2 ML
model.

**Don't ship NOTIF-001 without NOTIF-003.** Sending email users can't turn off breaks the
unsubscribe acceptance criterion in the same requirement.

**JOBS-002 gates JOBS-004.** The industry and company-size filters can't be built until jobs
carry an `industryId`.

**SALARY-001 gates half of SALARY-002.** Total comp and comparison don't need it; percentiles do.
