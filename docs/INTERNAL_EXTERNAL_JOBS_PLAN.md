# Internal vs External Jobs — Phased Plan

> **Goal:** make the difference between a job JobFits *hosts* and a job JobFits *found
> elsewhere* explicit, enforced, and visible to the user. External jobs send the user to the
> original posting; internal jobs are applied to and tracked inside JobFits.

**Owner:** So Sereysokbotra · **Started:** 2026-08-06 · **Repos:** `jobfit-backend`, `jobfit-frontend`

---

## 1. Why this is needed (the bug, stated plainly)

Today the corpus is **51 published jobs**:

| kind | count | has `externalUrl` | has employer |
|---|---|---|---|
| `source = 'THEMUSE'` (ingested) | 43 | 43 | 0 |
| `source = NULL` (posted in JobFits) | 9 | 0 | 3 |

**A user can currently click "Apply" on all 51.** For the 43 ingested ones that application
goes nowhere: no employer exists in JobFits to receive it, and the real posting lives on
another site. The user believes they applied for a job they did not apply for.

That is the defect. It is not cosmetic — it is the product lying to the user about whether
they applied for a job.

## 2. What already exists (do not rebuild it)

The schema is further along than the idea assumed:

- `Job.source`, `Job.externalId`, `Job.externalUrl`, `Job.lastSeenAt` — ingestion tracking.
- `Job.postedByEmployerId` — set when an employer posted it inside JobFits.
- `Application` with `@@unique([userId, jobId])`, `ApplicationTimeline`,
  `ApplicationStageHistory`, and an `ApplicationStatus` enum that **already** contains
  `SUBMITTED → SCREENING → INTERVIEW → OFFER → ACCEPTED / REJECTED`.

**So the status pipeline the idea asks for is already modelled.** What is missing is a single
explicit fact — *is this job applicable inside JobFits?* — and the enforcement that follows.

### Why add `sourceType` when it can be derived

`source != NULL` almost implies external today. Not good enough:

- Nothing stops an ingested row from having a NULL source after a partial import.
- A future direct-partner feed would be ingested *and* internally applicable.
- The rule "can this user apply here?" should be **one queryable column**, not a two-field
  inference repeated in every service, DTO and UI branch that needs it.

## 3. Scope

**In scope:** the internal/external split — data model, enforcement, API, UI.

**Out of scope, deliberately:** the AI screening layer (gap analysis, AI-advanced statuses).
It is sketched in §Later so the shape is agreed, but it is not built here. It depends on
résumé parsing, which currently returns different answers on identical input
(see `RESUME_EXTRACTION_PLAN.md` — 2 to 6 out of 7 across 8 runs).

---

## Phases

Each phase ends: tests green → commit → push → report → **wait for acceptance**.

### Phase 1 — `sourceType` on Job
- Add `enum JobSourceType { INTERNAL, EXTERNAL }` and `Job.sourceType`, defaulting to
  `INTERNAL` so employer-posted jobs stay applicable.
- Hand-written migration + `migrate deploy` (never `migrate dev`), then `prisma generate`
  with the backend dev server **stopped** (EPERM otherwise).
- **Backfill in the same migration:** `sourceType = 'EXTERNAL'` where `source IS NOT NULL`
  OR `externalUrl IS NOT NULL`. Expect 43 rows.
- **Done when:** the 43/8 split is verified in the database, tests green.

### Phase 2 — Enforce it server-side
- `ApplicationService.submitApplication` rejects an EXTERNAL job with a clear error that
  carries `externalUrl`, so the client can send the user onward.
- **This is the load-bearing phase.** The UI hiding a button is not enforcement; the endpoint
  is what makes the guarantee true.
- **Done when:** a unit test proves applying to an EXTERNAL job fails and to an INTERNAL job
  succeeds.

### Phase 3 — Expose it on the API
- `sourceType` + `externalUrl` on the job response DTOs (list, detail, recommendations) so
  the client can render the right action without a second request.
- **Done when:** tsc + jest green and the fields appear in the job endpoints.

### Phase 4 — Frontend
- Job card / detail renders **"Apply Externally ↗"** (opens `externalUrl` in a new tab) for
  EXTERNAL, **"Apply Now"** for INTERNAL.
- Label the origin honestly — e.g. "via TheMuse" — so the user knows they are leaving.
- **Done when:** both paths are visible in the running app.

---

## Later (agreed shape, not built here)

**AI screening — gap analysis, NOT a score.** Phase C measured `/match/reason`'s `fitScore`
against 150 hand-graded pairs: Spearman ρ **0.137 (v1)** and **−0.065 (v2)**, with mean score
BAD 0.199 > GREAT 0.150. The number is uncorrelated with real fit, so **no percentage may be
shown to a user.** What the same run measured as *working* is requirement groundedness at
**87.7–89.2%** — the model reliably reads what a job asks for. So the shippable feature is:

> This job asks for: Docker · CI/CD · Kubernetes
> Not found in your résumé: Docker, CI/CD

**AI-advanced status.** Only `SUBMITTED → SCREENING`. Never `ACCEPTED` or `REJECTED` — a coarse
triage is within what a small model can do; a hiring decision is not.

**Reranker.** Measured **MRR 0.63 → 0.75 (+20%)** and currently OFF in production. Turning it
on for internal jobs is the best-evidenced AI improvement available and needs no new model.

---

## Log

| Date | Phase | Result |
|---|---|---|
| 2026-08-06 | — | Plan written. Baseline: 43 external / 8 internal published jobs, 1 application. |
