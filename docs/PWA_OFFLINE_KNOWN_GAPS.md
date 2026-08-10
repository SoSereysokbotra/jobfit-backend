# PWA Offline Mode — Known Gaps

**Purpose:** everything Phases 1–5 did **not** deliver, so nothing here is mistaken for done.
**Date:** 2026-08-10 · **Scope covered:** backend only, Phases 1–5.

> **The headline:** the backend now exposes the API surface a PWA needs. **No frontend offline
> behaviour exists.** There is no service worker, no manifest, no IndexedDB, no offline queue,
> no conflict UI. The app does not work offline today.

---

## 1. Frontend — nothing is built

Explicitly out of scope for these phases. All of it remains to do.

| Gap | Notes |
|---|---|
| **Service worker** | Not registered. No caching strategies wired to the `Cache-Control` / ETag policies the backend now sends. |
| **Web app manifest** | Absent — the app is not installable. |
| **IndexedDB / local store** | No local persistence, so nothing to sync *into*. |
| **Offline mutation queue** | The `POST /sync/batch` contract exists; nothing on the client builds, persists or flushes a queue. Idempotency keys must be generated **at queue time** and reused across retries — a client that regenerates per attempt defeats the whole mechanism. |
| **Background Sync registration** | No `SyncManager` / `periodicSync`. Flushing currently depends on the app being open. |
| **Conflict-resolution UI** | Backend returns `serverVersion` + `clientAttempted`; **nothing renders them.** Until this exists, a `VERSION_CONFLICT` is a dead end for the user. Do **not** auto-retry — that is last-write-wins with extra steps. |
| **Offline UI states** | No "you're offline", no pending-action badges, no queue inspector. |
| **Watermark bookkeeping** | Client must store `serverTime` per resource and drain `nextCursor` before advancing it. Not implemented. |

---

## 2. Backend gaps — deferred by design

### 2.1 Resources that cannot express deletions

| Resource | Gap | Consequence | Fix |
|---|---|---|---|
| **Saved jobs** | `SavedJob` has no `updatedAt` and hard-deletes | No true delta. `/sync/saved-jobs` returns the **full list** every time (`fullReplace: true`). Cheap today; grows with the collection. | Add `updatedAt` + soft delete, or keep full-replace |
| **Recommendations** | `Recommendation` has no `deletedAt` | `deletes` is always empty. A withdrawn recommendation lingers in the client cache until a full sync. | Add `deletedAt` |
| **Notifications** | No `updatedAt`; `readAt` mutates invisibly | **Not in sync scope at all.** Unread badges will not converge across devices. | Add `updatedAt` |

### 2.2 `Job` is not delta-syncable

Ingestion rewrites every re-seen posting unconditionally, bumping `updatedAt` on rows whose
content never changed — a `/sync/jobs` route would return the entire catalogue on every poll.
**Fix this before adding one:** dirty-check in `ingestion.service.ts`, or add a separate
`contentUpdatedAt` bumped only on real changes. Job detail is cacheable via ETag meanwhile.

### 2.3 Idempotency — concurrent duplicates

Receipts are written *after* the handler completes. Two requests with the same key that
**overlap** will both execute. Sequential retries (the offline case) are safe; simultaneous
ones are not. Needs a reserve-then-fill row (insert an in-flight receipt *before* the handler),
which is a schema change.

### 2.4 Dismissing a recommendation does not stick

`DISMISS_RECOMMENDATION` deletes the row, but `RecomputeUserMatchesUseCase` rebuilds
recommendations from scratch and nothing records the rejection — **a dismissed job can
reappear.** Needs `dismissedAt` on `Recommendation` (honoured by recompute) or a dismissed-jobs
table. **Do not advertise dismissal as permanent until then.**

### 2.5 Conflict detection coverage

Covers `PATCH /profiles/:userId`, `.../experience/:expId`, `.../education/:eduId` only.
**Not covered:** `PATCH /profiles/:userId/preferences` and `/salary` (raw bodies, no DTO), and
every other mutable resource (applications, resumes, offers).

⚠️ **Breaking change already shipped:** `expectedUpdatedAt` is **required** on those three
PATCH routes. Existing frontend callers break until updated.

### 2.6 Cleanup is not scheduled

`POST /admin/system/idempotency-keys/cleanup` exists and is ADMIN-scoped, but **no scheduler
calls it.** Expired keys accumulate until something does. Point Cloud Scheduler at it (daily is
ample for a 24h TTL). It is triggered rather than an in-process timer because Cloud Run
throttles CPU outside requests — the same reasoning as `HeartbeatService`.

### 2.7 Auth expiry while offline — unresolved

Access tokens are short-lived; refresh needs the network. A user opening the app offline after
expiry has a full local cache they **cannot authorize against**. Nothing addresses this.
Needs a deliberate decision (likely: serve cached reads on recently-expired tokens, block all
writes) **before the offline queue ships**.

### 2.8 Caching coverage is thin

Only four GET routes carry ETag/`Cache-Control`. `GET /jobs` (search) was deliberately excluded.
Several endpoints named in the original Phase 5 brief **do not exist**: `GET /companies/:id`
(`CompanyController` is empty), `GET /interview-tips`, `GET /interview-questions`, and
`GET /learning-paths` (deliberately removed earlier).

---

## 3. Test and tooling gaps

| Gap | Detail |
|---|---|
| **`pnpm test:e2e` does not pass** | 4 pre-existing failures, unrelated to Phases 1–5. The specs call unprefixed URLs (`/auth/register`) while `main.ts` sets a global `api/v1` prefix, and `app.e2e-spec.ts` is the untouched Nest scaffold expecting `Hello World!` at `/`. Two blocking config defects were fixed during Phase 6 (missing `moduleNameMapper`, `esModuleInterop` default imports) so the suite at least **loads and runs** — but the assertions themselves are stale. |
| **No e2e coverage of sync** | All Phase 1–5 tests are unit/integration with in-memory Prisma stand-ins. Nothing exercises `/sync/*` against a real database over HTTP. |
| **`prisma migrate dev` is unusable** | No migration creates the `offers` table, so the shadow database fails at `20260809090000_offer_messages` (P3006/P1014). Migrations must be hand-written and applied with `migrate deploy`. Pre-existing; blocks *any* future schema change. |
| **Swagger generics are imprecise** | `SyncEnvelopeDto` is generic, so OpenAPI renders `upserts` as `array of array` rather than the real item type. All routes and DTOs are present and correct otherwise. Fixable with `@ApiExtraModels` + `getSchemaPath` per route. |
| **Load characteristics unknown** | `/sync/bootstrap` issues 8 queries in parallel and `/sync/batch` runs up to 50 sequential writes. Neither has been profiled. |

---

## 4. Suggested order for what's next

1. **Auth-expiry-while-offline decision** (§2.7) — blocks the queue; a design call, not code.
2. **Schema migration batch** (§2.1, §2.4) — `SavedJob.updatedAt`, `Recommendation.deletedAt` +
   `dismissedAt`, `Notification.updatedAt`. Do them in one migration.
3. **Ingestion dirty-check** (§2.2) — unblocks job delta sync.
4. **Schedule the cleanup sweep** (§2.6) — one Cloud Scheduler entry.
5. **Frontend Phase 1** — service worker + IndexedDB + queue, in that order.
6. **Conflict-resolution UI** — last, once real conflicts can be produced end to end.

---

## Cross-references

- `PWA_SYNC_API.md` — the API contract
- `PWA_OFFLINE_AUDIT.md` — Phase 0 findings the gaps above trace back to
- `PWA_OFFLINE_BACKEND_ROADMAP.md` — the original phase plan
