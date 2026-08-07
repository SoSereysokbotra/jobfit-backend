# Application Status Lifecycle — One Road In

> Plan created 2026-08-07. Implement **one phase at a time**; each phase ends at a STOP gate.
> Do not begin the next phase until the operator says "proceed".
> Backend `D:\Year2\Jobfit\jobfit-backend` · Frontend `D:\Year2\Jobfit\jobfit-frontend`

---

## 0. The one idea

The lifecycle rules are a **reference book that callers are trusted to consult**. Two callers
consult it, seven don't, and the frontend keeps its own private copy. So this is not four bug
fixes — it is making the rules **the only road to a status write**, and making the UI **read**
them instead of restating them.

Two moves:

1. **One chokepoint on the backend.** Every status change goes through a single function that
   takes the application id, the target status, and **the actor** (`CANDIDATE` / `EMPLOYER` /
   `SYSTEM`). Today the actor is implicit in which file you are standing in — which is exactly
   why `offer.service.ts` enforces nothing: it holds both the employer path and the candidate
   path in one file, so neither rule felt like it applied. Passing the actor makes the rule a
   function of **data**, not of **location**.
2. **The frontend derives its affordances, never restates them.** Do not hardcode "Hired isn't
   droppable" — that is a second private copy of the rules, one layer up. The board asks the
   payload what is legal.

---

## 1. Verified evidence (measured 2026-08-07, not assumed)

### 1.1 Nine status-write sites; two are guarded

| # | Site | Writes | Transition checked? | Audit row? |
|---|---|---|---|---|
| 1 | `employer/infrastructure/repositories/employer-application.repository.ts:88` | any | ✅ (by service above) | ✅ StageHistory |
| 2 | `application/application.service.ts:115` (via aggregate) | any | ✅ | ✅ Timeline |
| 3 | `offer/offer.service.ts:91` `extendOffer` | `OFFER` | ❌ | ❌ |
| 4 | `offer/offer.service.ts:133` `withdrawOffer` | `REJECTED` | ❌ | ❌ |
| 5 | `offer/offer.service.ts:162` `accept` | `ACCEPTED` | ❌ | ❌ |
| 6 | `offer/offer.service.ts:170` `accept` (other offers) | `ARCHIVED` | ❌ **illegal** | ❌ |
| 7 | `offer/offer.service.ts:183` `decline` | `REJECTED` | ❌ | ❌ |
| 8 | `offer/offer.service.ts:200` `negotiate` | `NEGOTIATING` | ❌ | ❌ |
| 9 | `matching/application/services/application-screening.service.ts:96` | `SCREENING` | ❌ (self-guarded by `status === 'SUBMITTED'`) | ✅ Timeline |

**Baseline: 7 of 9 unguarded · 6 of 9 leave no audit row.**

Site 6 is illegal today: `TRANSITIONS[OFFER]` and `TRANSITIONS[NEGOTIATING]` do not include
`ARCHIVED` (`application.entity.ts:47-57`); `ARCHIVED` is reachable only from terminal states.

### 1.2 There are TWO audit tables, and the offer module writes to neither

| Table | Columns | Written by |
|---|---|---|
| `ApplicationStageHistory` (`schema.prisma:713`) | `previousStatus`, `newStatus`, `movedByUserId`, `notes` | employer repo only |
| `ApplicationTimeline` (`schema.prisma:732`) | `status`, `eventType`, `description` | candidate path + screening |

The audit trail is **split by actor**, so the four moments that decide a hire — accept, decline,
negotiate, rescind — appear in **no** audit table at all. Both `previousStatus` and
`movedByUserId` are nullable, so a `SYSTEM` actor writes cleanly.

**Decision:** the chokepoint writes **both**. `StageHistory` is the transition audit (who, from,
to); `Timeline` is the narrative feed the candidate reads. Neither table is removed — that is
separate scope.

### 1.3 The per-card nuance is real, not theoretical

`ApplicationScreeningService.screen()` is contractually `NEVER THROWS`
(`application-screening.service.ts:56-58`, swallowed at `:114-120`). When the AI service is down,
applications stay in `SUBMITTED` instead of advancing to `SCREENING`.

The board's "Applied" column therefore holds **both** `SUBMITTED` and `SCREENING` cards
(`employer.mappers.ts:80-81`), and `SUBMITTED → INTERVIEW` is **not** a legal transition
(`application.entity.ts:32-36`).

**So dragging an unscreened candidate to Interview fails today.** This is a live bug, not a
hypothetical — the AI service and Redis were both down twice during the week of 2026-08-05.

### 1.4 Precedent already exists

`candidateActionsFrom()` (`application.entity.ts:121-127`) and `availableActions` on
`ApplicationResponseDto:43,57` were built for exactly this purpose on the candidate side in
commit `62c304b`. Phase 5 mirrors it for employers. Reuse the existing doc-comment reasoning.

---

## 2. Two product decisions — make these BEFORE Phase 2

Routing the offer module through the chokepoint changes behaviour that works today. Both must be
decided deliberately, in `TRANSITIONS`, visible to everyone — **not** by leaving a bypass.

### D1 — Does `SCREENING → OFFER` stay legal?

Today `extendOffer` lets an employer skip INTERVIEW entirely. Behind the chokepoint that starts
failing.

**Recommendation: allow it.** Add `OFFER` to `TRANSITIONS[SCREENING]`. The AI Recruiter exists so
employers can act fast on strong candidates (`strong 6/7` vs `unrelated 0/7`); forcing a fake
INTERVIEW row makes employers fabricate a stage. **Do not** add `SUBMITTED → OFFER` — that is a
candidate nothing has evaluated.

- [ ] **Decision:** _______________

### D2 — Can a rejected application be reopened?

`extendOffer` is an **upsert** whose update branch resets a dead offer to `EXTENDED` and clears
`decidedAt` (`offer.service.ts:86-90`). Re-extending to a candidate who previously declined works
today. Behind the chokepoint it becomes `REJECTED → OFFER`, which is forbidden — `REJECTED` goes
only to `ARCHIVED`. **Re-extending an offer will silently break.**

**Recommendation: add an explicit `REJECTED → SCREENING` "reopen" transition** so a reopened
candidate re-enters the pipeline rather than teleporting to the end, then `SCREENING → OFFER`
carries them forward under D1.

- [ ] **Decision:** _______________

---

## 3. Success measurement (project rule 1: a phase with no metric is not finished)

Two counts, both verifiable rather than tunable:

| Metric | Before | Target |
|---|---|---|
| Status-write sites not behind the chokepoint | **7 of 9** | **0 of 9** |
| Status-write sites leaving no audit row | **6 of 9** | **0 of 9** |
| Status changes in the live DB with no audit row | run query below | no new ones |

```sql
-- Applications past SUBMITTED whose stage history is empty. n is small (8 applications
-- as of 2026-08-07) — record the number before Phase 2 and after Phase 3.
SELECT a.id, a.status FROM applications a
LEFT JOIN application_stage_history h ON h."applicationId" = a.id
WHERE a.status NOT IN ('DRAFT','SUBMITTED') AND h.id IS NULL;
```

Record the before-number here: _______________

---

## PHASE 0 — Surface the failure (frontend only)

**Why first:** ~10 lines, independent of everything, and it converts today's silent failure
(drag to Hired → card snaps back, no message) into a visible one. It de-risks every later phase:
any transition accidentally broken during migration becomes visible instead of silent.

**Files**
- `D:\Year2\Jobfit\jobfit-frontend\src\features\employer\hooks\use-employer.ts:86-93`

**Steps**
1. Add `onError` to `useUpdateApplicantStatus`. Surface the backend message **verbatim** — it is
   already well written (`"ACCEPTED is the candidate's decision to record, not yours."`). Use the
   existing `ApiError` narrowing pattern from `make-offer-modal.tsx:54`.
2. Add `qc.invalidateQueries({ queryKey: qk.employer.all })` to `onError` as well as `onSuccess`,
   so a board that failed because it was stale resyncs to truth.
3. Render via whatever toast/error surface the app already uses — **do not introduce a new one**.
   Check `src/components` first; if none exists, use the same inline-error approach as
   `make-offer-modal.tsx`.

**Acceptance**
- Dragging a card to **Hired** shows the backend's message instead of failing silently.
- Board refetches after a failed drop.

**Verify**
```bash
cd D:\Year2\Jobfit\jobfit-frontend && npx tsc --noEmit
```

### ⛔ STOP — wait for "proceed"

---

## PHASE 1 — Build the chokepoint (backend, no callers migrated)

**Why now:** the foundation. Built and unit-tested in isolation so Phase 2 is a pure migration.

**New file**
- `src/modules/application/domain/services/application-transition.service.ts`

**Steps**
1. Define the actor enum in the shared kernel:
   `src/shared/kernel/enums/transition-actor.enum.ts` → `CANDIDATE | EMPLOYER | SYSTEM`.
2. Write `transitionStatus(params, tx?)` accepting:
   `{ applicationId, newStatus, actor, actorUserId?, notes?, eventType?, description? }`
   plus an **optional Prisma transaction client** so `offer.service.ts`'s `$transaction` blocks
   can pass their `tx`. When absent, open its own transaction.
3. Inside, in this order:
   1. **Read the current status inside the same transaction.** This also closes a
      read-then-write race the current code has: `EmployerApplicationService.updateStatus` reads
      via `requireOwnedApplication` and writes in a separate call, so two employers dragging the
      same card can both pass the check.
   2. `isTransitionAllowed(current, newStatus)` → throw `BadRequestException` with the existing
      message format `Invalid status transition: X → Y`.
   3. **Actor entitlement:**
      - `CANDIDATE` → must be in `CANDIDATE_SETTABLE_STATUSES`
      - `EMPLOYER` → must be in `EMPLOYER_SETTABLE_STATUSES`, throw `ForbiddenException` with the
        existing message `${newStatus} is the candidate's decision to record, not yours.`
      - `SYSTEM` → **skips this check only.** It still obeys `TRANSITIONS`.
   4. Write the status (plus `reviewedByEmployerId` when actor is `EMPLOYER`).
   5. Append **`ApplicationStageHistory`** (previousStatus, newStatus, `movedByUserId` = actorUserId
      or null for SYSTEM, notes).
   6. Append **`ApplicationTimeline`** (status, eventType, description).
4. Register it in `application.module.ts` and **export** it so the offer, employer, and matching
   modules can inject it.

> **`SYSTEM` is not a bypass.** It skips the entitlement check because nobody asserted a decision
> — there is no "whose call was this" question. It still obeys `TRANSITIONS`. Collapsing the two
> into one god-mode flag would recreate the current problem under a nicer name.

**Tests** — new `application-transition.service.spec.ts`:
- each actor × legal transition → succeeds
- `EMPLOYER` → `ACCEPTED` / `WITHDRAWN` / `NEGOTIATING` → `ForbiddenException`
- `CANDIDATE` → `INTERVIEW` / `OFFER` / `SCREENING` / `REJECTED` → `ForbiddenException`
- `SYSTEM` → `SUBMITTED → SCREENING` succeeds; `SYSTEM` → `SUBMITTED → ACCEPTED` **still throws**
- both audit rows written on every success
- passing an external `tx` does not open a nested transaction

**Acceptance:** chokepoint exists, fully tested, **zero callers migrated**. Suite still green.

**Verify**
```bash
cd D:\Year2\Jobfit\jobfit-backend && npx jest && npx tsc --noEmit
```

### ⛔ STOP — wait for "proceed"

---

## PHASE 2 — Migrate the six offer-module writes

**Prerequisite:** D1 and D2 decided and written into `TRANSITIONS` first.

**Files**
- `src/modules/application/domain/entities/application.entity.ts` (D1/D2 transition edits)
- `src/modules/offer/offer.service.ts`
- `src/modules/offer/offer.module.ts` (inject the chokepoint)

**Steps** — all six sites, none skipped:

| Site | Current | Becomes |
|---|---|---|
| `:91` `extendOffer` | `status: 'OFFER'` | chokepoint, actor `EMPLOYER`, actorUserId = `userId` |
| `:133` `withdrawOffer` | `status: 'REJECTED'` | chokepoint, actor `EMPLOYER`, pass its existing `$transaction` tx |
| `:162` `accept` | `status: 'ACCEPTED'` | chokepoint, actor `CANDIDATE`, pass `tx` |
| `:170` `accept` others | `status: 'ARCHIVED'` | **→ `WITHDRAWN`**, actor `CANDIDATE`, pass `tx` |
| `:183` `decline` | `status: 'REJECTED'` | chokepoint, actor `CANDIDATE`, pass `tx` |
| `:200` `negotiate` | `status: 'NEGOTIATING'` | chokepoint, actor `CANDIDATE`, pass `tx` |

**Note on site 170 (Bug 3):** `ARCHIVED` becomes `WITHDRAWN`. Verified legal — `WITHDRAWN` is in
both `TRANSITIONS[OFFER]` and `TRANSITIONS[NEGOTIATING]`, and is candidate-settable. It is also
semantically truthful: the candidate did withdraw, because they took another job. No visible
board change (`ARCHIVED` and `WITHDRAWN` both map to "Rejected", `employer.mappers.ts:87-88`), but
the audit trail becomes correct.

Give each call a real `description` — these become the first audit rows these events have ever
produced. E.g. `"Candidate accepted the offer"`, `"Offer rescinded by employer"`,
`"Auto-withdrawn: candidate accepted an offer elsewhere"`.

**Tests:** update `offer.service.spec.ts` — the Prisma mock shape changes because writes now go
through the injected chokepoint. Add a case asserting the auto-withdraw path writes `WITHDRAWN`.

**Acceptance:** offer module contains **zero** `application.update({ data: { status } })`.
Chokepoint metric: 7 → 1 unguarded.

**Verify**
```bash
cd D:\Year2\Jobfit\jobfit-backend && npx jest && npx tsc --noEmit
```
Then manually: extend → negotiate → accept end-to-end, and confirm audit rows now exist.

### ⛔ STOP — wait for "proceed"

---

## PHASE 3 — Migrate the remaining three writes

**Files**
- `src/modules/matching/application/services/application-screening.service.ts:96,100-111`
- `src/modules/employer/application/services/employer-application.service.ts:84-130`
- `src/modules/employer/infrastructure/repositories/employer-application.repository.ts:80-106`
- `src/modules/application/application.service.ts:110-128`

**Steps**
1. **Screening** → chokepoint with actor `SYSTEM`. Keep the `screenedAt` / `screenMatchScore`
   field writes where they are; only the **status** write moves. Drop the now-redundant inline
   `status === 'SUBMITTED'` guard and the manual timeline `create` — the chokepoint does both.
   Screening's `NEVER THROWS` contract must be preserved: the chokepoint call goes **inside** the
   existing try/catch.
2. **Employer pipeline** → replace `appRepo.transitionStatus` with the chokepoint (actor
   `EMPLOYER`). Delete `transitionStatus` from the repository. The two guard blocks at
   `employer-application.service.ts:97-116` become redundant — **delete them**, they now live in
   one place. Keep `requireOwnedApplication`: company ownership is authorization, a separate
   concern from lifecycle.
3. **Candidate path** → `application.service.ts:115` currently calls the aggregate's
   `updateStatus()`. Route through the chokepoint with actor `CANDIDATE` so the entitlement check
   and both audit rows apply. Leave `Application.updateStatus()` on the aggregate — it is still
   the domain rule and the chokepoint may delegate to it — but the **persistence** path is the
   chokepoint.

**Acceptance:** **0 of 9 unguarded, 0 of 9 without audit rows.** Re-run the SQL from §3.

**Verify**
```bash
cd D:\Year2\Jobfit\jobfit-backend && npx jest && npx tsc --noEmit
```

### ⛔ STOP — wait for "proceed"

---

## PHASE 4 — Make bypassing it mechanical to catch

**Why:** a convention that lives only in a comment is what produced this situation. This is what
stops the tenth path someone adds next month.

**Steps**
1. **ESLint** `no-restricted-syntax` banning a `status` key in a Prisma `application.update`
   payload outside the chokepoint file. Add to `.eslintrc` with an `overrides` exemption for
   `application-transition.service.ts`.
2. **A guard test** — the real gate. ESLint matches AST shape, so it misses
   `data: buildPayload()`, `updateMany`, and `$executeRaw`. Add a jest test that scans `src/**`
   for `application.update` payloads containing `status` outside the chokepoint and fails.
   It runs inside the existing 246-test gate and is harder to silence than an
   `eslint-disable` comment.

**Acceptance:** deliberately reintroducing a raw status write fails **both** lint and jest.

### ⛔ STOP — wait for "proceed"

---

## PHASE 5 — Serve employer affordances from the backend

**Files**
- `src/modules/application/domain/entities/application.entity.ts`
- `src/modules/employer/application/dtos/employer-application-response.dto.ts`

**Steps**
1. Add `employerActionsFrom(from)` next to `candidateActionsFrom` (`application.entity.ts:121`) —
   the exact mirror: `TRANSITIONS[from]` filtered by `EMPLOYER_SETTABLE_STATUSES`. Document it
   with the same reasoning as the candidate version.
2. Add `availableActions: ApplicationStatus[]` to `EmployerApplicationResponseDto`, populated in
   its constructor. Copy the `@ApiProperty` description style from
   `application-response.dto.ts:33-43`.

**Sanity check the output.** From `SCREENING` an employer should get `[INTERVIEW, REJECTED]` —
plus `OFFER` if D1 was accepted. From `OFFER`, exactly `[REJECTED]`. From `SUBMITTED`, exactly
`[SCREENING, REJECTED]` — note **not** `INTERVIEW`, which is §1.3's live bug.

**Tests:** extend `application.entity.spec.ts` with `employerActionsFrom` cases per status.

**Verify**
```bash
cd D:\Year2\Jobfit\jobfit-backend && npx jest && npx tsc --noEmit
```
Confirm `availableActions` appears in `GET /employer/applications` via Swagger at `/api/docs`.

### ⛔ STOP — wait for "proceed"

---

## PHASE 6 — The board derives droppability per card

**Files**
- `D:\Year2\Jobfit\jobfit-frontend\src\features\employer\api\employer.mappers.ts`
- `D:\Year2\Jobfit\jobfit-frontend\src\app\employer\applications\page.tsx`

**Steps**
1. Carry `availableActions` through `employer.mappers.ts` onto `ApplicantView`. **Do not** map it
   into stage names in the mapper — keep raw statuses; the comparison happens at drop time.
2. In `page.tsx`, derive droppability **per card on drag-start**, not per column. `dragId` is
   already component state (`page.tsx:35`, set at `:115`), so the dragged card is known inside
   `onDragOver`.
3. In `onDragOver` (`page.tsx:96`) call `e.preventDefault()` **only** when
   `STAGE_TO_STATUS[stage]` is in the dragged card's `availableActions`. Skipping
   `preventDefault` makes the browser refuse the drop natively — "no drop" cursor, no blue
   highlight — with **no custom disabled styling**. Also gate `setOverStage(stage)` on the same
   condition so the highlight never appears on an illegal column.
4. Special-case `Offer`: it opens `MakeOfferModal` rather than calling `updateStatus`
   (`page.tsx:58-61`). Its droppability must be checked against `OFFER` being in
   `availableActions` — which, once `extendOffer` is behind the chokepoint, is the same rule the
   server enforces.
5. **Delete nothing from `STAGES`.** "Hired" stays as a column — candidates legitimately land
   there when they accept. It simply becomes inert as a drop target, derived, not hardcoded.

**Why per-card and not per-column:** `Applied → Interview` is legal from `SCREENING` but not from
`SUBMITTED`, and unscreened applications really do sit in `SUBMITTED` (§1.3). A per-column rule
would get this wrong for exactly the candidates most likely to be dragged.

**Acceptance**
- Hired is inert. Applied is inert.
- Offer lights up exactly when `OFFER` is legal for that specific card.
- An unscreened (`SUBMITTED`) card cannot be dragged to Interview; a screened one can.
- Changing `TRANSITIONS` on the backend changes the UI **with no frontend deploy**.
- Phase 0's `onError` **stays**. Derived affordances remove the *guaranteed* failures, not the
  *racy* ones — stale board data, a colleague moving the same candidate.

**Verify**
```bash
cd D:\Year2\Jobfit\jobfit-frontend && npx tsc --noEmit
```

### ⛔ STOP — final review

---

## 4. Rollback

Phases 0 and 6 are frontend-only and independently revertable. Phases 1–5 are additive until
Phase 3 deletes `transitionStatus` from the employer repository — that is the first
non-additive step, so tag or branch before it. No schema migration is required at any point:
both audit tables and every enum value already exist.

## 5. Explicitly out of scope

- Merging `ApplicationStageHistory` and `ApplicationTimeline` into one table.
- The AI Recruiter auto-advance threshold — still refused on measurement grounds
  (`HANDOFF_2026-08-07.md` §5.3).
- The fabricated `type`/`level` job-card pills (`job.mappers.ts`) — separate issue.
