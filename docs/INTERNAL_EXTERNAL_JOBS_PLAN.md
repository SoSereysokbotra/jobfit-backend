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

### Phase 4 — Frontend ✅
- `ApplyButton` became the single place that decides how a job is applied to: **"Apply Now"**
  for INTERNAL, **"Apply Externally ↗"** for EXTERNAL (new tab, `noopener,noreferrer`).
- The origin is stated plainly — "Posted on themuse.com. You'll finish your application
  there, so we can't track it here." The hostname is derived from `externalUrl` rather than
  adding another backend field.
- **`External` badge on the job card**, so leaving JobFits is not a surprise on click.
- ⚠️ **Three apply surfaces existed, not one.** The job detail page used `ApplyButton`, but
  the **jobs list** and **recommendations list** each called `submitApplication.mutate`
  directly. Fixing only the button would have left two paths firing a request the server now
  rejects — the user would get a red error where a redirect was correct. The branch lives in
  `features/application/lib/external-apply.ts` so the three cannot drift apart.
- A missing `externalUrl` on an EXTERNAL job is surfaced as a data gap, never silently
  swallowed and never fallen back to an in-app apply.

---

### Phase 5 — Reranker ON ✅
Config flag `MATCHING_RERANK_ENABLED`, default ON. Measured **MRR@10 0.63 → 0.75 (+20%)**.
An explicit `opts.rerank` always beats config, and the eval harness now passes explicit
booleans — otherwise a "hybrid baseline" run would silently inherit the deployment's setting
and quietly invalidate the baseline every future measurement is compared against.

### Phase 6 — Skill-gap analysis ✅ (code) / ⛔ (data)
`GET /recommendations/skill-gap?jobId=` returns which of a job's stated requirements the
user's résumé does not evidence. **No percentage** — the Phase C fitScore was measured
uncorrelated with real fit, so only the lists are served.

**No LLM on this path.** `Job.requirements` is already a structured employer-authored list;
comparing it to parsed CV skills is a deterministic string operation. An LLM would add
latency, cost and hallucination risk to a problem that does not need one.

Matching uses word boundaries, relaxed around non-word characters. A plain substring test
makes **"Go" match "Google"** and **"React" match "Reactive"** — inflating coverage and
hiding the very gaps the feature exists to surface. Both are pinned by tests. One-character
skills are skipped for the same reason.

Two empty cases are distinguished (`JOB_HAS_NO_REQUIREMENTS` vs `NO_PARSED_RESUME`) so an
empty `missing` list is never rendered as "perfect fit" for a job we know nothing about.

#### ⛔ The data does not support this feature yet

All internal jobs share **six** distinct requirement strings, and only **one** names a
technology:

```
4+ years of relevant professional experience.
Strong fundamentals in the core stack for this role.
Excellent written and verbal communication skills.
Comfortable working in an agile, collaborative team.
5+ years backend
Kubernetes experience          <- the only one naming a technology
```

This is seed boilerplate. The feature will correctly report "you're missing: 4+ years of
relevant professional experience", which is not actionable skill advice. **The code is right;
the input is not there.** Do not demo this until one of:

1. **Write real requirements** on 2–3 internal jobs (fastest path to a working demo), or
2. **Extract requirements from the job description with the LLM** — this is where the
   measured 87.7–89.2% requirement groundedness actually applies, and where the 43 ingested
   TheMuse jobs have genuine descriptions to work from. That extension would make the feature
   useful across all 52 jobs, including deciding whether to bother applying externally.

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
| 2026-08-06 | 1–3 | `Job.sourceType` + backfill (43 EXTERNAL / 9 INTERNAL verified), server-side refusal with `externalUrl`, exposed on job DTOs. tsc clean, jest 174/174. |
| 2026-08-06 | 4 | Apply UI split across all **three** surfaces (detail, jobs list, recommendations) + `External` card badge. tsc clean. |

### Data note for the AI phases

Gap analysis needs `Job.requirements`. Measured 2026-08-06:

| | jobs | have `requirements` |
|---|---|---|
| INTERNAL | 9 | **7** |
| EXTERNAL | 43 | **0** |

That is workable — gap analysis only applies to jobs you can apply to, and 7 of the 8
published internal jobs qualify. But **7 jobs is a demo, not an evaluation.** It can be shown
working; no quality number may be claimed from it.
