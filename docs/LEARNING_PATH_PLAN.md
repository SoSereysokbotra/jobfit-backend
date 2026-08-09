# `/learning` — gaps from the jobs you are actually chasing

> Created 2026-08-09. Backend + frontend. Implement **one phase at a time**; each phase ends
> at a STOP gate. Do not begin the next until the operator says "proceed".

---

## STATUS — all five phases done 2026-08-09

| Phase | Commit |
|---|---|
| 1 — service | `b7dcf28` |
| 2 — endpoint | `5c9ab03` |
| 3 — page | `1530f8d` (frontend) |
| 4 — delete the hardcoded list | `5a82f8d` / `2363cac` |
| 5 — verified live | below |

**The measurement, before and after.** Before: the list could not vary by user, so for anyone
outside software **10 of 10 recommendations were irrelevant**. After, proven end to end with a
real teaching posting and a real application:

```
teaching job  ->  5 teaching requirements, 0 technology
software job  ->  7 software requirements
```

Same code, same user, same request. The field is in the data.

Also verified: gap counts for the four seeded candidates mirror what screening measured on the
same job through a different code path — 6/7, 3/7, 1/7 and 0/7 covered came back as 1, 4, 6
and 7 gaps. The requirements are reproduced in the employer's own words, each carrying the job
titles behind its count.

jest 321/321, tsc clean in both repos. The Phase 5 test job and its application were removed
afterwards; no test data remains.

---

## 1. The bug

`/learning` tells every user the same thing, and for most of them it is wrong.

`learning-resources.catalog.ts:55`:

```ts
export const IN_DEMAND_SKILLS: string[] = Object.keys(CATALOG);
```

Ten hardcoded technology skills. `learning-path.service.ts:55-57` then returns **every one the
user does not have** as a "gap":

```ts
const gapSkills = IN_DEMAND_SKILLS
  .filter((skill) => !have.has(skill.toLowerCase()))
  .map((skill) => ({ skill, resources: resourcesForSkill(skill) }));
```

So a mathematics teacher is told her skill gaps are *typescript, react, node.js, python, aws,
docker, kubernetes, sql, system design, communication*.

Nothing here reads her applications, her target jobs, or any job's requirements. It is a fixed
list minus what she has, presented as **her** learning path. That is the same class as the
things §4 of `HANDOFF_2026-08-07.md` deleted: analysis presented as personal that was never
computed from the person.

**The measurement:** for a non-technology user, **10 of 10 recommended gaps are irrelevant.**
That is the before-number, and it does not need an experiment to establish — the list cannot
vary by user.

---

## 2. The idea

Stop asking *"what generic tech skills is this person missing?"* and start asking
**"what do the jobs this person is actually applying to ask for that their CV does not
evidence?"**

Same code path for every field, because the requirements come from the postings:

| User | Applied jobs ask for | Gaps shown |
|---|---|---|
| Software engineer | React, TypeScript, Docker, AWS | Docker, AWS |
| Mathematics teacher | IGCSE, curriculum planning, assessment design | IGCSE, assessment design |
| Welding engineer | MIG, TIG, CAD, AWS D1.1 | AWS D1.1 |

One implementation. The field-specificity is in the data, not the code.

---

## 3. What already exists (do not rebuild it)

`SkillGapService.analyse(userId, jobId)` in the matching module already does the hard part:

- Prefers **employer-authored** `requirements` over `extractedRequirements`, and reports
  which via `requirementsSource` — `schema.prisma:469` states employer text stays
  authoritative.
- Matches against skills from the user's **latest parsed résumé**.
- Distinguishes `JOB_HAS_NO_REQUIREMENTS` from "the CV covers everything" — showing those
  identically would tell someone they are a perfect fit for a job we know nothing about.
- Measured at **0.937 groundedness across 44 postings**, and it dropped an invented
  "Experience with Docker and Kubernetes" from a **Welding Engineer** posting.

**This plan calls that per applied job and aggregates.** It does not write a second comparison.

### Three things this plan will NOT do

1. **No skill normalisation, and no embeddings for matching.** "Curriculum planning" and
   "curriculum development" will both appear if both are missing. Merging them means semantic
   similarity, which `HANDOFF_2026-08-07.md` §5.2 already measured and rejected: the software
   candidate outscored the mechatronics candidate on an automotive job (0.629 vs 0.482), and
   *"Automotive Eng Tech" ↔ "Automotive Industry"* (0.467) ranked **below** *"Teamwork" ↔
   "collaborate as a team"*. No threshold separated them. Distinctive-word matching shipped
   instead. Re-opening that here would re-litigate a decision closed with data.
2. **No AI-generated courses.** There is no course API. Asking a model for "the best IGCSE
   maths course" produces plausible titles and dead URLs. Unknown skills keep the existing
   search links, labelled as searches.
3. **No new LLM call at request time.** Requirements are already extracted and cached on the
   job (`requirementsExtractedAt`) precisely because extraction is a ~7s call. The page reads
   what is stored.

---

## 4. Shape of the answer

```
Applications ──► for each job: analyse(userId, jobId)      [existing, measured]
             ──► aggregate the `missing` strings, count per requirement
             ──► sort by count, then alphabetically
             ──► { hasApplications, jobsConsidered, gaps[] }
```

```jsonc
{
  "hasApplications": true,
  "jobsConsidered": 4,
  "gaps": [
    { "requirement": "IGCSE curriculum experience", "requiredBy": 3, "source": "EMPLOYER" },
    { "requirement": "Assessment design",           "requiredBy": 1, "source": "AI_EXTRACTED" }
  ]
}
```

**`requiredBy` is a count, not a grade.** "Required by 3 of your 4 applications" is checkable;
"Priority: High" is not. The UI may colour by the fraction, but the number is what it shows.

**`source` travels with each gap** for the same reason it travels through screening: the user
is entitled to know whether a requirement is the employer's words or the model's reading.

---

## PHASE 1 — Backend: job-driven gaps

**Files**
- `src/modules/learning/application/services/learning-path.service.ts`
- `src/modules/learning/learning.module.ts` (import the matching module for `SkillGapService`)
- new `src/modules/learning/application/dtos/skill-gap-summary.dto.ts`

**Steps**
1. Add `getSkillGaps(userId)`:
   - Load the user's non-deleted applications with their `jobId`.
   - `hasApplications: false, jobsConsidered: 0, gaps: []` when there are none. **An explicit
     flag, not an empty array the client has to interpret** — "no gaps" and "nothing to
     compute from" are different answers and must not render identically.
   - For each application, `await skillGap.analyse(userId, jobId)`.
   - Skip results whose status is `JOB_HAS_NO_REQUIREMENTS` — they contribute no evidence, and
     counting them would dilute every fraction.
   - Aggregate `missing[]` by exact string, case-insensitively for the key, keeping the first
     spelling seen for display. Count and record `source`.
   - Sort by `requiredBy` desc, then alphabetically so the order is stable between loads.
2. Watch the query count: `analyse` is one call per application. Applications per user are
   small (single digits today), so a loop is honest and readable. **If that changes, batch —
   do not pre-optimise now, but leave the note.**

**Keep** `getLearningPath` untouched for the moment; Phase 4 removes it. Two endpoints briefly
coexist so the frontend can move without a broken window.

**Tests** — new `learning-path.service.spec.ts`:
- no applications → `hasApplications: false`, empty gaps
- one job, two missing → both returned with `requiredBy: 1`
- same requirement missing on three jobs → one entry, `requiredBy: 3`
- a `JOB_HAS_NO_REQUIREMENTS` job does not raise `jobsConsidered`
- requirements the CV covers do not appear
- **a non-technology job produces non-technology gaps and no tech skills at all** — this is
  the bug, as a test

**Verify:** `npx jest && npx tsc --noEmit`

### ⛔ STOP

---

## PHASE 2 — Backend: the endpoint

**Files**
- `src/modules/learning/presentation/controllers/learning.controller.ts`

**Steps**
1. `GET /learning/skill-gaps` — own-only, derived from the JWT. **No `:userId` in the path**;
   the existing route takes one and then refuses anyone else's, which is a permission check
   defending a parameter that should not exist.
2. Swagger description stating what the numbers mean and that `source` distinguishes employer
   text from model reading.

**Verify:** Swagger at `/api/docs`; call it as a seeded candidate.

### ⛔ STOP

---

## PHASE 3 — Frontend: the page reads it

**Files**
- `jobfit-frontend/src/features/learning/api/learning.api.ts`
- `jobfit-frontend/src/features/learning/hooks/use-learning.ts`
- `jobfit-frontend/src/app/(seeker)/learning/page.tsx`
- `jobfit-frontend/src/features/learning/components/learning-path-card.tsx`

**Steps**
1. `learningApi.skillGaps()` + `useSkillGaps()`.
2. Each gap renders the requirement, **"needed by N of your M applications"**, and the source.
3. **Empty state when `hasApplications` is false:** *"Apply to a few jobs and we'll show you
   what they ask for that your CV doesn't cover yet."* Honest, and emptier than today's
   confident wrong list — that is the trade, and it is the right one.
4. Resources: curated link when the skill is in `CATALOG`, otherwise the existing search link
   **labelled as a search**, so a search is never dressed up as a recommendation.

**Verify:** `npx tsc --noEmit`; load the page as a seeded candidate.

### ⛔ STOP

---

## PHASE 4 — Remove the hardcoded list

Only once Phase 3 is working, so there is never a window with no learning page.

**Steps**
1. Delete `IN_DEMAND_SKILLS`, `getLearningPath`, `LearningPathView`, and the
   `GET /learning-paths/:userId` route.
2. **Keep `CATALOG` and `resourcesForSkill`** — they still power resource links and were never
   the problem. Only the use of the catalog's *keys* as a universal gap list was.
3. Remove the dead frontend types.

**Verify:** `npx jest && npx tsc --noEmit` in both repos; grep for `IN_DEMAND_SKILLS` and
`learning-paths` to confirm nothing references them.

### ⛔ STOP

---

## PHASE 5 — Verify against the live stack

1. Seeded technology candidate with applications → gaps are technology requirements drawn from
   those postings.
2. **A non-technology application** — create one (a teaching or trades posting), apply, and
   confirm the gaps are that field's requirements and contain **no** tech skills. This is the
   reported bug; it is not fixed until this passes.
3. A candidate with no applications → the empty state, not a list.
4. A requirement missing on several jobs → one row with the right count.
5. Re-check the before/after number: **10 of 10 irrelevant → 0 tech skills recommended to a
   non-tech user.**

---

## 5. Out of scope

- Skill normalisation / semantic matching (§3, measured and rejected).
- A real course catalog. Search links stay until there is a source worth trusting.
- Recommendations as a gap source. Applications are the stronger signal — someone applied,
  which is an act of intent. Recommendations are the system's guess, and gaps built on a guess
  would be a guess about a guess.
