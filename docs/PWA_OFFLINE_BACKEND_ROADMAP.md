# JobFits — PWA Offline Mode: Backend Roadmap

**Scope:** Backend only. Frontend (service worker, manifest, IndexedDB, UI 
offline states) is explicitly out of scope until this is done and reviewed.

**Goal:** Give the backend the API surface a PWA needs to work offline and 
resync cleanly — without that surface, no amount of frontend service-worker 
work can make offline mode reliable.

**How to use this file:** Work through phases in order. Each phase has a 
ready-to-paste prompt for Claude Code. Do NOT start Phase N+1 until Phase N 
is reviewed and merged — later phases assume earlier ones exist.

---

## Phase 0 — Audit & Strategy (no code changes)

**Why first:** Before writing sync code, we need to know which resources 
actually need offline support (jobs, saved jobs, applications-in-progress, 
resume data) vs. which don't (admin, payments, employer dashboards) — 
building sync for everything is wasted effort and a bigger attack surface 
than needed.

### Prompt for Claude Code

```
I'm planning backend support for PWA offline mode in jobfit-backend. 
Before any code changes, I need an audit and a written strategy proposal. 
Do NOT write or modify any code in this phase — this is investigation and 
documentation only.

1. List every module under src/modules/ and, for each, classify it as:
   - OFFLINE-CRITICAL: user needs to view/interact with this data with no 
     connection (e.g. browsing already-loaded jobs, viewing saved jobs, 
     continuing a draft application, viewing own profile/resume data)
   - SYNC-ON-RECONNECT: user can queue an action offline that applies once 
     back online (e.g. submitting an application, saving a job, dismissing 
     a recommendation)
   - ONLINE-ONLY: no offline value, should just fail gracefully when 
     offline (e.g. admin actions, payments, real-time search against 
     Elasticsearch, employer dashboard analytics)

2. For each OFFLINE-CRITICAL and SYNC-ON-RECONNECT resource, check whether 
   the corresponding Prisma model already has an `updatedAt` field we can 
   use for delta sync (most should, per schema.prisma) — flag any that 
   don't.

3. Check whether any existing endpoints already return data in a way 
   that's awkward for offline caching (e.g. huge unpaginated responses, 
   endpoints that always return different data even with no underlying 
   change, like randomized recommendation ordering).

4. Write your findings to docs/PWA_OFFLINE_AUDIT.md with:
   - The three-way classification table above
   - Any schema gaps found (missing updatedAt, etc.)
   - Any endpoint-shape concerns found
   - A short recommended scope for Phase 1 (which 3-5 resources to start 
     with, prioritized by user value — I'd guess saved jobs, applications, 
     and recommendations are the highest priority, but confirm or correct 
     this based on what you find)

Do not modify schema.prisma or any source files. Output is the audit doc 
only. Show me the file content when done rather than just saying it's 
written.
```

---

## Phase 1 — Idempotency Key Infrastructure

**Why:** Offline actions get queued and retried (network blips, app 
restarts, service worker replay). Without idempotency keys, a retried 
"submit application" could create duplicate applications. This has to 
exist before we build the sync queue in Phase 3.

### Prompt for Claude Code

```
Implement idempotency key support for mutating (POST/PUT/PATCH/DELETE) 
endpoints in jobfit-backend, so that a client can safely retry a request 
multiple times without causing duplicate side effects.

1. Add an `IdempotencyKey` model to schema.prisma:
   - id (uuid, PK)
   - key (string, unique) — client-generated key, e.g. a UUID per logical 
     action
   - userId (FK to User)
   - endpoint (string) — route the key was used against
   - requestHash (string) — hash of the request body, to detect a key 
     being reused with a different payload (should be rejected)
   - responseStatus (int)
   - responseBody (json)
   - createdAt (timestamp)
   - expiresAt (timestamp) — keys should expire after 24h, add an index 
     for cleanup queries

2. Create a NestJS interceptor or guard (your call on which fits the 
   existing common/ patterns better — check src/common/ for precedent 
   first) that:
   - Reads an `Idempotency-Key` header on mutating requests
   - If the header is missing, proceed normally (idempotency is 
     opt-in per-request, not mandatory for every endpoint yet)
   - If present: check if that key already exists for this user+endpoint
     - If it exists with a matching requestHash: return the stored 
       response immediately, do NOT re-execute the handler
     - If it exists with a different requestHash: return 409 Conflict
     - If it doesn't exist: let the request proceed, then store the 
       response after the handler completes

3. Apply this to the following endpoints first (the ones most likely to 
   be retried from an offline queue — confirm this list against Phase 0's 
   audit doc if it exists, otherwise use this list):
   - POST /applications (submit application)
   - POST /saved-jobs (save a job)
   - DELETE /saved-jobs/:id (unsave)
   - PATCH /recommendations/:id (dismiss/feedback)

4. Add a scheduled cleanup (cron or BullMQ repeatable job, check existing 
   patterns in src/infra/queue/ or wherever background jobs currently 
   live) that deletes expired IdempotencyKey rows.

5. Write unit tests: same key + same body twice → second call returns 
   cached response without re-executing side effects (verify via mock/spy 
   that the underlying service method was called only once). Same key + 
   different body → 409.

6. Run `pnpm prisma migrate dev` to generate the migration, and confirm 
   `pnpm run start:dev` boots clean and `pnpm test` passes.

Show me `git diff` before I approve committing. Do not push.
```

---

## Phase 2 — Delta Sync Endpoints (pull-based)

**Why:** When the PWA comes back online, it needs to ask "what changed 
since I was last synced?" for each offline-critical resource, rather than 
re-downloading everything.

### Prompt for Claude Code

```
Add delta-sync endpoints so a reconnecting PWA client can pull only 
what's changed since its last sync, instead of re-fetching everything.

Scope this to the resources flagged OFFLINE-CRITICAL in 
docs/PWA_OFFLINE_AUDIT.md (if Phase 0 was completed) — otherwise default 
to: saved-jobs, applications, recommendations, and the user's own profile 
data (experiences, education, certifications, skills).

1. For each in-scope resource, add a `GET /{resource}/sync?since=<ISO8601 
   timestamp>` endpoint that:
   - Returns all rows where updatedAt > since AND belongs to the 
     authenticated user (never leak other users' data)
   - Also returns soft-deleted rows (where deletedAt is set) if the model 
     has soft deletes, so the client knows to remove them locally — this 
     is important, don't skip it
   - Response shape: 
     { 
       "since": "<the timestamp that was queried>",
       "serverTime": "<current server time, ISO8601>", 
       "upserts": [...], 
       "deletes": ["id1", "id2"] 
     }
   - If `since` is omitted, return everything (initial full sync case)
   - Paginate with a `cursor` param if the result set could be large 
     (check existing pagination patterns in the codebase first, reuse 
     them rather than inventing a new style)

2. Add a combined `GET /sync/bootstrap` endpoint that returns a full 
   snapshot across ALL in-scope resources in one call, for first-time app 
   load / fresh install — check existing patterns for how other "combined 
   dashboard" endpoints are structured if any exist (e.g. the dashboard 
   module) and follow that style.

3. Write integration tests confirming:
   - A resource updated after `since` appears in `upserts`
   - A resource updated before `since` does NOT appear
   - A soft-deleted resource appears in `deletes`
   - A user cannot see another user's data via these endpoints (critical 
     — write an explicit test for this)

4. Add these new routes to the Swagger/OpenAPI docs (check how existing 
   endpoints are documented, e.g. @ApiOperation decorators, and match 
   that style).

5. Confirm `pnpm run start:dev` boots clean and `pnpm test` passes.

Show me `git diff` before I approve committing. Do not push.
```

---

## Phase 3 — Offline Mutation Queue (push-based sync)

**Why:** This is the other half of sync — accepting a batch of actions the 
user took while offline (save job, dismiss recommendation, etc.) and 
applying them in order once reconnected.

### Prompt for Claude Code

```
Add a batched mutation endpoint so a reconnecting PWA can flush a queue of 
actions taken while offline, applying them server-side in order.

This depends on Phase 1 (idempotency keys) already being merged — confirm 
that IdempotencyKey model and interceptor exist before starting; if they 
don't, stop and tell me instead of proceeding.

1. Add `POST /sync/batch` accepting:
   {
     "actions": [
       {
         "idempotencyKey": "<client-generated uuid>",
         "type": "SAVE_JOB" | "UNSAVE_JOB" | "DISMISS_RECOMMENDATION" | 
                 "SUBMIT_APPLICATION",
         "payload": { ... },
         "clientTimestamp": "<ISO8601, when the user actually took this 
                              action offline, NOT when it's being synced>"
       },
       ...
     ]
   }

2. Process actions in array order, sequentially (not parallel — order 
   matters if e.g. a job was saved then unsaved while offline). For each 
   action:
   - Reuse the idempotency-key logic from Phase 1 so a batch retried after 
     a partial failure doesn't double-apply already-processed actions
   - Route to the appropriate existing service method (do not duplicate 
     business logic that already exists in the saved-job, application, or 
     matching modules — call into those services directly)
   - Catch and record per-action failures without aborting the whole 
     batch — one bad action shouldn't block the other 9

3. Response shape:
   {
     "results": [
       { "idempotencyKey": "...", "status": "success", "data": {...} },
       { "idempotencyKey": "...", "status": "error", "error": "..." },
       ...
     ]
   }

4. Important edge case — clientTimestamp ordering vs. server state: if a 
   SUBMIT_APPLICATION action's clientTimestamp is offline-queued but 
   another device already submitted an application for the same job in 
   the meantime, this should surface as a conflict, not a silent 
   duplicate. For now, rely on existing unique constraints (check 
   applications table for a unique [userId, jobId] constraint — add one 
   via migration if it doesn't exist) and return a clear "already applied" 
   error in the results array rather than a raw DB error.

5. Write integration tests: 
   - A batch of 3 valid actions all succeed
   - A batch where action 2 fails still lets actions 1 and 3 succeed
   - Replaying the exact same batch (same idempotency keys) doesn't 
     double-apply anything
   - An unauthenticated request is rejected

6. Confirm `pnpm run start:dev` boots clean and `pnpm test` passes.

Show me `git diff` before I approve committing. Do not push.
```

---

## Phase 4 — Conflict Detection

**Why:** Two devices, one offline, editing the same thing (e.g. profile 
edited on phone while offline, also edited on laptop online) — this phase 
makes sure that doesn't silently overwrite data.

### Prompt for Claude Code

```
Add conflict detection for the sync endpoints built in Phase 2 and 3, so 
that offline edits don't silently clobber newer server-side changes.

1. For mutation actions that UPDATE an existing resource (not create — 
   focus on profile fields, experiences, education for now, since those 
   are the most likely to be edited on multiple devices):
   - Require the client to send the `updatedAt` value it last saw for 
     that resource, alongside its update payload
   - Before applying the update, compare the client's stated `updatedAt` 
     against the current server value
   - If they match: apply the update normally
   - If they don't match: this is a conflict. Do NOT apply the client's 
     update. Return a 409 with both versions:
     {
       "conflict": true,
       "serverVersion": { ...current server data... },
       "clientAttempted": { ...what the client tried to send... }
     }

2. This conflict response should flow through the /sync/batch endpoint's 
   per-action results (status: "conflict" instead of "error" or 
   "success") so the frontend can eventually show the user both versions 
   and let them choose — but resolving that UI is explicitly frontend 
   scope, not this phase. Just make sure the backend surfaces enough 
   information for that to be built later.

3. Write integration tests: 
   - Update with matching updatedAt succeeds
   - Update with stale updatedAt returns 409 with both versions, and 
     confirms the server data was NOT changed
   - Confirm this doesn't break the Phase 1 idempotency logic (a retried 
     identical request should still return the cached response, not 
     re-trigger a conflict check)

4. Confirm `pnpm run start:dev` boots clean and `pnpm test` passes.

Show me `git diff` before I approve committing. Do not push.
```

---

## Phase 5 — HTTP Caching Headers

**Why:** For read-heavy, rarely-changing data (job details, company info), 
proper cache headers let the future service worker use standard HTTP 
caching instead of custom logic for everything.

### Prompt for Claude Code

```
Add appropriate HTTP caching headers to read (GET) endpoints for 
relatively static resources, so a future service worker can use standard 
cache strategies (stale-while-revalidate, cache-first) instead of 
reinventing caching logic client-side.

1. Identify GET endpoints for resources that change infrequently once 
   created — likely candidates: GET /jobs/:id, GET /companies/:id, 
   GET /interview-tips, GET /interview-questions, GET /learning-paths — 
   confirm this list makes sense given the actual codebase, adjust if 
   something's missing or shouldn't be there.

2. For each, add:
   - An ETag header derived from the resource's updatedAt (or a hash of 
     the response body if updatedAt isn't reliable for some resource)
   - Support for conditional requests: if the client sends 
     `If-None-Match` matching the current ETag, return 304 Not Modified 
     with no body instead of re-sending the full payload
   - A Cache-Control header appropriate to how often each resource 
     changes (e.g. `max-age=300` for job details, longer for mostly-static 
     content like interview tips)

3. Check if NestJS has existing interceptor infrastructure for this 
   (there may be a caching interceptor already scaffolded — check 
   src/common/interceptors/ before writing a new one from scratch).

4. Write tests confirming: first request returns 200 + ETag, second 
   request with matching If-None-Match returns 304, request after the 
   resource is updated returns 200 with a new ETag.

5. Confirm `pnpm run start:dev` boots clean and `pnpm test` passes.

Show me `git diff` before I approve committing. Do not push.
```

---

## Phase 6 — Documentation & End-to-End Verification

**Why:** Close the loop — make sure the sync API surface is documented 
well enough that frontend work can start without guessing, and that 
everything built in Phases 1-5 actually works together.

### Prompt for Claude Code

```
Finalize documentation and do an end-to-end check of the offline-sync 
backend work from Phases 1-5.

1. Update or create docs/PWA_SYNC_API.md covering:
   - The full idempotency-key contract (header name, behavior, expiry)
   - Every /sync/* endpoint: request/response shapes, auth requirements, 
     pagination behavior
   - The conflict-response shape and what the frontend is expected to do 
     with it
   - Which resources support ETag/conditional caching and their 
     Cache-Control policies
   - A worked example: full flow of "user saves 2 jobs and submits 1 
     application while offline, then reconnects" from the client's 
     perspective, showing the actual request/response bodies

2. Make sure all new endpoints are in the Swagger/OpenAPI output — spin up 
   the server and check /api/docs (or wherever Swagger is mounted) 
   actually shows them correctly with the right DTOs.

3. Run the full test suite (`pnpm test` and `pnpm test:e2e`) and confirm 
   everything from Phases 1-5 passes together, not just individually.

4. Write a short docs/PWA_OFFLINE_KNOWN_GAPS.md listing anything 
   explicitly deferred to frontend work or a future phase (e.g. actual 
   conflict-resolution UI, service worker cache strategies, background 
   sync registration) so nothing gets assumed to be "done" that isn't.

Show me the final docs before I review. Do not push anything without my 
explicit confirmation.
```

---

## After Phase 6

Once backend Phases 0-6 are reviewed and merged, the natural next step is 
frontend PWA work (manifest.json, service worker, IndexedDB-backed local 
store, offline UI states) — but that's a separate roadmap, out of scope 
here per your instruction to do backend first.
