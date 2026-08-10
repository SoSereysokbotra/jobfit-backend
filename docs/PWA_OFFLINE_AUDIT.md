# PWA Offline Mode — Backend Audit (Phase 0)

**Status:** Investigation only. No code, schema, or migrations were changed.
**Date:** 2026-08-10
**Scope:** `jobfit-backend` — all 19 modules under `src/modules/`.
**Next phase:** Phase 1 (Idempotency Key Infrastructure) per `PWA_OFFLINE_BACKEND_ROADMAP.md`.

---

## 1. Module classification

Classification is per *module*, but several modules split — a read path worth caching
plus a write path worth queueing, or vice versa. Where that happens the split is called
out explicitly rather than forced into one bucket, because the sync design differs per
route, not per module.

| Module | Route prefix | Class | Notes |
|---|---|---|---|
| `saved-job` | `/saved-jobs` | **OFFLINE-CRITICAL** + **SYNC-ON-RECONNECT** | Read the list offline; queue save/unsave. Whole resource is an ID array — cheap to cache wholesale. |
| `application` | `/applications` | **OFFLINE-CRITICAL** + **SYNC-ON-RECONNECT** | View own applications offline; queue submit / archive / status change. Best-modelled resource in the codebase for sync. |
| `matching` | `/recommendations` | **OFFLINE-CRITICAL** (list) / **ONLINE-ONLY** (rest) | `GET /recommendations` is cacheable. `for-job`, `skill-gap`, `by-job` are computed per-request against the AI service — no offline value. |
| `job` | `/jobs` | **OFFLINE-CRITICAL** (detail) / **ONLINE-ONLY** (search) | `GET /jobs/:id` must be cached — it backs every other cached surface. `GET /jobs?q=` is a live query; fail gracefully. |
| `user` | `/profiles`, `/users`, `/profiles/:userId/*` | **OFFLINE-CRITICAL** + **SYNC-ON-RECONNECT** | Own profile, experience, education, skills. Small, user-scoped, all `updatedAt`-bearing. `/analytics` is ONLINE-ONLY. |
| `resume` | `/resumes` | **OFFLINE-CRITICAL** (read) / **ONLINE-ONLY** (upload) | Parsed résumé data and scores are worth caching. Upload is a multipart binary + async parse pipeline — do not queue offline. |
| `notification` | `/notifications` | **OFFLINE-CRITICAL** (feed) + **SYNC-ON-RECONNECT** (mark-read) | Read cached feed offline; queue `mark-read` / `read-all`. See schema gap §2. |
| `offer` | `/offers` | **OFFLINE-CRITICAL** (read) / **ONLINE-ONLY** (decisions) | Viewing offers offline is valuable. Accept/decline/negotiate should **not** be queued — see §4 risk note. |
| `company` | `/companies` | **OFFLINE-CRITICAL** (read-only) | Company records are referenced by every cached job. Low volume, rarely changes. |
| `learning` | `/learning/skill-gaps`, `/skills/:id/learning-resources` | **ONLINE-ONLY** | Derived from AI service at request time. Cache-on-view is possible later but has no standalone offline value. |
| `generation` | `/applications/:id/cover-letter`, `/generate/interview` | **ONLINE-ONLY** | LLM generation, premium-gated. Cannot be meaningfully queued — the user is waiting on the output. |
| `employer` | `/employer/*` | **ONLINE-ONLY** | Dashboards and pipeline review over live/aggregate data. |
| `ingestion` | `/employer/ingest` | **ONLINE-ONLY** | Operator-triggered batch job. |
| `payment` | `/payments` | **ONLINE-ONLY** | Never queue money. Must fail loudly, not silently retry. |
| `admin` | `/admin/*` | **ONLINE-ONLY** | Privileged. Queuing admin mutations offline would be a real security regression. |
| `auth` | `/auth` | **ONLINE-ONLY** | See §4 — token expiry while offline is the single biggest UX cliff in this plan. |
| `health` | `/health` | **ONLINE-ONLY** | Useful as the client's connectivity probe; never cache. |
| `metrics` | `/metrics` | **ONLINE-ONLY** | Scrape endpoint. |
| `alerting` | *(no controller)* | **ONLINE-ONLY** | Internal service, no HTTP surface. |

**Totals:** 9 modules with an offline-relevant read or write path; 10 strictly online-only.

---

## 2. Schema gaps — `updatedAt` coverage

Audited all 31 models in `prisma/schema.prisma`. **21 have `updatedAt`, 10 do not.**
Most of the gaps are in append-only or infrastructure tables and are harmless. Two are
directly in the offline path and **block naive delta sync**.

### Blocking gaps

| Model | Has `updatedAt`? | Has soft-delete? | Impact |
|---|---|---|---|
| `SavedJob` | ❌ **No** (`createdAt` only) | ❌ No — hard delete | **Deletions are invisible to delta sync.** A `?since=` query can report newly-saved jobs but can never report *unsaved* ones. A client syncing deltas would keep showing jobs the user removed, forever. |
| `Notification` | ❌ **No** (`createdAt` only) | ❌ No | `readAt` is mutable but nothing records *when the row changed*. Marking a notification read is invisible to delta sync, so unread badges would not converge across devices. |

### Non-blocking gaps (append-only or internal — no action needed)

`ApplicationStageHistory`, `ApplicationTimeline`, `JobSkill`, `RefreshToken`, `OfferMessage`,
`SystemEvent`, `EmailEvent`, `AuditLog`.

These are insert-only by design; `createdAt` (or `eventDate`) is a sufficient sync cursor.
Note `ApplicationTimeline` and `JobSkill` have **neither** `createdAt` nor `updatedAt` —
`ApplicationTimeline` has `eventDate @default(now())` which serves the same purpose;
`JobSkill` is a pure join table and should be synced as part of its parent `Job`, never independently.

### Fully covered (offline path)

`Application`, `Job`, `Recommendation`, `Profile`, `Experience`, `Education`, `Certification`,
`UserSkill`, `Resume`, `ParsedResumeData`, `Company`, `Offer` — all carry `updatedAt`.
`Application`, `Profile`, `Resume`, `Company`, and `User` additionally carry `deletedAt`,
so they already support tombstone-based deletion sync.

---

## 3. Endpoint-shape concerns

### 3.1 `GET /recommendations` performs a write — and is unpaginated

`RecommendationsQueryService.getForUser()` (`src/modules/matching/application/services/recommendations-query.service.ts`)
recomputes and **persists** recommendations when none exist:

```ts
let rows = await this.read(userId, limit);
if (rows.length === 0) {
  await this.recompute.execute(userId, limit);   // writes to DB
  rows = await this.read(userId, limit);
}
```

Three consequences:
- A GET is not safe to replay. A service worker retrying it can trigger expensive AI-backed recomputation.
- It cannot be given a `Cache-Control` / `ETag` treatment naively (Phase 5) without separating the compute trigger from the read.
- It returns **up to 50 full job records including `description`** as a bare unpaginated array. Job descriptions are long free text; this is likely the largest single response in the API and the worst offender for an IndexedDB cache budget.

**Correcting an assumption in the Phase 0 brief:** recommendation ordering is **not**
randomized — it is `orderBy: { score: 'desc' }`, which is deterministic. However there is
**no tiebreak column**, so rows with equal scores can return in arbitrary order between
calls under Postgres. That is enough to defeat naive response-hash change detection.
Recommend adding `{ score: 'desc' }, { jobId: 'asc' }` when this is touched in Phase 2.

### 3.2 Ingestion bumps `updatedAt` on every job it re-sees

`src/modules/ingestion/ingestion.service.ts:111` unconditionally calls `prisma.job.update()`
for every previously-seen posting, writing `lastSeenAt: now` alongside unchanged field values.
Prisma's `@updatedAt` fires on **every** update regardless of whether values actually changed.

**Impact:** every ingestion run marks the entire re-seen job corpus as modified. A
`GET /jobs?since=` delta endpoint built on `Job.updatedAt` would return the whole catalogue
on every poll — the exact opposite of what delta sync is for. This must be resolved before
Phase 2 ships a job delta endpoint. Options: dirty-check before updating, or add a separate
`contentUpdatedAt` bumped only on real field changes.

### 3.3 `POST /saved-jobs/:jobId/toggle` is not idempotent

`save`, by contrast, is explicitly idempotent (`saved-job.repository.ts:43`). But `toggle`
inverts state — replaying it twice returns to the original value. This is precisely the
operation a retrying offline queue will double-submit.

**Recommendation:** the offline queue must emit explicit `POST /saved-jobs` / `DELETE /saved-jobs/:jobId`
and never `toggle`. Consider marking `toggle` as online-only in the client.

### 3.4 Offset pagination is unstable for sync

`GET /jobs` and `GET /applications` both use `skip`/`take` offset pagination
(`limit`/`offset` in `SearchJobQueryDto`, defaults 20/0). Neither returns a total count or a
cursor. When rows are inserted mid-pagination, offset paging silently skips or duplicates
records. Acceptable for interactive browsing; not acceptable as a sync primitive. Phase 2
delta endpoints should use cursor pagination keyed on `(updatedAt, id)`.

### 3.5 Small unpaginated collections — acceptable

`education`, `experience`, `userSkill`, `resume`, and `offer` all use unpaginated `findMany`,
but each is user-scoped and naturally bounded (single-digit to low-double-digit rows).
Full-replace caching is fine; no delta machinery warranted.

### 3.6 No idempotency infrastructure exists

A repo-wide search for `idempoten*` finds only three localised comments (saved-job save,
refresh-token delete, admin soft-delete). There is **no** request-level idempotency key
middleware, table, or header handling. This confirms Phase 1 of the roadmap is correctly
sequenced as a prerequisite.

---

## 4. Cross-cutting risks

**Auth expiry while offline.** Access tokens are short-lived and refresh requires the network.
A user who opens the app offline after token expiry will have a full local cache they cannot
authorize against. Nothing in the current auth module addresses this. This needs a deliberate
decision — likely "serve cached reads on expired-but-recently-valid tokens, block all writes"
— and it should be settled before Phase 3, not after.

**Offer decisions must not be queued.** Accept/decline/negotiate on `/offers` are legally and
contractually meaningful, and `offer.service.ts:352` shows accepting one offer mutates sibling
offers in a transaction. Replaying a stale queued decision after the offer expired or was
rescinded would be materially harmful. Recommend: cache offers for *reading* offline; require
live connectivity for every decision.

**`Application` is the model to imitate.** It has `updatedAt`, `deletedAt`, and crucially
`@@unique([userId, jobId])` — which makes replayed submissions naturally idempotent at the
database level even before Phase 1 lands. `SavedJob` has the same unique constraint. Where
a natural key exists, lean on it rather than relying solely on idempotency keys.

---

## 5. Recommended Phase 1 scope

The Phase 0 brief proposed **saved jobs, applications, recommendations**. That is close, but
the audit changes the ordering and adds one mandatory dependency.

**Recommended scope, in priority order:**

1. **Job (read/detail cache)** — *added; not in the original guess.*
   This is a **prerequisite**, not a nice-to-have. Saved jobs return only an ID array;
   applications and recommendations both reference jobs. Without cached `Job` rows, all three
   of the other resources render as empty shells offline. Ship this first or the rest has no
   visible payoff. **Blocked on fixing §3.2 first.**

2. **Applications** — *confirmed, promote to first user-facing resource.*
   Best-prepared model in the schema: `updatedAt`, `deletedAt`, and a natural unique key for
   idempotent replay. Highest user value (continuing/tracking an application is the core job
   of the product) at the lowest implementation risk.

3. **Saved jobs** — *confirmed as high value, but re-scope the approach.*
   Highest-frequency offline action. But given the `updatedAt` gap **and** the fact that the
   entire resource is a short ID array, **do not build delta sync for it** — full-replace on
   every sync is simpler, smaller, and sidesteps the missing-tombstone problem entirely. The
   schema gap in §2 is real but can be *avoided* rather than fixed.

4. **User profile bundle** (`Profile` + `Experience` + `Education` + `UserSkill`) —
   *added.* Every model already has `updatedAt` and `deletedAt`; collections are small and
   user-scoped. This is the lowest-risk delta-sync implementation in the codebase and makes a
   good proving ground for the Phase 2 endpoint contract before applying it to harder resources.

5. **Recommendations** — *confirmed, but demote to last of the five.*
   Genuine user value, but it carries the most rework: the GET-side-effect (§3.1), the payload
   size, and the missing tiebreak all need resolving first. Doing this last means the Phase 2
   contract is already settled by the time these are addressed.

**Explicitly deferred to a later phase:** notifications (needs the `updatedAt` gap closed
first, and unread-badge convergence is not worth blocking Phase 1 on), offers (read-only
caching only, per §4), résumé parsed data (valuable but downstream of the profile bundle).

### Suggested schema changes to raise in Phase 2

None of these should be made now — listing them so the Phase 2 migration is designed once:

- `SavedJob.updatedAt` — only if delta sync is chosen over full-replace (recommendation above is: don't).
- `Notification.updatedAt` — required before notifications enter scope.
- `Job.contentUpdatedAt` (or dirty-checking in ingestion) — required before any job delta endpoint.
- Tiebreak index supporting `(score DESC, jobId ASC)` on `Recommendation`.

---

## Appendix — method

- Module list: `ls src/modules/` (19 modules) cross-referenced with all 30 `*.controller.ts` files.
- `updatedAt` coverage: script-parsed every `model` block in `prisma/schema.prisma` (31 models).
- Endpoint shapes: read the controller, its query DTO, and the backing service/repository for
  each offline-relevant route; checked `findMany` calls for `take`/`skip`/`orderBy`.
- No files outside `docs/` were created or modified.
