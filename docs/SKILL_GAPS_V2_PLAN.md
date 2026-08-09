# `/learning` v2 — group by application, and stop hiding weak matches

> Created 2026-08-09. Follows `LEARNING_PATH_PLAN.md`, which made gaps job-driven. Two
> problems remain: one is a false claim, the other is a layout that buries the thing the
> user needs to orient by. Implement **one phase at a time**; each ends at a STOP gate.

---

## 1. Two problems, found by actually using it

### A. A weak match is presented as full coverage

Measured on a real CV against three real postings: 19 requirements, 18 distinct, **11
reported as gaps — so 7 were counted as covered.** Six were legitimate. The seventh was not.

The CV says **"Effective Time Management"**. The matcher strips `effective` as generic,
leaving `time` + `management`. The word **management** appears in the teaching posting's
**"Classroom behaviour management"**, so it matched — and the page reported that requirement
as covered.

**The page told a software engineer he has classroom behaviour management because his CV
mentions time management.**

The matcher is not at fault. It labelled that match `PARTIAL`, and its own comment says:

> PARTIAL — Real evidence, but weaker, and **the UI must not present it as if the CV said
> the whole thing.** (`skill-gap.service.ts:32-33`)

`getSkillGaps` reads `result.missing`, which is `matchedSkills.length === 0`
(`skill-gap.service.ts:142`). That collapses EXACT and PARTIAL into one bucket. **The
distinction the service was explicit about was thrown away one layer up.**

Two of the seven were PARTIAL on the measured CV:

| Requirement | Matched on | Fair? |
|---|---|---|
| Classroom behaviour management | Effective Time Management | **No** |
| Hands-on experience with hardware and software integration | Hardware + Software | Arguably |

The point is not to adjudicate each one. It is that **the user should be the one judging**,
and today they are not told there is anything to judge.

### B. The layout scatters unrelated fields together

Gaps render as a flat two-column grid sorted by count then alphabetically. With three
applications in three different fields, a teaching requirement sits beside an embedded one
beside a React one, and the job title — the only thing that makes a requirement make sense —
is the smallest, faintest text on the card.

The reader has to reconstruct "which job is this for?" on every single card.

---

## 2. What changes

**Group by application.** The job becomes the heading, not a footnote. Every gap sits under
the posting that asked for it.

**Keep the cross-job signal.** A requirement wanted by more than one application is the most
useful thing on the page, and grouping would normally hide it. Each gap carries how many of
the user's applications ask for it, so a shared one is marked wherever it appears.

**Show weak matches as their own state** — not a gap, not silence:

> Classroom behaviour management · **partly covered** — your CV shows *Effective Time
> Management*

---

## 3. The response shape

Grouping is a data-shape change, not a CSS one. The client should not have to regroup a flat
list — it would be re-deriving something the server already knows.

```jsonc
{
  "hasApplications": true,
  "hasParsedResume": true,
  "jobsConsidered": 3,
  "applications": [
    {
      "applicationId": "…",
      "jobId": "…",
      "jobTitle": "Junior Full-Stack Developer",
      "source": "EMPLOYER",
      "requirementsTotal": 7,
      "gaps": [
        { "requirement": "Experience building React applications with TypeScript",
          "coverage": "MISSING", "matchedSkills": [], "requiredBy": 1 },
        { "requirement": "Familiarity with Git branching and code review workflows",
          "coverage": "MISSING", "matchedSkills": [], "requiredBy": 2 }
      ]
    }
  ]
}
```

- `coverage` — `MISSING` (nothing evidences it) or `PARTIAL` (weak evidence, say so).
- `matchedSkills` — populated only for `PARTIAL`, so the UI can name what it matched on.
  Naming it is what lets the user overrule us.
- `requiredBy` — across ALL the user's applications, so the chip is meaningful inside a group.
- `requirementsTotal` — lets the UI say "4 of 7", which is more use than "4".

Applications sorted by gap count descending: the posting the user is furthest from is the one
worth their attention first.

---

## PHASE 1 — Backend

**Files**
- `application/dtos/skill-gap-summary.dto.ts` (reshape)
- `application/services/learning-path.service.ts` (`getSkillGaps`)
- `application/services/learning-path.service.spec.ts`

**Steps**
1. Build from `result.requirements` (which carries `matchQuality`) instead of
   `result.missing`. Include entries where `matchedSkills` is empty (`MISSING`) **and**
   where `matchQuality === 'PARTIAL'`.
2. Count `requiredBy` across all applications first, then attach it per gap, so the number
   means the same thing in every group.
3. Sort gaps within a group: `MISSING` before `PARTIAL` (a real gap outranks a doubt), then
   `requiredBy` desc, then alphabetically for stability.
4. Keep the three empty answers exactly as they are — they were right.

**Tests**
- a PARTIAL match appears as `coverage: "PARTIAL"` and **never** as `MISSING`
- a PARTIAL match is **never** silently omitted (the current bug, as a test)
- `matchedSkills` names the skill behind a partial match
- gaps are grouped under the right job
- `requiredBy` counts across applications, not within one
- a non-technology job still yields only non-technology gaps (carried forward)

### ⛔ STOP

---

## PHASE 2 — Frontend

**Files**
- `features/learning/api/learning.api.ts`
- `app/(seeker)/learning/page.tsx`

**Steps**
1. One section per application: job title as the heading, `N of M requirements` beside it.
2. Gap rows within the section. `MISSING` reads plainly; `PARTIAL` is visually distinct and
   says what it matched on.
3. `requiredBy > 1` gets a chip — *"also asked for by 1 other application"*.
4. Keep the three empty states untouched.

**Not doing:** a filter/sort control. Three applications do not need one, and it would be
chrome over a page whose job is to be read.

### ⛔ STOP

---

## PHASE 3 — Verify against the live stack

Using the same account and the same three postings that exposed this:

1. **Classroom behaviour management appears, marked partly covered, naming Effective Time
   Management.** It is invisible today; that is the bug.
2. Gaps sit under their own job heading; no teaching requirement appears under a software
   posting.
3. Git branching appears under both jobs that ask for it, marked as shared.
4. The three empty states still render.
5. Re-count: 11 gaps + 2 partial = **13 rows**, versus 11 today with 2 hidden.

---

## 4. Out of scope

- **Changing the matcher.** `management` counting as a signal word is deliberate and
  measured — `themeWordsOf` exists because removing domain words broke the welding case. The
  defect is in reporting, not matching.
- **Résumé extraction quality.** This CV parses to single generic words — *Programming*,
  *Communication*, *Technical Skills* — which match broad text and evidence little. That
  makes the gap list shorter than the truth. It is a real problem and a bigger one; folding
  it in here would hide it.
