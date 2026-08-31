# Handoff — Redis correctness audit + fixes

**Date:** 2026-08-30 · **Branch:** `feature/redis`
**Status:** audit complete (11 findings) · **all 11 fixed**, uncommitted

> **Scope.** This is the Redis work only. The AI-degradation work is a separate effort and
> is **not** on this branch — see `docs/AI_DEGRADATION_PLAN.md` if it reappears.

---

## 1. Where the work is

**Committed** (verified at `05e0692`):

```
48a61a0  fix(queue): bound every BullMQ operation so a Redis outage cannot hang a request   R2
05e0692  fix(auth): stop Redis being down from disabling brute-force protection             R1
```

**Uncommitted, group 1** — R3/R8/R11, the suppression list moving to Postgres:

```
 M prisma/schema.prisma                                              SuppressedEmail model
?? prisma/migrations/20260828090000_suppressed_emails/               the table
?? src/shared/services/email-suppression.service.ts                  the one owner of the question
?? src/shared/services/email-suppression.service.spec.ts             17 tests
 M src/shared/services/email.service.ts                              the sender now consults it
 M src/shared/services/email.service.spec.ts                         +5 gate tests
 M src/shared/shared.module.ts                                       provide/export
 M src/modules/admin/application/services/email-tracking.service.ts  admin side
?? src/modules/admin/application/services/email-tracking.service.spec.ts  5 tests
 M src/modules/admin/application/dtos/suppress-email.dto.ts          optional `reason`
 M src/modules/admin/presentation/controllers/admin-email.controller.ts
 M src/modules/admin/admin.module.ts                                 stale comment
```

**Uncommitted, group 2** — R4, unbounded reconnection:

```
 M src/shared/services/redis.service.ts        retryStrategy never returns null
?? src/shared/services/redis.service.spec.ts   9 tests
```

**Uncommitted, group 3** — R5, job options and worker-failure visibility:

```
?? src/infra/queue/job-options.ts                                          the policy
?? src/infra/queue/job-options.spec.ts                                     6 tests
 M src/modules/resume/resume.module.ts                                     applies it
 M src/modules/resume/infrastructure/queue/resume-parsing.processor.ts     failed/error handlers
?? src/modules/resume/infrastructure/queue/resume-parsing.processor.spec.ts 8 tests
```

**Uncommitted, group 4** — R6, the token blacklist's failure mode:

```
 M src/modules/auth/infrastructure/services/token-blacklist.service.ts   degrade, not fail open
?? src/modules/auth/infrastructure/services/token-blacklist.service.spec.ts  13 tests
 M src/common/guards/jwt-auth.guard.ts                                   stale fail-open comments
 M src/common/guards/optional-jwt-auth.guard.ts
```

**Uncommitted, group 5** — R7/R9/R10, config and honest health:

```
 M .env.example / .env (untracked) / cloudbuild.yaml    REDIS_PREFIX per environment   R7
 M src/shared/services/redis.service.ts                 command + connect timeouts     R10
 M src/shared/services/redis.service.spec.ts            +2 tests
 M src/infra/queue/queue.module.ts                      owns the connection + queue    R9
 M src/infra/queue/bull-queue.service.ts                isReachable()                  R9
 M src/infra/queue/bull-queue.service.spec.ts           +6 tests
 M src/modules/resume/resume.module.ts                  imports QueueModule
 M src/modules/health/health.module.ts                  imports QueueModule
 M src/modules/health/indicators/redis.health-indicator.ts       checks BOTH clients
 M src/modules/health/indicators/redis.health-indicator.spec.ts  rewritten, 7 tests
```

**Verified after R7/R9/R10:** 1116 tests / 98 suites passing · 0 type errors · lint clean.
Re-verify after any rebase:

```powershell
npx tsc --noEmit -p tsconfig.json
npx eslint "src/**/*.ts"
npx jest --silent
```

**Known flakes, not regressions:** `http-cache.interceptor.spec.ts` and `ai.client.spec.ts`
bind real HTTP servers and occasionally fail under parallel load. Both pass in isolation.
Jest also prints "a worker process has failed to exit gracefully" on some full runs —
intermittent and pre-existing; it reproduces with the newest specs excluded.

⚠️ **The migration has not been applied to any database.** `prisma migrate deploy` (or
`prisma migrate dev` locally) still has to run. The code queries `suppressed_emails`, so
until it does, every send throws `SuppressionCheckUnavailableError` — fail-closed, by
design, but it means the migration is not optional.

---

## 2. What was fixed

### R2 — `POST /resumes` hung indefinitely with Redis down

**Root cause.** There are **two independent ioredis clients** with opposite configs:

| | `RedisService` | BullMQ (`resume.module.ts`) |
|---|---|---|
| `enableOfflineQueue` | `false` — fail fast | **`true`** (ioredis default) |
| `retryStrategy` | gives up after 10 tries | **unset** — retries forever |

So BullMQ does not reject when Redis is down — it *buffers* the command and waits for a
reconnection still being attempted. `add()` never settles. No error, no status, no log.

**Fix.** A 5s bound on every queue operation in `BullQueueService`, throwing a distinct
`QueueUnavailableError`.

- **Bounded at the call site, not the connection.** `enableOfflineQueue: false` on that
  connection would be the obvious fix but it is shared with the Worker, which needs
  blocking behaviour. Bounding the producer leaves the consumer alone.
- **`getJob`/`removeJob` bounded too** — neither is reachable from a request today, but
  they share the connection and therefore the bug.
- **Caller (`ResumeService.uploadResume`)**: by the time the enqueue runs the file is in
  storage and the row is saved, so failing the request would orphan the file. Instead the
  résumé is marked `FAILED` with a message the user can act on. `PENDING` would promise a
  worker that was never scheduled.
- Timer cleared in `finally` (an uncleared one holds the event loop 5s per *successful*
  call — there is a test), and the losing promise's rejection is swallowed so it cannot
  surface as an unhandled rejection.

### R3 + R8 + R11 — the suppression list was written but never read

Three findings, one root cause: **a permanent compliance record was living in a cache.**

**What was broken.** `isSuppressed()` was `private` to `EmailTrackingService` and called
from exactly one place — annotating the admin bounce list for display. `EmailService`, the
thing that actually sends mail, had never heard of it. So an admin suppressed a
hard-bounced address, saw a success message, got an audit row, and **mail kept going to
it**. Broken with Redis fully healthy; not an outage bug. On top of that the key had no
TTL and no durability (R8) — a Redis restart dropped the whole list silently — and
`suppress()` was the one Redis write with no try/catch (R11), so it 500'd when Redis was
down while every neighbour failed open.

**Fix.** New table `suppressed_emails` (migration `20260828090000_suppressed_emails`) and
one service, `EmailSuppressionService`, that owns the question. `EmailService.send()` now
calls `assertSendable()` before every send.

Details worth not undoing:

1. **The gate runs BEFORE the transport check.** Whether an address is consulted must not
   depend on how the environment is configured — that unconditionality is the whole
   finding. There is a test that pins it.
2. **A suppressed address is SKIPPED, not thrown.** It is permanently undeliverable by our
   own decision, which is the system working. Throwing would make the auth event listener
   log an error forever for something functioning as intended.
3. **A failed *lookup* throws — fail closed.** "I could not check" must not be read as
   "safe to send"; that confusion is R3 and R6 both. This is cheap to hold here and NOT
   the Redis situation: the store is the app's own primary database, so if it is
   unreachable the caller that produced this mail (writing a verification code to a user
   row) has already failed. Postgres being down is not a state where we keep mailing.
4. **`email` is the primary key**, so the constraint does the de-duplication; callers
   normalise (lower-case + trim) at the boundary.
5. **`suppressedByAdminId` is deliberately not a foreign key.** The record must outlive the
   admin account that created it.
6. **Re-suppressing keeps the FIRST record** (`upsert` with `update: {}`). A spam complaint
   does not become a hard bounce because someone clicked the button twice.
7. **The bounce page batches.** It was one suppression query per row; it is now one per
   page.

**No backfill is possible.** Whatever was in Redis under `email:suppressed:*` cannot be
recovered — the store was not durable and there is no record of what was ever in it. Any
previously suppressed address has to be re-suppressed. That loss already happened at the
first Redis restart; the migration is what stops it recurring.

**Durability is tested, not asserted:** a test rebuilds the service against the same store
and the suppression is still there, and a second backdates a row a year to show there is no
expiry anywhere in the query path.

### R4 — Redis never reconnected after ~20 seconds down

**What was broken.** One word:

```ts
retryStrategy: (times) => (times > 10 ? null : Math.min(times * 200, 2000))
```

`null` is ioredis's "stop retrying, permanently" signal. Ten attempts on that ramp is
about twenty seconds, after which the client was **dead for the lifetime of the process**.
Redis could come back and `RedisService` would never notice. Recovery required a backend
restart — on Cloud Run, a deploy. Given §5 (Redis has been down for most of recent
sessions), the running system was usually in this state.

**Fix.** `retryStrategy: reconnectDelayMs`, an exported pure function that ramps 200ms per
attempt and **holds at a 5s ceiling forever**. It has no branch that can return `null`.

- **Retrying the connection indefinitely does not make any caller wait longer.**
  `enableOfflineQueue: false` and `maxRetriesPerRequest: 1` still bound an individual
  command, so a request against a down Redis fails as fast as it did before. The two
  settings answer different questions and the old code conflated them. There is a test.
- **5s ceiling** = ~12 connect attempts a minute during an outage, which is nothing, and
  quick enough that a restarted Redis is picked up inside one request's patience.
- **Recovery is now logged as `Redis reconnected`**, distinct from the first
  `Redis connection ready`. Automatic recovery that nobody can observe is hard to trust,
  and this line is the evidence it happened.
- Outage logging is still once-per-outage. Retrying forever means many more `error`
  events than before, and they must not become a log flood — pinned by a test that fires
  50 of them and expects one warning.

**Note the asymmetry this closes.** BullMQ's client retries forever (that is half of R2);
this one gave up after 20s. Neither was chosen — they were two defaults nobody had
compared. Now the connection retries forever in both, and each is bounded at the call
site instead.

### R5 — BullMQ jobs had no retry, no backoff, and grew without bound

**What was broken.** `registerQueue({ name: 'resume-parsing' })` set no
`defaultJobOptions` and `addJob` passed none, so BullMQ's defaults stood: `attempts: 1`,
no backoff, and **no `removeOnComplete`/`removeOnFail` — every job ever processed stayed
in Redis forever**. There was also no `@OnWorkerEvent('failed')` handler, so a
worker-level crash was entirely silent.

**Fix.** `DEFAULT_JOB_OPTIONS` in `@infra/queue/job-options.ts` (one place, so the next
queue registered inherits it), applied at `registerQueue`, plus `failed` and `error`
handlers on `ResumeParsingProcessor`.

| | value | against what |
|---|---|---|
| `attempts` | 3 | ride out a worker restart or Redis blip |
| `backoff` | exponential, 2s | don't retry straight back into the same blip |
| `removeOnComplete` | 24h / 100 | "did my upload go through an hour ago" |
| `removeOnFail` | 7d / 500 | the only in-Redis evidence of what went wrong |

- **Both retention bounds are set on each, deliberately.** `count` alone lets a quiet week
  hold stale jobs; `age` alone lets a busy hour hold thousands. There is a test for each
  half, because the hole is easy to reintroduce by dropping one.
- **Retention is the half that bites silently.** Completed job hashes accumulate in a
  Redis with no memory policy set — nothing warns, the instance just fills until it
  evicts, and what it evicts is whatever else lives there.
- **Retries are mostly dormant here, and that is correct.** `ResumeParserService` catches
  its own errors and writes `parsingStatus: FAILED`, so a bad résumé RESOLVES the job.
  Retrying an unreadable PDF three times burns CPU to reach the same answer. `attempts`
  covers the other kind: the worker dies mid-job, the job stalls, Redis goes away between
  steps. Re-running `parseResume` overwrites that résumé's parsed rows, so a retry is
  safe.
- **Because of that, reaching `'failed'` at all means the worker came apart** — which is
  exactly why it needed a handler. The log says whether a retry is still coming, since
  BullMQ emits the same event for "failed, retrying" and "failed, done", and at 2am those
  are not the same sentence. On the last attempt it also states that the résumé's status
  will not change on its own.
- `'error'` (worker-level, no job attached — lost connection, stalled-check failure) warns
  rather than errors: usually transient, but a stream of them is the signal it is not.

### R6 — a revoked token became valid again during an outage

**What was broken.** `isBlacklisted()` returned `false` on any Redis error and
`blacklist()` silently no-opped. A revoked access token was accepted for its remaining
lifetime, and a logout performed during an outage revoked nothing at all.

**The two words point opposite ways here, and the audit note had them crossed.**

| | means | consequence |
|---|---|---|
| fail **open** | assume NOT revoked → allow | the bug. Bounded by `ACCESS_TOKEN_TTL` = **15m** |
| fail **closed** | assume possibly revoked → **reject** | 401 on every authenticated endpoint |

Fail-closed is *not* "treat the token as still valid" — it is the opposite, and it is a
total API outage, because every authenticated request carries a `jti`. It is also not
deployable: `cloudbuild.yaml` omits Redis, so **production has no reachable Redis today**
and fail-closed would reject every authenticated request, permanently. Trading a
15-minute revocation window for that is the trade R1 already rejected.

**Fix: DEGRADE, like R1** — Redis primary, plus a write-through in-process mirror of every
revocation.

**Where the analogy to R1 breaks, stated in the file.** In R1 the security-relevant events
(failed logins) *happen during* the outage, so the local fallback sees all of them. Here
they mostly happened *before* it, so the mirror knows only what this process revoked. It
is a partial mitigation, not a fix, and it is documented as one.

What it does buy, concretely:

1. **A logout during an outage now actually revokes** on the instance that handled it.
   Previously the write no-opped and the read failed open, so it did nothing whatsoever.
2. **The mirror is consulted even when Redis is healthy**, so a revocation made during an
   outage survives recovery. Same rule as R1: recovery must not hand back a clean slate.
3. Entries expire exactly when their token does, so a restart can only drop entries for
   tokens that were about to die anyway.

Bounded at 10k with a throttled prune and a bounded eviction scan — the same shape R1
needed after measurement. One difference: **there is no safe entry to evict here.** Every
live entry is a revocation, so eviction takes the one expiring *soonest* (least remaining
exposure handed back) and warns once when the cap is first hit.

Closing the gap properly needs a durable revocation store (a `revoked_jti` table). Noted
in the file as a follow-up.

### R7 — no key namespacing

`REDIS_PREFIX` was declared in `env.validation.ts` and **set nowhere**, so `keyPrefix` was
always `''`. Two environments sharing one Redis would collide on `lockout:*`,
`blacklist:*` and `cache:auth:*` — a staging logout revoking a production token, staging's
lockouts locking production accounts.

Now set in `.env` (`dev:`), `.env.example` (`dev:`, with the explanation) and
`cloudbuild.yaml` (`prod:`). **Set in cloudbuild even though `REDIS_URL` is still
omitted** — it costs nothing while there is no Redis, and it means the day someone wires a
shared instance they do not silently inherit the collision.

### R9 — the queue health check never touched BullMQ

`isQueueHealthy()` pinged `RedisService.raw` and reported `processing: 'available'` on the
strength of it. BullMQ has its **own** ioredis client, with its own connection state and
the opposite offline-queue configuration — so `/health/ready` could report the queue
healthy while every upload hung. That is the exact state R2 was about.

**Fix.** `BullQueueService.isReachable()` probes BullMQ's own connection via
`waitUntilReady()` (the same precondition `add()` has), bounded at 1s so a down Redis
cannot hang the readiness probe, quiet so it cannot flood the log. The indicator checks
both clients in parallel and names which half is down — they fail independently, and
"Redis is up but the queue is not" is a real state worth reading off a probe.

**The queue registration moved to `QueueModule`**, imported by both `ResumeModule` and
`HealthModule`. Registering it again in HealthModule would have created a *second* queue
with a second connection — a check of a connection nobody uses, which is the same lie in a
new place. `app.module.wiring.spec.ts` covers the rewiring.

### R10 — no command timeout on `RedisService`

`commandTimeout`/`connectTimeout` were unset. `enableOfflineQueue: false` only covers a
client that KNOWS it is disconnected; a connected-but-wedged server (swapping, blocked on
a slow command, a half-open TCP connection) accepts the command and never answers, and
every caller waits forever.

`commandTimeout: 2s`, `connectTimeout: 5s`. 2s against the health indicator's 1s ping:
every command here is a single O(1) key operation on a nearby cache, so 2s is already
enormous headroom, and larger stops being a bound on a user-facing request. Connect is
longer because a cold TCP+auth handshake to a cloud Redis legitimately outlasts a GET, and
a timed-out connect is retried by R4's strategy anyway.

### R1 — brute-force protection was bypassable by stopping Redis

**`isLocked()` returned `false` on any Redis error**, and `recordFailedAttempt()` no-opped.
Unlimited password guesses against any account, nothing recorded.

**Fix: degrade, don't fail open or closed.** Redis stays primary; on error it falls back to
in-process counters.

- Fail-**closed** was rejected: it turns a cache outage into a total auth outage.
- Fail-**open** was the bug. The service had it by inheritance from the surrounding cache
  pattern, not by decision.

Stated limits, in the file: **per-instance** (N instances = N× attempts, same caveat the
throttler documents), **lost on restart**, **memory-capped at 10k entries**.

Three details worth not undoing:

1. **Recovery does not hand back a clean slate.** When Redis returns it knows nothing about
   attempts made during the outage, so `isLocked` also checks the local map. Otherwise an
   attacker just waits for reconnection.
2. **Eviction prefers unlocked entries.** Evicting a live lock would hand an attacker their
   access back — worse than using memory.
3. **Two perf bugs the tests caught.** The enumeration test ran in **5147ms**: `prune()` was
   O(n) on every failed login, and `evictOne()` was O(n) per insert at the cap. The defence
   became a CPU amplifier under exactly the attack it guards against. Now throttled +
   bounded-scan: **59ms**.

**Mutation-verified:** reverting `isLocked` to `return false` fails 4 tests. The R2 mutation
test was interrupted and never run — worth doing.

---

## 3. Still open — none

All 11 findings are addressed. Two follow-ups were named rather than done, and both are
recorded in the files that carry them:

- **A durable revocation store** (`revoked_jti` in Postgres) would close R6's remaining
  gap — the mirror cannot know what another instance revoked. See the header of
  `token-blacklist.service.ts`.
- **Durable lockout counters** (on the User row, or Postgres-backed windows) would do the
  same for R1. See the header of `account-lockout.service.ts`.

Neither is an oversight; both are a deliberately larger change than an audit fix.

---

## 4. Correct — do not "fix"

- **Auth entity + refresh-token caches** — 300s TTLs, fail-open on read/write/invalidate.
  Right for a cache, and revoked tokens cannot be served from it.
- **Alerting** — dedup and error-rate keys carry TTLs; fail-open right for notifications.
- **Idempotency is Postgres**, not Redis (`IdempotencyKey` model) — durable and
  transactional.
- **Rate limiting does not use Redis** — `@nestjs/throttler` with in-memory storage. It is
  therefore unaffected by a Redis outage, which is why R1 was not a *total* bypass.
- **`RedisService`'s fail-fast design** (`enableOfflineQueue: false`, `lazyConnect`, error
  logged once per outage) is well-built. The problem was what BullMQ does not inherit
  (R2), plus what fail-fast does not cover (R4's reconnection, R10's hung server).
- **The `redis` health indicator itself** — real PING with a 1s timeout, accurate
  `degraded` reporting. Only the *queue* indicator beside it was wrong (R9).

---

## 5. Environment facts a fresh session will not know

- **Redis has been down for most of recent sessions.** The backend boots fine and logs
  `ECONNREFUSED` repeatedly. The fail-open paths were well-exercised and nothing surfaced
  them as a problem — which is the meta-finding behind R1/R6. Note what that means for
  R4: the running system was almost always past its 10-attempt give-up point, so the
  client was dead rather than merely disconnected.
- **Local:** `.env` has `REDIS_HOST`/`REDIS_PORT`, no password, and now `REDIS_PREFIX=dev:`
  (R7). Start Redis with `docker compose up -d` in `jobfit-backend` (container
  `jobfit-redis`).
- **Production:** `cloudbuild.yaml` still omits `REDIS_URL` deliberately — *"the secret
  exists but its value is unverified, and a bad host is worse than none."* So production
  runs with NO Redis at all, permanently degraded on every Redis-backed path. That fact
  decided R6: fail-closed there would reject every authenticated request forever.
  `REDIS_PREFIX=prod:` is now set regardless, so wiring a shared instance later cannot
  silently collide with another environment.
- **Rate limiting in dev is effectively off**: `SCALE = IS_PROD ? 1 : 1000`, so the login
  limiter is 10,000/15min locally. Combined with R1 pre-fix, local dev had *no* brute-force
  protection of any kind.

---

## 6. Order this was done in

1. **R3** (+R8, R11) — sender consults the suppression list; moved to Postgres
2. **R4** — reconnect indefinitely, so recovery does not need a restart
3. **R5** — `defaultJobOptions` + a worker-failure handler
4. **R6** — the blacklist's failure mode, decided
5. **R7, R9, R10** — key prefix, honest queue health, command timeouts

R3 went first because it was broken with Redis fully healthy — not an outage bug at all,
and the only one with an external consequence (a blocked sending domain).

---

## 7. Before this ships

```powershell
cd c:\Users\ROG\Desktop\jobfit\jobfit-backend
npx prisma migrate deploy      # suppressed_emails — the code queries it (see §1)
```

`REDIS_PREFIX` must be set to a DIFFERENT value in every environment. It is `dev:` locally
and `prod:` in `cloudbuild.yaml`; anything else that gets deployed needs its own.
