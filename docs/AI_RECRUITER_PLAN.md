# AI Recruiter — Phased Plan

> **Goal:** when someone applies to a JobFits-hosted job, screen them automatically against
> that job's stated requirements, and show the employer a ranked applicant list **with the
> reasons**. The AI reads requirements out of prose; everything after that is arithmetic the
> employer can inspect and disagree with.

**Owner:** So Sereysokbotra · **Started:** 2026-08-07 · **Repos:** `jobfit-backend`, `jobfit-frontend`

---

## 1. What this is NOT

The original sketch returned `{"score": 82, "status": "INTERVIEW_SUGGESTED"}` from the LLM.
That is refused, and the reason is measured: Phase C scored `/match/reason`'s `fitScore`
against 150 hand-graded pairs and got **Spearman ρ 0.137 (v1) / −0.065 (v2)**, with mean
score **BAD 0.199 > GREAT 0.150**. The number is uncorrelated with real fit.

**No LLM output reaches a screening decision.** The model's only job here is extracting
requirements from a job description — the capability measured at **87.7–89.2%** groundedness
in Phase C and **0.937** across 44 real postings on 2026-08-06.

**The AI never rejects.** It advances `SUBMITTED → SCREENING` and attaches an assessment.
`INTERVIEW`, `OFFER` and `REJECTED` stay human decisions. A pipeline built on a 0.6B model's
reading of a CV must not end someone's application.

## 2. What already exists (do not rebuild)

| | |
|---|---|
| `JobMatchService` | deterministic score + breakdown, per job/user |
| `SkillGapService` | requirements covered / missing, 25 unit tests |
| `/job/requirements` | LLM extraction, invented items dropped, 0.937 grounded |
| `employer/applications` | list, update status, add notes — real endpoints |
| `employer/jobs/:id/analytics` | real counts from real tables |
| `ApplicationStatus` | `DRAFT → SUBMITTED → SCREENING → INTERVIEW → OFFER → ACCEPTED` |
| `ApplicationTimeline`, `ApplicationStageHistory` | audit of status changes |
| 8 employer pages | dashboard, jobs, applicants, applications, settings… |

**There is no `SHORTLISTED` status and this plan does not add one.** `SCREENING` is the
AI-reviewed state; ranking within it is what the employer acts on.

### Two defects found while surveying

1. **`EmployerApplicationResponseDto.matchScore` is always `null`.** It reads from the
   `matchScore` table, which has **0 rows** and nothing writes to it. Recommendations write
   to `recommendations`. A field that can never hold a value.
2. **Only one application exists**, status `REJECTED`, and **zero companies are verified**.
   Every employer page is empty for want of data, not code.

## 3. Baseline (2026-08-07)

```
users            EMPLOYER 7 · JOB_SEEKER 12 · ADMIN 2
employer profiles 6
companies verified 0
employer-posted jobs 3
applications      1  (REJECTED)
matchScore rows   0
jobs with requirements  50 of 51 published (6 employer-written, 44 AI-extracted)
```

---

## Phases

Each phase ends: tests green → commit → push → report → **wait for acceptance**.

### Phase 1 — Seed the loop ✅
A script that produces the data every later phase needs to be verifiable:
verified company → published internal job → applications from several seeker accounts with
**different** parsed résumés.

- **Why first:** phases 2–4 cannot be checked against anything real otherwise, and Phase 5's
  threshold cannot be measured at n=1.
- Idempotent and clearly marked as seed data — it must never be mistaken for organic data.
- **Done when:** ≥1 verified company, ≥1 internal published job with requirements, ≥4
  applications from distinct résumés.

### Phase 2 — Screening assessment ✅
On application submit, compute and persist:
`matchScore`, `requirementsTotal`, `requirementsCovered`, `missingRequirements[]`,
`screenedAt`, then advance `SUBMITTED → SCREENING` with a timeline entry.

- Reuses `JobMatchService` + `SkillGapService` unchanged. No new scoring logic.
- Persisted, not computed per view: an assessment is a record of what was true when the
  candidate applied. Recomputing it later would silently rewrite history as the CV changes.
- Screening failure must not fail the application. The row stays `SUBMITTED` and unscreened
  rather than the applicant losing their application to an AI outage.
- **Done when:** applying produces a stored assessment; unit tests cover the failure path.

### Phase 2 result — rank by coverage, NOT by match score

Screening the four seeded candidates:

| candidate | match score | requirements covered |
|---|---|---|
| `strong` | 50% | **6/7** |
| `partial` | 46% | **3/7** |
| `junior` | 46% | **1/7** |
| `unrelated` | 46% | **0/7** |

**Coverage separates them perfectly. The match score separates nothing** — a 4-point spread
across a senior full-stack engineer and a graphic designer.

The cause is not a scoring bug. These seeded candidates have no embeddings, so the `skills`
sub-score is 0 for all four, and the remaining sub-scores (experience, location, salary) are
near-identical because every seed profile uses the same city and salary band. The score is
measuring the things they have in common.

**Consequences, carried into Phase 3 and 5:**
1. **Sort by requirements covered**, with match score as a tiebreak only.
2. A match score with `skillsScored: false` behind it must not be presented as a ranking
   signal — it is mostly noise.
3. Phase 5's threshold should be expressed in **coverage**, not score. That is the number
   the data actually supports.

### Phase 3 — Expose it to the employer ✅
Replace the always-null `matchScore` with the stored assessment on
`GET /employer/applications`, and sort best-first.

- **Done when:** the endpoint returns covered/total/missing per applicant, tests green.

### Phase 4 — Employer applicant UI ✅
`/employer/jobs/<id>/applicants` shows per candidate: score, ✓ covered, ✗ missing, sorted.

- Must state when requirements were **AI-extracted** rather than employer-written — same
  rule as the seeker-side panel.
- **Done when:** the ranked list renders against Phase 1's seeded applications.

### Phase 5 — Threshold, measured not guessed
Only now: decide what "strong candidate" means, from the Phase 1–4 data.

- Score each seeded application, compare the ranking to a hand judgement of who is actually
  the better fit, and pick the cut from that — the same discipline that stopped the
  embedding threshold shipping on 2026-08-06.
- If the data does not support a defensible cut, **say so and ship without auto-advance.**
  A ranked list with reasons is already useful; an arbitrary cut-off is not.
- **Done when:** a number with its evidence is recorded here, or a documented decision not
  to have one.

---

## Out of scope

- Auto-`REJECTED` — never, see §1.
- A `SHORTLISTED` status — `SCREENING` plus ranking covers it.
- Rescreening on CV change — an assessment records the moment of applying.
- Anything using the LLM `fitScore`.

---

## Log

| Date | Phase | Result |
|---|---|---|
| 2026-08-07 | — | Plan written. Baseline above. |
| 2026-08-07 | 1 | `scripts/seed-ai-recruiter-demo.ts`. Verified company + internal job with 7 real requirements + 4 candidates. Ranking matches the hand-written expectation exactly. |
| 2026-08-07 | 2 | `ApplicationScreeningService` + 6 nullable `screen*` columns. Screens on submit, advances SUBMITTED→SCREENING. **Coverage ranks correctly; match score does not.** |
| 2026-08-07 | 3 | `GET /employer/applications` returns the assessment, ordered best-first in SQL. Dead `matchScoresForJob` removed. |
| 2026-08-07 | 4 | Applicants page shows "requirements met" as the lead column with the missing ones listed. Nullable score surfaced 6 latent bugs. |

### Phase 4 result

The applicants table leads with **requirements met**, not the score, and lists what each
candidate fails to evidence — an employer can act on "missing Docker, CI/CD"; they cannot
act on a bare percentage.

**Making `match` nullable surfaced six places that assumed a number**, all previously
written as `a.match > 0`. Two mattered:
- the dashboard averaged unscreened candidates in as **0**, understating the pipeline;
- `0%` and "never screened" rendered identically, so an unknown candidate looked unqualified.

"Not screened" is now distinct from "0 of 7", and the AI-extracted provenance notice appears
on the employer side too — they are judging candidates against those requirements.

### Phase 3 result — the employer list, as the API returns it

```
  #  candidate                     status      covered  score  source
  1  strong@seed.jobfits.test     SCREENING   6/7       50    EMPLOYER
       missing: Experience mentoring junior engineers
  2  partial@seed.jobfits.test    SCREENING   3/7       46    EMPLOYER
  3  junior@seed.jobfits.test     SCREENING   1/7       46    EMPLOYER
  4  unrelated@seed.jobfits.test  SCREENING   0/7       46    EMPLOYER
```

Two details that had to be right:

- **Ordering is in SQL, not in memory.** Sorting a fetched page would only reorder within
  that page and bury the strongest candidate on page 2.
- **`nulls: 'last'`.** Postgres sorts NULLs FIRST on DESC, so without it every *unscreened*
  application would float above every assessed one.

`matchScoresForJob` was deleted. It read from the `matchScore` table — zero rows, nothing
writes to it — so the employer's `matchScore` field could never hold a value.

### Phase 1 result — the ranking is already correct

`SkillGapService` against the seeded job, before any screening code exists:

| candidate | covered | expected |
|---|---|---|
| `strong` | **6/7** — missing only "mentoring junior engineers" | best fit ✅ |
| `partial` | **3/7** — backend depth, no React | partial ✅ |
| `junior` | **1/7** | weaker ✅ |
| `unrelated` | **0/7** — graphic designer | last ✅ |

Order and separation match the expectation written into the seed *before* it ran. That is
what makes Phase 5's threshold measurable rather than invented.

**Deliberate choices in the seed:**
- Résumé rows are written straight to `parsed_resume_data`, not uploaded as PDFs — parsing
  is non-deterministic on `qwen3:0.6b` and seed data must be identical every run.
- A NEW job was created rather than reusing an existing internal one: all six existing
  internal jobs carry only boilerplate ("4+ years of relevant professional experience"),
  which no skill can meaningfully match.
- Everything is namespaced `@seed.jobfits.test` so it can never be mistaken for organic data.
- Candidate embeddings are NOT generated (needs the AI service), so the `skills` sub-score
  stays 0 for these four until a backfill runs. `skillsScored: false` reports that honestly.
