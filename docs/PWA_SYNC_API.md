# JobFits — PWA Offline Sync API

**Audience:** whoever builds the frontend service worker and offline queue.
**Status:** backend Phases 1–5 complete. Frontend work has not started — see
`PWA_OFFLINE_KNOWN_GAPS.md` before assuming anything here is wired up end to end.
**Base URL:** every path below is relative to `/api/v1` (global prefix, `src/main.ts`).
**Interactive docs:** `/api/docs` (Swagger UI), `/api/docs-json` (raw OpenAPI).

---

## 1. Idempotency keys

Lets a client retry a mutation without applying it twice — the core requirement for an
offline queue that flushes on reconnect.

| | |
|---|---|
| Header | `Idempotency-Key` |
| Value | Client-generated, one per **logical action** (a UUID is fine) |
| Opt-in | Yes. Omit the header and the request behaves exactly as before |
| Expiry | **24 hours** from first use, then the key is forgotten and the action would re-execute |
| Storage | `idempotency_keys` table; swept by `POST /admin/system/idempotency-keys/cleanup` |

### Behaviour

| Situation | Result |
|---|---|
| Key unseen | Handler runs. Response is recorded against the key. |
| Key seen, **same** user + route + body | Handler does **not** run. The original response is replayed, with the original status code. |
| Key seen, **different** user, route, or body | **409 Conflict.** Nothing runs. You reused a key for a new action — mint a fresh one. |
| Handler failed | **No receipt is written.** A retry genuinely re-attempts. A transient error never becomes permanent. |

The body hash ignores key ordering, so `{a:1,b:2}` and `{b:2,a:1}` are the same request.

### Routes that honour it

| Route | Notes |
|---|---|
| `POST /applications` | The one that matters — prevents duplicate applications |
| `POST /saved-jobs` | Already idempotent at the repository level; the key also replays the response body |
| `DELETE /saved-jobs/:jobId` | Key is scoped to the exact path, so reusing one across two jobs is a 409 |

> **Reuse the same key on every retry of the same action.** Generating a new key per attempt
> defeats the entire mechanism.

### Known limitation — concurrent duplicates

The receipt is written *after* the handler completes. Two requests with the same key that
arrive close enough to **overlap** will both execute; the loser's receipt write is dropped.
This covers sequential retries (the offline-queue case) but not simultaneous ones. Closing it
needs a reserve-then-fill row, which is deferred.

---

## 2. Delta sync — `GET /sync/*`

Pull only what changed since the last sync instead of re-fetching everything.

**Auth:** all routes require a Bearer JWT and are **self-scoped** — the user comes from the
token, never from a path or query parameter. There is no `:userId` to tamper with.

> **Route shape note.** These live at `/sync/{resource}`, not `/{resource}/sync`. The latter
> collides with existing `@Get(':id')` / `@Get(':userId')` routes (`"sync"` parses as an id),
> and the profile sub-resources have no single resource root.

### Query parameters

| Param | Type | Default | Meaning |
|---|---|---|---|
| `since` | ISO-8601 | — | Return rows changed **strictly after** this instant. Omit for a full sync. |
| `cursor` | opaque string | — | From the previous page's `nextCursor`. Treat as a token; do not parse or construct. An unrecognised cursor is ignored, not rejected. |
| `limit` | int 1–500 | 100 | Max rows per page (upserts + deletes combined). |

### Response envelope

```jsonc
{
  "since": "2026-08-10T09:00:00.000Z",   // echoed back; null on a full sync
  "serverTime": "2026-08-10T09:15:00.000Z",
  "upserts": [ /* full records — create or replace locally */ ],
  "deletes": [ "id-1", "id-2" ],          // soft-deleted — remove locally
  "nextCursor": "eyJ1cGRhdGVk...",        // null when this page is the last
  "fullReplace": true                     // saved-jobs only; see below
}
```

**Two rules that matter:**

1. **Store `serverTime` and send it as the next `since`.** Never your own clock — client
   clocks drift, and a clock ahead of the server's silently skips rows forever. `serverTime`
   is sampled *before* the query runs, so a row written mid-request is picked up next time
   rather than lost.
2. **Drain pagination before advancing the watermark.** While `nextCursor` is non-null, keep
   calling with the **same** `since` and the new `cursor`. Only persist the new watermark once
   `nextCursor` comes back `null`. Advancing early loses everything after the first page.

Paging is ordered by `(updatedAt, id)`. The `id` tie-break is why rows sharing a millisecond
can't be skipped or duplicated across a page boundary.

### Resources

| Route | Deletes reported? | Notes |
|---|---|---|
| `GET /sync/applications` | ✅ soft-delete tombstones | Includes candidate-archived rows — archiving is a view preference, not a deletion |
| `GET /sync/profile` | ✅ | At most one row (1:1 with user) |
| `GET /sync/experiences` | ✅ | |
| `GET /sync/education` | ✅ | |
| `GET /sync/certifications` | ✅ | No repository exists yet; read directly |
| `GET /sync/skills` | ✅ | |
| `GET /sync/recommendations` | ❌ **always empty** | `Recommendation` is hard-deleted with no `deletedAt`. A withdrawn recommendation lingers locally until the next full sync. |
| `GET /sync/saved-jobs` | ❌ **always empty** | Returns `fullReplace: true` and the **entire** list every time; `since`/`cursor` are accepted but ignored. **Replace your local collection wholesale — do not merge.** `SavedJob` has neither `updatedAt` nor a soft delete, so an unsave cannot be expressed as a delta. |

**`Job` is deliberately not synced** despite being offline-critical: ingestion rewrites every
re-seen posting unconditionally, bumping `updatedAt` on unchanged rows, so a job delta would
return the whole catalogue on every poll. Cache job detail via ETag (§5) instead.

### `GET /sync/bootstrap`

Full snapshot of all eight resources in one round trip, for first load or a fresh install.

```jsonc
{
  "serverTime": "2026-08-10T09:15:00.000Z",
  "resources": {
    "applications":    { /* same envelope as above */ },
    "profile":         { ... },
    "experiences":     { ... },
    "education":       { ... },
    "certifications":  { ... },
    "skills":          { ... },
    "savedJobs":       { ... },
    "recommendations": { ... }
  }
}
```

Each resource is capped at the default page size and reports its own `nextCursor`. **If any
comes back non-null, drain that resource on its own route before treating the bootstrap as
complete.**

---

## 3. Flushing the offline queue — `POST /sync/batch`

**Auth:** Bearer JWT required.

```jsonc
{
  "actions": [
    {
      "idempotencyKey": "9b1c…",           // per action, reused across retries
      "type": "SAVE_JOB",
      "payload": { "jobId": "job-123" },
      "clientTimestamp": "2026-08-10T08:41:02.000Z"
    }
  ]
}
```

- Applied **strictly in array order, one at a time.** Order matters: "save job X" then
  "unsave job X" must land in that order.
- `clientTimestamp` is when the user *took* the action offline, not when it is being flushed.
  Recorded for diagnostics; **array order remains authoritative**. A queue whose timestamps
  disagree with its array order is logged as a likely client bug.
- Max **50** actions per call.
- `clientTimestamp` is **not** part of the idempotency hash, so re-stamping the time on retry
  does not cause a spurious conflict.

### Action types

| `type` | Required `payload` | Routes to |
|---|---|---|
| `SAVE_JOB` | `jobId` | `SavedJobService.save` |
| `UNSAVE_JOB` | `jobId` | `SavedJobService.remove` |
| `DISMISS_RECOMMENDATION` | `jobId` | `RecommendationDismissService.dismiss` |
| `SUBMIT_APPLICATION` | `jobId`, optional `resumeId` / `coverLetter` / `notes` | `ApplicationService.submitApplication` |
| `UPDATE_PROFILE` | `expectedUpdatedAt`, `changes` | `ProfileService.updateProfile` |
| `UPDATE_EXPERIENCE` | `id`, `expectedUpdatedAt`, `changes` | `ExperienceService.updateExperience` |
| `UPDATE_EDUCATION` | `id`, `expectedUpdatedAt`, `changes` | `EducationService.updateEducation` |

### Response

**Always HTTP 200**, even when some actions failed. A non-2xx would tell the client to retry
the whole batch and re-attempt work that already succeeded. Inspect `results` per action —
one entry per submitted action, in the same order.

```jsonc
{
  "results": [
    { "idempotencyKey": "9b1c…", "status": "success", "data": { "jobIds": ["job-123"] } },
    { "idempotencyKey": "4f2a…", "status": "success", "data": { … }, "replayed": true },
    { "idempotencyKey": "7d3e…", "status": "error", "code": "CONFLICT",
      "error": "You have already applied to this job" },
    { "idempotencyKey": "1a9b…", "status": "conflict", "code": "VERSION_CONFLICT",
      "error": "This record changed on the server since you last loaded it. …",
      "serverVersion": { … }, "clientAttempted": { … } }
  ]
}
```

| Field | When | Meaning |
|---|---|---|
| `status` | always | `success` \| `error` \| `conflict` |
| `data` | success | Handler result |
| `replayed` | success | `true` = not re-executed; a stored result was returned. Treat as success. |
| `code` | error / conflict | Branch on this, not on `error` prose |
| `serverVersion`, `clientAttempted` | conflict | See §4 |

### Error codes and what to do

| `code` | Retryable? | Action |
|---|---|---|
| `FAILED` | ✅ yes | Leave in the queue; retry later |
| `CONFLICT` | ❌ no | Business rule refused it (e.g. already applied). Drop from queue. |
| `VERSION_CONFLICT` | ❌ not as-is | Resolve against `serverVersion`, then resend with a fresh `expectedUpdatedAt` |
| `IDEMPOTENCY_CONFLICT` | ❌ no | Client bug — key reused for a different action |
| `INVALID_PAYLOAD` | ❌ no | Malformed / missing required field |
| `NOT_FOUND` | ❌ no | Referenced record does not exist |

**Neither failures nor conflicts write a receipt**, so both are genuinely retryable under the
same key once the cause is addressed.

---

## 4. Conflict detection (optimistic concurrency)

Applies to updates of records editable from multiple devices: **profile, experiences,
education**.

The client must send `expectedUpdatedAt` — the `updatedAt` it last saw. If the server's copy
has moved on, the update is **refused, not applied**.

### Over HTTP — 409

`PATCH /profiles/:userId`, `PATCH /profiles/:userId/experience/:expId`,
`PATCH /profiles/:userId/education/:eduId`

```jsonc
{
  "statusCode": 409,
  "timestamp": "2026-08-10T09:15:00.000Z",
  "path": "/api/v1/profiles/u1/experience/exp-1",
  "message": "This record changed on the server since you last loaded it. Your update was not applied. …",
  "conflict": true,
  "serverVersion":   { "id": "exp-1", "title": "Principal Engineer", "updatedAt": "…11:00:00.000Z" },
  "clientAttempted": { "expectedUpdatedAt": "…09:00:00.000Z", "title": "Staff Engineer" }
}
```

### Over batch — `status: "conflict"`

Same two payloads on the per-action result (§3). It does **not** abort the batch; later
actions still run.

### What the frontend is expected to do

1. **Do not auto-retry.** Blindly resending with a refreshed `expectedUpdatedAt` is
   last-write-wins with extra steps — exactly what this prevents.
2. Show the user both versions and let them choose. Building that UI is **frontend scope and
   not yet done** — see `PWA_OFFLINE_KNOWN_GAPS.md`.
3. On "keep mine", resend with `expectedUpdatedAt` set to `serverVersion.updatedAt`.
   On "keep theirs", drop the queued action and adopt `serverVersion` locally.
4. `clientAttempted` is echoed back so the resolution UI works even if the queue entry is gone.

> ⚠️ **Breaking change:** `expectedUpdatedAt` is **required** on all three PATCH routes.
> Existing callers break until updated.
> Not covered: `PATCH /profiles/:userId/preferences` and `/salary` (they take raw bodies).

---

## 5. HTTP caching (ETag / conditional GET)

For service-worker `stale-while-revalidate` and `cache-first` strategies using standard HTTP
semantics rather than bespoke client logic.

| Endpoint | `Cache-Control` | ETag from |
|---|---|---|
| `GET /jobs/:id` | `public, max-age=300, stale-while-revalidate=600` | `updatedAt` (weak, `W/"…"`) |
| `GET /skills/:skillId/learning-resources` | `public, max-age=86400, stale-while-revalidate=604800` | content hash (strong) |
| `GET /profiles/:userId/experience` | `public, max-age=60, stale-while-revalidate=300` | content hash |
| `GET /profiles/:userId/education` | `public, max-age=60, stale-while-revalidate=300` | content hash |

All four also send `Vary: Authorization`.

**Conditional GET:** send the ETag back as `If-None-Match`. Unchanged → **304 with no body**.
Changed → 200 with a new ETag. Weak comparison is used, so a proxy that strips the `W/`
prefix still matches; comma-separated lists and `*` are honoured.

`GET /jobs` (search) is deliberately **not** cached — a query-dependent result set is not a
static resource.

---

## 6. Worked example — two saves and an application, queued offline

### While offline

The user saves `job-A`, saves `job-B`, and applies to `job-C`. The client queues three actions,
each with its own key generated **at queue time** (not at send time):

```jsonc
[
  { "idempotencyKey": "11111111-…", "type": "SAVE_JOB",           "payload": { "jobId": "job-A" }, "clientTimestamp": "2026-08-10T08:40:00.000Z" },
  { "idempotencyKey": "22222222-…", "type": "SAVE_JOB",           "payload": { "jobId": "job-B" }, "clientTimestamp": "2026-08-10T08:41:00.000Z" },
  { "idempotencyKey": "33333333-…", "type": "SUBMIT_APPLICATION", "payload": { "jobId": "job-C", "coverLetter": "…" }, "clientTimestamp": "2026-08-10T08:43:00.000Z" }
]
```

### Step 1 — reconnect, flush the queue

```http
POST /api/v1/sync/batch
Authorization: Bearer <access token>
Content-Type: application/json
```
```jsonc
{ "actions": [ /* the three above, verbatim */ ] }
```

**Response — `200 OK`**

```jsonc
{
  "results": [
    { "idempotencyKey": "11111111-…", "status": "success", "data": { "jobIds": ["job-A"] } },
    { "idempotencyKey": "22222222-…", "status": "success", "data": { "jobIds": ["job-B", "job-A"] } },
    { "idempotencyKey": "33333333-…", "status": "success",
      "data": { "id": "app-77", "userId": "u1", "jobId": "job-C", "status": "SUBMITTED",
                "appliedAt": "2026-08-10T09:15:00.000Z", "availableActions": ["WITHDRAWN"],
                "archived": false, "createdAt": "…", "updatedAt": "…" } }
  ]
}
```

All three succeeded → clear them from the queue.

### Step 1b — the flush was interrupted (the realistic case)

Say the connection dropped after action 2. The client retries the **identical batch, same
keys**:

```jsonc
{
  "results": [
    { "idempotencyKey": "11111111-…", "status": "success", "replayed": true, "data": { "jobIds": ["job-A"] } },
    { "idempotencyKey": "22222222-…", "status": "success", "replayed": true, "data": { "jobIds": ["job-B", "job-A"] } },
    { "idempotencyKey": "33333333-…", "status": "success", "data": { "id": "app-77", … } }
  ]
}
```

The two saves were **not** re-applied — `replayed: true`. Only the application, which never
completed, actually ran. **No duplicate application was created.**

Had the user already applied to `job-C` from another device:

```jsonc
{ "idempotencyKey": "33333333-…", "status": "error", "code": "CONFLICT",
  "error": "You have already applied to this job" }
```

Drop it from the queue and refresh locally — do not retry.

### Step 2 — pull down what changed while offline

```http
GET /api/v1/sync/applications?since=2026-08-10T08:30:00.000Z
Authorization: Bearer <access token>
```
```jsonc
{
  "since": "2026-08-10T08:30:00.000Z",
  "serverTime": "2026-08-10T09:15:04.000Z",
  "upserts": [ { "id": "app-77", "jobId": "job-C", "status": "SUBMITTED", … } ],
  "deletes": [],
  "nextCursor": null
}
```

`nextCursor` is `null` → persist `serverTime` (`09:15:04.000Z`) as the next watermark.

Saved jobs are a **full replace**:

```http
GET /api/v1/sync/saved-jobs
```
```jsonc
{
  "since": null, "serverTime": "2026-08-10T09:15:05.000Z",
  "upserts": [ { "id": "sj-2", "jobId": "job-B", "createdAt": "…" },
               { "id": "sj-1", "jobId": "job-A", "createdAt": "…" } ],
  "deletes": [], "nextCursor": null, "fullReplace": true
}
```

`fullReplace: true` → **replace** the local saved-jobs collection with exactly this list.

### Step 3 — refresh cached job detail cheaply

```http
GET /api/v1/jobs/job-C
If-None-Match: W/"a3f9c21e8b4d5f6071829304a"
```

Unchanged → **`304 Not Modified`, no body**; keep the cached copy.
Changed → `200` with a new `ETag`; replace it.

---

## Cross-references

- `PWA_OFFLINE_AUDIT.md` — Phase 0: which resources are offline-critical and why
- `PWA_OFFLINE_KNOWN_GAPS.md` — what is **not** done
- `PWA_OFFLINE_BACKEND_ROADMAP.md` — the phase plan this implements
