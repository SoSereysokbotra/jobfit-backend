# JobFits — Mentor / Interviewer Review

**Date:** 2026-08-18 · **Reviewer:** external code + docs review (all four repos)
**Method:** read every `.md` in `jobfit-backend`, `jobfit-frontend`, `jobfit-extension`,
`jobfits-ai-service`, then **verified each claim against the code, the Prisma schema and
git** — not against the docs. Every finding cites a file, a line, or a git object.

> **Why this file exists.** The mentor's question — *"if a user uploads many CVs, which one
> does the AI use?"* — was answered well (`jobfits-ai-service/docs/PHASE_DEFAULT_RESUME.md`).
> This document hunts for the **rest of that family**: assumptions made without noticing,
> contradictions between features, and the questions an interviewer asks next.
>
> Findings are ordered by **how badly they hurt if left alone**, not by how hard they are to
> fix. Each has: **the problem · why it matters · a possible fix · the question you'll be asked.**

---

## Scoreboard

| # | Finding | Severity |
|---|---|---|
| 1 | No email is ever sent, but login requires a verified email → **no new user can sign in** | ✅ Fixed 2026-08-20 |
| 2 | `PATCH /users/:id/subscription` has no role or ownership check → free Premium; any user can retier or delete any other user | ✅ Fixed 2026-08-20 |
| 3 | `GET /users/email/:email` is `@Public()`; `GET /users` lists everyone; `POST /users` accepts `role: ADMIN` | ✅ Fixed 2026-08-20 |
| 4 | No single backend branch serves both the web app and the extension | ✅ Fixed 2026-08-20 |
| 5 | Screening ignores `application.resumeId` — the employer judges a CV the candidate did not submit | ✅ Fixed 2026-08-20 (match score: stated limit) |
| 6 | `recommendations` is a write-once cache: changing your CV never moves your matches | ✅ Fixed 2026-08-20 (migration pending) |
| 7 | `GET /recommendations/scout` structurally cannot return a new job | ✅ Fixed 2026-08-20 |
| 8 | `PRIVACY.md` states something the code no longer does, and omits four hosts | 🟠 Legal / store review |
| 9 | Employers cannot see a candidate's résumé anywhere in the API | 🟠 Missing requirement |
| 10 | The paywall gates features no payment path can unlock, and the extension serves the same AI ungated | 🟠 Contradiction |
| 11 | No rate limit on any AI/GPU route | 🟠 Cost |
| 12 | `formatSalaryRange` fabricates currency and magnitude (`$500K` for a $500 job) | 🟠 Honesty |
| 13 | The displayed match **percentage** has never been calibrated — the defect that got `fitScore` rejected | 🟡 Evidence |
| 14 | Soft-deleted users can still log in, and can never re-register | 🟡 Edge case |
| 15 | Two parallel match tables (`MatchScore` vs `Recommendation`) | 🟡 Design |
| 16 | `SavedJob` dies with the job; `TrackedJob` survives it | 🟡 Consistency |
| 17 | The ER diagram documents ~14 tables that do not exist — and contracts are written against them | 🟡 Docs |
| 18 | `docs/SRS.md` is 0 bytes — the scorecard grades against a document that isn't there | 🟡 Docs |
| 19 | Khmer postings get a confident score and a silently wrong skills table | 🟡 Known-limit, under-surfaced |

---

## 1. 🔴 No email is ever sent, but login demands a verified email

**The problem.** `MailerService.sendMail` is a `console.log` stub
([mailer.service.ts:16](../src/infra/mailer/mailer.service.ts#L16)). Registration generates a
numeric code, saves it, and emits `UserRegisteredEvent` carrying that code
([register.handler.ts:44-69](../src/modules/auth/application/commands/register.handler.ts#L44-L69));
the only delivery channel is the stub. Login then hard-refuses an unverified account
([login.handler.ts:68](../src/modules/auth/application/commands/login.handler.ts#L68)).

On the deployed Cloud Run instance, **a brand-new user registers, receives nothing, and can
never log in.** The code exists only in a server log line. Every account that works today
works because someone was watching that console, or flipped the flag in the database.

This invalidates more than it looks: the extension's cookie SSO, the "log in on the web app
first" flow, every user journey in the docs — all assume a population that cannot be created.

**Why it matters.** It is the difference between "deployed" and "usable".
`docs/Missing and Not Start feature/01-scorecard.md` records NOTIF-001 as *"❌ Not started —
no email is ever sent"*, but files it under **notifications**, as a missing feature. It is
not a missing feature; it is a **broken critical path in authentication**, and nothing in the
docs connects the two.

**A possible solution.** Wire one provider (Resend is already named in the stub) behind
`MailerService` — verification and password reset only, for now. Until that lands, add a
startup guard: if `NODE_ENV=production` and no mail provider is configured, **fail to boot**
rather than accept registrations you cannot complete. A stub that silently succeeds is worse
than one that throws.

**The question you'll be asked.**
> *"Walk me through what happens when I sign up on your live site right now. Where does the
> verification code go?"*
> Follow-up: *"How did this survive to production — what would have caught it?"* (Worth having
> ready: no test covers register→verify→login end to end, because every test seeds a verified
> user.)

### ✅ Resolved 2026-08-20 — and two of the premises were already stale

Two claims in this finding did not hold when we went to fix it:

- **Mail *is* wired.** A real nodemailer transport exists at
  [email.service.ts](../src/shared/services/email.service.ts), driven by
  [auth-events.listener.ts](../src/modules/auth/infrastructure/event-handlers/auth-events.listener.ts)
  off `UserRegisteredEvent` (`EventEmitterModule` is registered globally by
  [event-bus.module.ts](../src/events/event-bus.module.ts)). `cloudbuild.yaml` sets
  `EMAIL_HOST/PORT/USER/SMTP_FROM` and pulls `EMAIL_PASS` from Secret Manager. We ran the
  real SMTP handshake against the configured Gmail account: **OK**.
- **`MailerService` was never the delivery channel.** The `console.log` stub the finding
  cites (`src/infra/mailer/mailer.service.ts`) had zero importers — dead scaffolding that
  read like the live path. Deleted, along with the empty
  `auth/infrastructure/external-services/email.service.ts` placeholder.
- **A register→verify→login e2e does exist** ([auth.e2e-spec.ts](../test/auth.e2e-spec.ts),
  "Flow 1"). It reads the code from the DB, so it covers the *flow* but not *delivery* —
  which is why a delivery outage would still have passed CI.

What was genuinely broken is the **fail-open**: with `EMAIL_*` unset, `EmailService` logged
a warning and skipped every send, and `send()` swallowed SMTP errors, so both a missing
config and a bouncing mailbox looked exactly like success. Fixed:

1. **Boot guard** — `NODE_ENV=production` with `EMAIL_HOST/USER/PASS` missing now **throws
   in `onModuleInit`**. The deploy fails rather than shipping a revision that accepts
   registrations it cannot complete. Dev/test still fail open, so the suite needs no SMTP.
2. **`send()` throws** instead of swallowing. The event listener — the one caller that must
   not propagate, since the user row is already committed — catches it and logs at `error`
   naming the user-visible consequence ("cannot log in until they resend").
3. **Boot-time SMTP handshake**, run in the background so a transient outage does not block
   a Cloud Run cold start. Catches a rotated/wrong `EMAIL_PASS`, which the boot guard
   cannot.
4. **`mail` on `/health/ready`** ([mail.health-indicator.ts](../src/modules/health/indicators/mail.health-indicator.ts))
   — soft, like Redis: never `down`, but `degraded: true` with the impact spelled out when
   the transport is unconfigured or the handshake failed.
5. **Tests** — 12 specs on the guard/throw/status contract, 4 on the listener's
   swallow-and-log, 4 on the indicator.

**Still open:** delivery is proven at the transport, not at the inbox — nothing asserts a
real message arrives (Gmail may throttle or spam-file it). A synthetic
register→receive→verify probe against a real mailbox is the next step, and is what would
turn *"the handshake is OK"* into *"a user can actually sign in."*

---

## 2. 🔴 Any logged-in user can grant themselves Premium — or delete your account

**The problem.** `RolesGuard` returns `true` when a route carries no `@Roles()` metadata
([roles.guard.ts:23-25](../src/common/guards/roles.guard.ts#L23-L25)) — correct for that
guard, but it means "secure by default" covers **authentication only, never authorization**.
`UserController` has no `@Roles()` anywhere:

- [`PATCH /users/:id/subscription`](../src/modules/user/presentation/controllers/user.controller.ts#L80)
  takes `:id` from the URL and a tier from the body. No ownership check, no admin check. Any
  authenticated user can `PATCH /users/<their own id>/subscription {"tier":"PROFESSIONAL"}`
  and unlock every paid feature. They can also downgrade anyone else.
- [`DELETE /users/:id`](../src/modules/user/presentation/controllers/user.controller.ts#L94)
  lets any authenticated user soft-delete any account.

**Why it matters.** The premium gate in
[generation.controller.ts:126-136](../src/modules/generation/generation.controller.ts#L126-L136)
is described across the docs as *"enforced on the backend, not just the UI"*
(`JobFits_AI_Integration_Plan.md` §7). It is enforced — against a value the attacker
controls.

The destructive one is worse. `HANDOFF_2026-08-17.md` §6 records that a user row vanished and
took 50 hand-labelled eval pairs with it, noting *"no `USER_ACCOUNT_DELETED` audit row, so it
did not go through the admin path."* This endpoint is precisely a path that produces no audit
row.

**A possible solution.** Two small changes:
1. `@Roles('ADMIN')` on `list`, `create`, `remove`, `updateSubscription`.
2. For anything a user does to **themselves**, drop `:id` and read `@CurrentUser()`. An id in
   a URL is a permission decision you have to remember to make; an id from the token is one
   you cannot forget.

The admin module already has audited, role-gated user management — `UserController`'s write
routes are a duplicate surface that arguably should not exist.

**The question you'll be asked.**
> *"You said the paywall is enforced server-side. Show me the line that stops me calling
> `PATCH /users/<my id>/subscription` with `PROFESSIONAL`."*
> And: *"Your global guard is 'secure by default'. Default-secure against what, exactly?"*

### ✅ Resolved 2026-08-20

Both holes were real and reproduced. Blast radius for the fix was zero: the frontend calls
only `/admin/users/*` — nothing anywhere consumes `UserController`'s write routes.

**The answer to "default-secure against what":** authentication only. `JwtAuthGuard`
(APP_GUARD) demands a token; `RolesGuard` (APP_GUARD) allows any route carrying no
`@Roles()`. So the default is *authenticated*, never *authorized*, and every route must
state its own authorization. That distinction is now written at the top of
[user.controller.ts](../src/modules/user/presentation/controllers/user.controller.ts) where
the next person adding a route will read it. We left `RolesGuard` itself alone — flipping
it to deny-by-default would 403 every unannotated route in the app.

What changed:

| Route | Before | After |
|---|---|---|
| `POST /users` | any authenticated caller | `@Roles('ADMIN')` |
| `GET /users` | any authenticated caller | `@Roles('ADMIN')` |
| `PATCH /users/:id/subscription` | any authenticated caller | `@Roles('ADMIN')` |
| `DELETE /users/:id` | any authenticated caller | **removed** |

- **The delete is gone, not gated.** `@Roles('ADMIN')` on it would have left *two* admin
  delete paths, one of which writes no audit row — which is the defect `HANDOFF_2026-08-17`
  §6 blames for the vanished user and its 50 eval pairs. Deletion is now reachable only via
  `DELETE /admin/users/:id`, which records `USER_ACCOUNT_DELETED`. The now-dead
  `UserService.deleteUser` was removed too, so the path cannot be re-exposed by one
  `@Post()`.
- `:id` on the subscription route is now `ParseUUIDPipe`, matching the admin controller.
- **`profile.controller.ts` was already correct** — its `:userId` writes all call
  `assertOwner()`. `UserController` was the outlier, not the norm.

**Tests.** 14 specs in
[user.controller.authz.spec.ts](../src/modules/user/presentation/controllers/user.controller.authz.spec.ts)
drive the *real* `RolesGuard` against the *real* decorator metadata, including the original
exploit (a `JOB_SEEKER` retiering their own id) and an assertion that no deletion route
exists. Verified by mutation: deleting a single `@Roles('ADMIN')` fails 4 of them. A test
against the controller *body* would have passed either way — the whole defect was that the
body never got to decide.

**Follow-ups this exposes (not done here):**
1. `PATCH /users/:id/subscription` still writes **no audit row**. `AuditActionType` has no
   `USER_SUBSCRIPTION_CHANGED` member, so adding one needs a Prisma migration.
2. The payment module is an empty scaffold (`payment.controller.ts` is 4 lines). This admin
   route is therefore the *only* way a tier can change — finding #10, confirmed.
3. `GET /users/:id` and the `@Public()` `GET /users/email/:email` are still open. Those are
   finding #3, deliberately untouched here.

---

## 3. 🔴 A public user-lookup, an open user list, and role-settable user creation

**The problem.** Three routes on the same controller:

- [`GET /users/email/:email`](../src/modules/user/presentation/controllers/user.controller.ts#L49-L51)
  is explicitly `@Public()` and returns a full `UserResponseDto` — id, name, role,
  `subscriptionTier`. **Unauthenticated.** It is an account-existence oracle: anyone can test
  whether an email has a JobFits account, and harvest user ids.
- [`GET /users`](../src/modules/user/presentation/controllers/user.controller.ts#L68) returns
  a paginated list of every user to any authenticated caller.
- [`POST /users`](../src/modules/user/presentation/controllers/user.controller.ts#L41) accepts
  an optional `role`, including `ADMIN`
  ([create-user.dto.ts:15-18](../src/modules/user/application/dtos/create-user.dto.ts#L15-L18)),
  and creates the row with an empty `passwordHash`.

The `POST` is not *currently* a full takeover, because that account has no password and
cannot verify — but only because finding #1 is broken. Fix email delivery without fixing
this, and "create an ADMIN with an email I control, then use forgot-password" becomes a
working privilege escalation. **Two bugs are holding each other shut.**

**Why it matters.** The public lookup is a data-protection problem in its own right (the
extension's `PRIVACY.md` promises not to share user data; an unauthenticated endpoint that
confirms an account by email is a different kind of disclosure). The #1/#3 interaction is the
more interesting point: a latent vulnerability masked by an unrelated defect is exactly what a
security-minded interviewer probes for.

**A possible solution.** Un-`@Public()` the email lookup — if the frontend uses it for "email
already registered", that belongs in the registration response, not a public read of the user
record. `@Roles('ADMIN')` on list and create. Strip `role` from `CreateUserDto`: role
assignment is an admin action with an audit row, not a request field.

**The question you'll be asked.**
> *"Which of your endpoints can I hit with no token at all? List them from memory."*
> Then: *"What's the blast radius if I can enumerate every user's email and role?"*

### ✅ Resolved 2026-08-20 — and the chain was worse than described

`GET /users` and `POST /users` were already gated by §2. What remained:

| Route | Before | After |
|---|---|---|
| `GET /users/email/:email` | `@Public()` — no token | `@Roles('ADMIN')` |
| `GET /users/:id` | any authenticated caller, any record | own record, or `@Roles`-free ADMIN check |
| `CreateUserDto.role` | optional `UserRole`, incl. `ADMIN` | **field removed** |

- **The email oracle is gone and nothing needed it.** No consumer exists in the frontend or
  the AI service, and `POST /auth/register` already answers "is this email taken" with
  `EMAIL_ALREADY_REGISTERED` — which is where the review said it belongs.
- **`GET /users/:id` now checks ownership** against the JWT subject
  (`assertSelfOrAdmin`), mirroring what `profile.controller.ts` already did correctly. The
  check runs *before* the lookup, so it is not a 403-vs-404 existence oracle either.
- **`role` is off `CreateUserDto`.** Stripping it costs nothing real: this route creates a
  row with an empty `passwordHash` that cannot log in, so it was never a working way to
  make an employer. The working path is `prisma/seed.ts`, which sets a password and a
  verified email. `UserController` is now the only user-writing surface outside
  `/admin/users`, and it can mint nothing but a JOB_SEEKER.

**On "two bugs holding each other shut" — the chain was live, and longer than the review
traced.** With §1 fixed, we walked it: create the account → `request-password-reset` (which
does not care that `passwordHash` is empty) → `reset-password` sets a real hash. That still
leaves `login.handler.ts:68` refusing an unverified account — but
`POST /auth/resend-email-verification` mails a code to the same attacker-controlled address,
so `isVerified` falls too. Four public auth routes, no admin involvement after step 1. §2
closed step 1 by requiring an ADMIN token; §3 removes the `role` field so even that step
cannot mint a privileged account.

**Tests.** [user.controller.authz.spec.ts](../src/modules/user/presentation/controllers/user.controller.authz.spec.ts)
is now 30 specs, including a sweep asserting **no handler on this controller is `@Public()`**
— so re-adding one fails a test rather than shipping. Both new protections were
mutation-verified: restoring `@Public()` on the email lookup fails 4 specs; deleting the
`assertSelfOrAdmin` call fails 2.

**Answering "which endpoints can I hit with no token", for real.** Counted by decorator,
not by grep on the string: **23 before, 18 now**, and all 18 are deliberate.

| Count | Routes |
|---|---|
| 9 | `POST /auth/*` — register, login, refresh, and the verify/reset flows |
| 3 | `GET /health/live · ready · heartbeat` |
| 2 | `GET /jobs`, `GET /jobs/:id` — the public job board |
| 1 | `POST /admin/login` |
| 1 | `GET /metrics` — separately gated by `METRICS_TOKEN` |
| 1 | `GET /skills/:skillId/learning-resources` |
| 1 | `GET /resume-builder/templates` |

The 5 removed: `GET /users/email/:email` (§3 above) and the 4 profile reads (§3a below).

### 3a. ✅ The profile reads, found while answering that question — gated 2026-08-20

**Not in the original review.** `GET /profiles/:userId` was `@Public()` and returned
`phone`, full name, photo, bio, location and job preferences — unauthenticated, keyed by
user id. Its three sub-resources
(`/profiles/:userId/education | experience | skills`) were public too, adding full work
history, education and skill set. With `GET /users/email/:email` handing out user ids to
anyone, **email → user id → phone number** was a complete anonymous PII harvest. §3 closed
the first link; this closes the rest.

All four now require a token and enforce **self-or-admin**, the same rule as
`GET /users/:id`:

| Route | Before | After |
|---|---|---|
| `GET /profiles/:userId` | `@Public()` | self or ADMIN |
| `GET /profiles/:userId/skills` | `@Public()` | self or ADMIN |
| `GET /profiles/:userId/education` | `@Public()` | self or ADMIN |
| `GET /profiles/:userId/experience` | `@Public()` | self or ADMIN |

**A second bug the gating exposed.** The education and experience lists carry
`@HttpCache({ maxAge: 60, staleWhileRevalidate: 300 })`, and `cacheControlHeader` defaults
`scope` to **`public`** ([http-cache.decorator.ts:31](../src/common/decorators/http-cache.decorator.ts#L31)).
Turning a public list into a per-user response while it still emits
`Cache-Control: public` would let a shared CDN or proxy store one user's work history and
serve it to whoever asked next — a worse leak than the one being fixed. Both are now
`scope: 'private'`. The decorator already documented this ("use `private` for anything
scoped to one user"); nothing had needed it before.

**`assertOwner` was copy-pasted in four controllers** (three module-level functions plus a
private method). Since self-or-admin was needed in four more places, both now live in
[ownership.util.ts](../src/common/utils/ownership.util.ts) with the reasoning attached, and
all five call sites — including `GET /users/:id` — use it.

**Deliberately NOT a role test.** `assertSelfOrAdmin` refuses an `EMPLOYER` reading a
candidate. When "an employer may view an applicant" lands (finding #9) that must be a
*checked relationship* — an application linking the two — because `role === 'EMPLOYER'`
alone would re-open the entire candidate table to anyone who registers as an employer. The
helper says so in a comment, and a test pins it.

**Blast radius: none found.** Every profile read in the frontend goes through
`use-profile.ts`, where all 11 hooks derive the id from `useUserId()` — the caller's own.
No page reads another user's profile; the AI service does not call these routes.
⚠️ `jobfit-extension` was not checked — it is not checked out locally.

**Tests.** 20 specs in
[profile-reads.authz.spec.ts](../src/modules/user/presentation/controllers/profile-reads.authz.spec.ts)
(per route: `@Public()` is gone, a stranger is refused, an EMPLOYER is refused, owner and
ADMIN pass, and the refusal happens *before* the read so it is not an existence oracle),
plus 9 on the shared helper. Mutation-verified: deleting the `assertSelfOrAdmin` call from
two controllers fails 4 specs.

---

## 4. 🔴 No single backend branch serves both clients

**The problem.** Verified with `git ls-tree`, not from the docs:

| Branch | `saved-external-job` controller | `job-tracker` module |
|---|---|---|
| `origin/main` @ `7c145aa` | **4 files — present** | **absent** |
| `feat/external-job-tracker` @ `cbcb455` (checked out) | **absent** | **5 files — present** |

Both branched from `dd61b15`. The extension has `savedJobs` flipped to `"real"` and calls
`POST /saved-jobs/external` (`jobfit-extension/src/data/savedJobs.ts:33`); the frontend's Job
Tracker calls `/api/v1/tracker/*`. **Whichever branch is deployed, one client 404s.**

There is a second-order hazard. `HANDOFF_2026-08-17.md` §3 records:
> *"`saved_external_jobs` (1 row, **no code uses it**) is left alone deliberately — dropping a
> table is a separate, explicit decision."*

That observation is correct *on this branch* and false on `origin/main`. `grep` for
`saved_external_jobs` in `src/` returns nothing here — which is exactly the evidence someone
would use to justify dropping the table, destroying a live feature.

**Why it matters.** The handoff is written to be trusted by a fresh reader. Here a carefully
verified statement became untrue because the verification was branch-local, and it reads as a
standing decision rather than a point-in-time observation.

**A possible solution.** Merge `feat/external-job-tracker` into `main` before anything else,
then re-run the "which routes exist" audit on the merged tree. Longer term: the extension's
`docs/PROGRESS.md` "Backend reality (verified)" column should record **the commit it was
verified against**, not just a date — a date does not identify a tree.

**The question you'll be asked.**
> *"Your extension and your web app both talk to the same API. Which commit is deployed, and
> which of the two is currently broken against it?"*

### ✅ Resolved — merged at `560d70e`; the audit it asked for found two deploy blockers

**The merge already landed.** Re-running the review's own `git ls-tree` check against every
live ref reproduces its table exactly for the two historical commits, and clears it for the
current ones:

| Ref | `saved-external-job` | `job-tracker` |
|---|---|---|
| `7c145aa` (old `main`) | 6 files | absent |
| `cbcb455` (old feature branch) | absent | 5 files |
| `origin/main` · `main` · `fixback` | **6 files** | **5 files** |

**The "which routes exist" re-audit, done properly.** File presence does not prove a route
is reachable — a merge can bring files without wiring. Checked all four layers:

| Layer | Extension (`saved-jobs/external`) | Frontend (`tracker`) |
|---|---|---|
| Files on the tree | 6 ✓ | 5 ✓ |
| Module in `app.module.ts` | `SavedJobModule` ✓ | `JobTrackerModule` ✓ |
| Controller in the module | `SavedExternalJobController` ✓ | `JobTrackerController` ✓ |
| Routes (prefix `api/v1`) | `POST /`, `GET /`, `GET /lookup`, `DELETE /:id` ✓ | 8 routes ✓ |
| Migration applied in DB | `20260813080000` ✓ | `20260813120000` ✓ |
| Table exists | `saved_external_jobs` ✓ | `tracked_jobs` ✓ |

**The tree also compiles and passes clean now: 62 suites, 731 tests, 0 failures.** The
"pre-existing failures" carried through findings #1–#3 were never code — two were a stale
local Prisma client (`prisma generate` had not been re-run after the merge added
`TrackedJob`/`SavedExternalJob`), and two were the connection bug below.

#### ⚠️ Two deploy blockers the audit surfaced — fixed in config, but needing action outside this repo

**1. `prisma migrate deploy` could not have run.** `prisma/schema.prisma` declares
`directUrl = env("DIRECT_URL")`, and Prisma validates every env var the datasource
references before executing *any* command. `cloudbuild.yaml`'s migrate step passed only
`DATABASE_URL`, so the step aborts with **P1012 — "Environment variable not found:
DIRECT_URL"**. Reproduced locally with the same command. Because the pipeline is
health-gated, a failing migrate step fails the build and nothing deploys — so this does not
silently skip migrations, it stops releases outright.
*Fixed here:* `DIRECT_URL` added to `availableSecrets` and to the migrate step's
`secretEnv`. **Needs you:** create the `DIRECT_URL` secret in Secret Manager (the
session-mode URL, port 5432) or the step will now fail on a missing secret instead.

**2. `DATABASE_URL` was pointed at the session pooler.** `.env` had port **5432**, which
Supabase caps at 15 clients — contradicting both the file's own comment and
`schema.prisma`'s ("runtime queries go through the transaction-mode pooler (6543)"). Every
test run exhausted it: `FATAL: (EMAXCONNSESSION) max clients reached in session mode`.
Moving to 6543 alone then fails differently — `42P05 prepared statement "s0" already
exists` — because Prisma sends named prepared statements that Supavisor reuses across
clients. **Both are needed: port 6543 *and* `?pgbouncer=true`.** That second requirement is
very likely why someone moved it back to 5432 in the first place.
*Fixed here:* local `.env` corrected, and `.env.example` now states both failure modes
verbatim so the next person recognises them. **Needs you:** check the production
`DATABASE_URL` secret has `:6543/...?pgbouncer=true`. On 5432 Cloud Run will exhaust the
pool under real traffic.

#### Still open

- **The extension was not verified.** `jobfit-extension` is not checked out alongside the
  other repos, so its `PROGRESS.md` "Backend reality (verified)" column could not be
  updated to record a **commit** rather than a date, as this finding recommends.
- **`fixback` is 3 commits ahead of `main`** (the fixes for findings #1–#3) and 0 behind.
  Merging it back is a separate decision.
- **The convention worth adopting**, since this whole class of error comes from verifying
  against "the code" without recording *which* code: any claim of the form "no code uses X"
  carries the SHA it was checked at — `verified at 560d70e`, not `verified 2026-08-17`.
  Applied to the two stale notes in `HANDOFF_2026-08-17.md` §10 and `JOB_TRACKER_PLAN.md`
  §6, both of which still told a reader to merge before deploying.

---

## 5. 🟠 Screening judges a CV the candidate did not submit

*This is the mentor's question one layer down — and it is still open.*

**The problem.** `Application` has a `resumeId` column, and the submit DTO accepts one
([application.service.ts:81](../src/modules/application/application.service.ts#L81)). So the
system does record *"the candidate applied with **this** CV"*.

`ApplicationScreeningService.screen()` then selects
`{ id, userId, jobId, status, screenedAt }`
([application-screening.service.ts:68](../src/modules/matching/application/services/application-screening.service.ts#L68))
— **`resumeId` is never selected and never used.** It scores `application.userId` against
`application.jobId`, which resolves through `ActiveResumeService` to *the user's default CV
right now*.

Live consequences:

- A candidate with a "Designer CV" and a "Developer CV" applies to a design role with the
  designer CV; the employer's screening summary describes the **developer** CV.
- `EmployerApplicationResponseDto` calls the screening *"A SNAPSHOT of that moment, never
  recomputed — so an employer can always explain a decision they made on it, even after the
  candidate edits their résumé"*
  ([employer-application-response.dto.ts:11-16](../src/modules/employer/application/dtos/employer-application-response.dto.ts#L11-L16)).
  The snapshot is real — but it is a snapshot of **the wrong document**, and the comment
  asserts a guarantee the code does not provide.
- `dto.resumeId` reaches `Application.create` with **no ownership check**. Nothing verifies
  that résumé belongs to the caller. Harmless today because nothing reads it; not harmless the
  moment anything does.
- If the client omits `resumeId`, the application is stored with **no CV at all**, even though
  the user has a default. Nothing back-fills it.

**Why it matters.** `PHASE_DEFAULT_RESUME.md` fixed eight read sites so the *user's* view is
consistent. But an application asks a different question with a different correct answer:
matching asks *"which CV represents you right now?"*; an application asks *"which CV did you
send, then?"*. That doc's "What we are deliberately NOT doing" section rejects per-résumé
embeddings — defensible for matching — but the reasoning was never re-run for the application
path, where the answer is already sitting in a column.

**A possible solution.** In `submitApplication`, resolve the résumé at write time:
`dto.resumeId` if supplied **and owned by the caller**, else
`activeResume.findActiveResumeId(userId)` — and make the column non-null from then on. Have
`screen()` read `application.resumeId` and score against **that** résumé's parsed data. The
"snapshot" comment then becomes true.

**The question you'll be asked.**
> *"I applied with my design CV and you scored my engineering one. Which CV is on the
> application row, and which one did the screening read?"*
> Sharper version: *"Your `Application` table has a `resumeId` column. What is it for? Who
> reads it?"*

### ✅ Mostly resolved 2026-08-20 — one half fixed, the other half now stated rather than implied

All four consequences confirmed. The write side and the requirements half are fixed; the
match-score half cannot be, for a documented reason, so it is now declared instead of
quietly wrong.

**Write side — `submitApplication` resolves the résumé once, at submission.**
`dto.resumeId` if the caller **owns** it (scoped `userId` + `deletedAt: null`), otherwise
`activeResume.findActiveResumeId(userId)`. That closes two of the listed defects:
attaching someone else's CV is refused with a 400 (not a 404 — whether that id exists is
not the caller's business), and omitting `resumeId` no longer stores NULL when the user has
a perfectly good default.

**Deliberate deviation from the suggested fix:** the column stays **nullable**. Making it
non-null would block a candidate who has uploaded nothing from applying at all. NULL now
means "there was no CV to record", not "we forgot" — a distinction the back-fill makes
true.

**Read side — screening now selects `resumeId` and passes it to `SkillGapService.analyse`,**
which grew an optional third parameter. The two live callers that legitimately want the
*current* CV (`GET /matching/skill-gap`, the learning path) simply omit it. A named résumé
with no parse yields `NO_PARSED_RESUME` rather than silently falling back to the active
one — that substitution is the whole defect, so the fallback must not be reachable by
accident.

#### The match score is a different problem, and the review's diagnosis was one step off

The finding says screening "resolves through `ActiveResumeService` to the user's default CV
right now". True for the requirements half. The **match score** never touched
`ActiveResumeService` at all: `matchForJob` runs a cosine against `profiles.embedding` —
**one vector per user**, built from profile + active parsed résumé
([matching-embedding.service.ts:74-83](../src/modules/matching/application/services/matching-embedding.service.ts#L74-L83))
and recomputed whenever either changes. So it is not per-résumé and cannot be pointed at a
submitted document without per-résumé embeddings, which `PHASE_DEFAULT_RESUME.md`
explicitly rejected. Adding an embed call would also make `screen()` depend on the AI
service, which it currently and deliberately does not ("no LLM call").

So `screenMatchScore` remains profile-level. What changed is that
`ScreeningSummaryDto`'s comment — the one this finding correctly called out for asserting a
guarantee the code did not provide — now says exactly which of its fields are per-document
and which is not, instead of implying all of them are.

**Tests — 17 new, all mutation-verified.**
7 on résumé resolution at submit (ownership, soft-deleted, back-fill, no-résumé user, and
that a named CV skips the default lookup), 6 on screening reading the submitted CV —
including one that pins the match score as profile-level so nobody later assumes otherwise
— and 4 on `analyse`'s résumé selection. Removing the `resumeId` argument from screening
fails 3; bypassing the ownership check fails 5.

**Also commented, not changed:** the learning path keeps reading the *active* CV on
purpose. It answers "what should I learn next?", where scoring an old submitted CV would
recommend learning things the candidate has since added — same helper, different question,
different correct résumé.

---

## 6. 🟠 `recommendations` is a write-once cache — changing your CV never moves your matches

**The problem.** `RecommendationsQueryService.getForUser` recomputes **only when the user has
zero rows**
([recommendations-query.service.ts:26-31](../src/modules/matching/application/services/recommendations-query.service.ts#L26-L31)).
`grep -rn "@Cron\|ScheduleModule" src/` returns **nothing** — there is no nightly batch. The
only other caller is `scripts/recompute-recommendations.ts`, run by hand.

Meanwhile `UserProfileUpdatedListener` faithfully re-embeds the candidate on profile change,
preference change, résumé parse, and (since 2026-08-17) default-résumé change
([user-profile-updated.listener.ts](../src/modules/matching/listeners/user-profile-updated.listener.ts)).
**Re-embedding writes `profiles.embedding`. Nothing invalidates `recommendations`.**

So the user story `PHASE_DEFAULT_RESUME.md` Step 3 exists to deliver —
*"otherwise the user picks a different CV and their recommendations don't move"* — **still does
not work.** The embedding moves; the cached rows do not. Step 3 solved half the problem and
the doc reads as though it solved all of it.

The same gap swallows every other change: a better CV, five new skills, a new salary
expectation, a new city — recommendations stay frozen at whatever they were the first time the
page was loaded. `HANDOFF_2026-08-17.md` §8 names this as the failure mode where *"a fix looks
like it did nothing"* — but frames it as an operator hazard around deploys, not as a
**user-facing correctness bug**.

**Why it matters.** This is the most likely thing a mentor notices by *using* the product, and
it silently strands the whole matching investment: the reranker's +20% MRR, the 305 new
Cambodian jobs, the default-résumé fix. None of it reaches an existing user.

**A possible solution.** Three tiers, cheapest first:

1. **Invalidate on write.** The listener already fires on every candidate-side change — have
   it `recommendation.deleteMany({ where: { userId } })` after a successful re-embed. The
   existing lazy path rebuilds on the next read. One line, and it makes Step 3 true.
2. **Stamp freshness.** Add `computedAt` — and ideally the `resumeId` and embedding version
   the score came from — to `Recommendation`, and recompute when stale. That also lets the UI
   say *"matched against your CV from 3 Aug"* instead of implying it is live.
3. **Corpus side.** New jobs need a fan-out too — see #7.

Note the interaction with `recommendation-dismiss.service.ts`, whose header already documents
that *"a dismissal does not survive a recompute"*. Fixing #6 makes that latent bug fire
constantly, so the dismissed-jobs table it suggests becomes a **prerequisite**, not a nicety.

**The question you'll be asked.**
> *"I uploaded a new CV. When do my recommendations change?"*
> When the honest answer is "when the row count hits zero": *"So what does the reranker's +20%
> MRR actually buy a user who signed up last month?"*

### ✅ Resolved 2026-08-20 — invalidate-on-write, plus the prerequisite the review flagged

Confirmed exactly as described, and it needed a schema change: making invalidation real
without durable dismissals would have resurrected every rejected job on the next profile
edit. Migration
[`20260820100000_recommendation_staleness_and_dismissal`](../prisma/migrations/20260820100000_recommendation_staleness_and_dismissal/migration.sql)
adds three nullable/defaulted columns to `recommendations` — additive, safe on a populated
table.

**Staleness is a MARKER, not a delete.** The review's tier 1 is `deleteMany({ userId })`
and let the lazy path rebuild. We didn't, for two reasons:

1. A recompute that then fails leaves the user staring at an **empty** recommendations
   page. Slightly-old matches beat none, so stale rows keep serving until a rebuild
   succeeds — and `getForUser` now catches a failed recompute and serves what it has.
2. Deletion is *how a dismissal is represented*. Tier 1 as written would have wiped
   dismissals on every profile edit.

So: `staleAt` is set by
[`RecommendationStalenessService`](../src/modules/matching/application/services/recommendation-staleness.service.ts),
called by `UserProfileUpdatedListener` **after a successful re-embed** (marking first would
loop the read path against an unchanged vector). `getForUser` recomputes when rows are
missing **or** any row is stale. Recompute clears `staleAt` and stamps `computedAt`.

**Tier 2, `computedAt`, is in** — so the UI can say *"matched against your CV from 3 Aug"*
rather than implying the number is live. Nothing renders it yet; the column is there and
populated.

**The prerequisite: dismissals are now durable.** `dismissedAt` on the row instead of a
hard delete. Reads filter it, the extension's scout filters it, recompute refreshes the
score but never clears the flag. `recommendation-dismiss.service.ts`'s ⚠️ KNOWN LIMITATION
header is now a ✅ RESOLVED header.

#### A second bug, not in the finding: recompute never removed anything

`execute()` **upserts only**. It writes the new top-N and leaves every other row untouched
— so a job that dropped out of the ranking kept sitting in the user's list with whatever
score it had months ago, *even on the manual recompute path the finding says is the only
one that runs*. Recompute now deletes this user's non-dismissed rows that are not in the
new set.

#### A gap this closed for free

`GET /sync/recommendations` had `deletes` permanently empty "for want of a soft delete"
(sync.service.ts:16-17, audit §2). `dismissedAt` is exactly that soft delete, and
`splitDelta` already turns a tombstone into a delete — so a dismissal now propagates to
every device instead of lingering in the client cache. One mapping line.

#### Known trade-off

The first read after any profile/résumé change now pays for a recompute, which includes
the LLM rerank. Previously only brand-new users ever paid it. That is the cost of the
feature working at all; a background job (tier 3 / #7) is where it goes to stop being on
the request path.

**Tests — 22 new, mutation-verified.** 5 on the staleness service, 6 on when `getForUser`
recomputes (including that a failed recompute still serves stale rows), 5 on the listener
pairing, 4 on durable dismissal, plus recompute-prunes-obsolete-rows and the sync
tombstone. Reverting the read path to the old zero-row check fails 1; removing the
listener's invalidation fails 2. Whole suite: 68 files, 769 tests, green.

**⚠️ Needs you: the migration is written but NOT applied.** The Supabase session pooler was
saturated while this was built, so `prisma migrate dev` could not run. Apply with
`npx prisma migrate dev` locally; production picks it up from the cloudbuild migrate step
(which now has `DIRECT_URL` — see #4). Until it is applied, anything touching
`recommendations` will fail on the three missing columns.

---

## 7. 🟠 The scout endpoint cannot, by construction, return a new job

**The problem.** `getScout` reads **existing `recommendation` rows** and filters them by
`job.createdAt >= since`
([recommendations-query.service.ts:44-52](../src/modules/matching/application/services/recommendations-query.service.ts#L44-L52)).
Recommendations are only ever written by a recompute (#6). A job ingested *after* the user's
one-and-only recompute therefore has **no recommendation row**, and can never be returned — no
matter how well it matches.

`CONTRACTS.md` P3 describes the endpoint as *"jobs matching the user's profile at/above
`minScore`, **created since** `since`"*, and the extension's service worker polls it every 3
hours on a `chrome.alarms` schedule. That alarm is polling a set that changes only when
someone runs a script by hand.

**Why it matters.** This is the purest form of a hidden assumption: the feature is built,
tested, documented, shipped and opted into — and the data flow it depends on was never built.
Nothing errors. It returns `[]` forever, indistinguishable from "no good jobs this week". The
305 new Cambodian jobs — the biggest product win in the project — are invisible to every scout
user.

**A possible solution.** Scout should not read the cache. Either (a) run retrieval live for
the user restricted to jobs `createdAt >= since` — at 367 rows this is cheap — or (b) fan out
on ingest: when a batch lands, recompute the affected users. (a) is right at this scale; (b)
is the answer for the scaled version, and being able to articulate the trade-off between them
is worth more than either implementation.

**The question you'll be asked.**
> *"Your scout tells me about new matching jobs every 3 hours. Trace the path a job takes from
> `ingest.ts` to my notification. Where does it stop?"*

### ✅ Resolved 2026-08-20 — option (a), with the tripwire for when (b) becomes right

Confirmed exactly as described. **The window is now inverted:** instead of taking cached
recommendations and filtering them by `job.createdAt`, `getScout` takes the jobs that are
actually new and scores those. A job with no cached row — which is every job ingested
since the user's last recompute — is now reachable.

**Where the path used to stop:** `ingest.ts` → `jobs` row → `JobPublishedEvent` →
`JobPublishedListener` embeds it → **and there it ended.** Nothing wrote a
`recommendation` row for that job for any user, and `getScout` read only that table. The
embedding existed; the row the endpoint queried never did.

**Scoring goes through the same path that writes the cache.** The scoring half of
`RecomputeUserMatchesUseCase.execute` is extracted into a public `scoreJobs(userId, near)`
that both callers use, so a scout score and a `/recommendations` score for the same job
cannot drift. `execute` was refactored to consume it; the characterisation test that pins
its exact payloads still passes unchanged, which is the evidence the refactor was
behaviour-preserving.

**Why (a) and not (b), stated in the code.** At current corpus size a scout call scores a
few hundred rows: one pgvector query plus arithmetic, no LLM. Fan-out on ingest moves that
cost off the request path and amortises it across users — the right answer once the corpus
or user base makes per-request scoring expensive — but it needs a queue, a per-user job,
and a way not to stampede on a large import. `SCOUT_CANDIDATE_CAP = 500` is the tripwire:
**if it starts truncating real results, live scoring has been outgrown.**

Also handled:

- **Dismissed jobs are excluded.** The cache read filtered them implicitly (via #6);
  scoring live has to do it explicitly, and does — before scoring, so no number is
  computed for a job nobody will see.
- **A missing `since` no longer means "everything ever".** It defaults to a 7-day window.
  The extension always sends its watermark; this covers a first run or a client that lost
  it.
- **No embedding, no score.** `cosineForJobs` drops jobs without embeddings and returns
  nothing when the user has no profile vector — both correctly yield "no matches" rather
  than a score computed from a missing input.

**Tests — 15 new.** 11 on `getScout` (led by *"returns a newly ingested job that has NO
recommendation row"*, which was the whole defect) and 4 on the extracted `scoreJobs`.
Mutation-verified: pointing scout back at the cache fails 7. Whole suite: 69 files, 783
tests, green.

**⚠️ Not updated:** the extension's `CONTRACTS.md` P3, which describes this endpoint. That
repo is not checked out locally. Its wording ("jobs matching the user's profile at/above
`minScore`, created since `since`") is now *accurate* rather than aspirational, but the
`since`-omitted default and the dismissal exclusion are new and should be written down
there.

---

## 8. 🟠 The privacy policy states something the code stopped doing

**The problem.** `jobfit-extension/PRIVACY.md` (last updated 22 July 2026) says, in bold:

> **The job description / posting body is never read, stored, or transmitted.**

Since then the extension shipped two features that read and transmit exactly that:

- **`POST /match-report`** sends up to 8,000 characters of the posting body (`CONTRACTS.md`
  P4; `PROGRESS.md` §5 calls it *"the one route that receives page content"*).
- **`POST /saved-jobs/external`** sends the description as a saved field (`CONTRACTS.md` P4 —
  *"Second route that receives posting text"*).
- `MULTI_SITE_PLAN.md` records measured extraction of **2,135 chars** from Khmer24 and
  **5,207** from BongThom.

The same false sentence is repeated in the Chrome Web Store copy in `STORE_LISTING.md`
(*"Only the job's ID, the company name and the job title are sent to the JobFit API — never the
posting text"*).

A second, independent defect in the same file: its permissions table lists host access to
**`www.linkedin.com` only**, and states *"The extension requests **no access to any other
website**."* `MULTI_SITE_PLAN.md` added **Khmer24, Indeed, BongThom and JobNet** to
`content_scripts.matches`. A reviewer diffing the manifest against the policy sees four
undeclared hosts.

**Why it matters.** This is the only artefact in the project with legal weight, it must be
publicly hosted before submission, and it is wrong in the direction that gets an extension
**rejected or pulled**: under-declared data collection and under-declared host permissions.

Worth noting how this happened — the internal docs are *scrupulously* honest about it
(`PROGRESS.md` §5 explicitly says *"for a published Web Store build this is the item to
re-review"*). The engineering discipline was there. The user-facing document just never
received it.

**A possible solution.** Rewrite the "What the extension reads" table to state the truth,
which is genuinely defensible and worth stating precisely: *the posting body is read **only
when you click Full Report or Save Job**, sent once, never stored as a listing, and only the
derived report is kept on your own account.* That is a **better** privacy story than a false
absolute. Add the four hosts. Re-date the file. Fix the Store copy in the same commit, and add
"PRIVACY.md matches the manifest" to the pre-submission checklist.

**The question you'll be asked.**
> *"Your privacy policy says you never transmit the job description. Your match report is built
> from the job description. Which is true?"* — a question with no good answer if you have not
> already noticed it.

---

## 9. 🟠 An employer cannot see the candidate's résumé

**The problem.** `grep -rn "resume" src/modules/employer` returns **nothing**.
`EmployerApplicationResponseDto` exposes the job, the status, employer notes, a
`candidate: { id, name, email }` projection, and the AI screening summary — no résumé, no
download URL, no profile, no cover letter. The `Application` row carries `coverLetter` and
`resumeId`; neither reaches the employer.

**Why it matters.** The employer's entire job is to read the CV. The product currently hands
them a name, an email, and a number that the DTO's own documentation describes as having
*"varied by only 4 points"* across candidates spanning a senior engineer to a graphic designer.

That is an AI screening layer with the **human review step removed** — the exact failure mode
the project is otherwise careful to avoid (`INTERNAL_EXTERNAL_JOBS_PLAN.md`: a coarse triage is
within what a small model can do, *"a hiring decision is not"*). Here the model's summary is
not advisory; it is the **only** information available.

It is also a *silent* missing requirement: it appears nowhere in the 33-requirement scorecard,
because the SRS was written entirely from the job-seeker's side (see #18).

**A possible solution.** Add a signed, expiring résumé-download URL plus the cover letter to
the employer application detail, scoped so an employer can only reach a résumé attached to an
application **to their own job**. This depends on #5 — you must first know *which* résumé the
application is for.

**The question you'll be asked.**
> *"I'm an employer. Ten people applied. How do I read their CVs?"*

---

## 10. 🟠 A paywall around features nobody can pay for, with an unlocked side door

**The problem.** Three facts that cannot all be intended:

1. `assertPremium` blocks cover letters and interview coaching unless `subscriptionTier` is
   PREMIUM/PROFESSIONAL
   ([generation.controller.ts:126-136](../src/modules/generation/generation.controller.ts#L126-L136)).
2. **Nothing writes `subscriptionTier` except the unguarded endpoint in #2.** There is no
   `Subscription` or `Payment` model in `schema.prisma` (the ER diagram documents both — see
   #17). `PaymentService` is `class PaymentService {}`; `StripeAdapter.createSubscription`
   returns `''`; `PaymentController` has no routes. **There is no legitimate way to become
   Premium.**
3. The same generation service is exposed **ungated** at `POST /generate/cover-letter` and
   `POST /generate/interview-prep` for the extension
   ([generation.controller.ts:79-122](../src/modules/generation/generation.controller.ts#L79-L122)).

So the paid features are (a) unreachable by paying, (b) reachable free via one `PATCH`, and
(c) reachable free via the extension routes from any HTTP client. `PROGRESS.md` §2 Phase C2
records (c) honestly as an *"accepted caveat: the ungated routes are a paywall bypass if hit
directly"* — but that trade-off assumed a functioning paywall on the other side, which (a) and
(b) mean does not exist.

**Why it matters.** "Tier-gated" appears throughout the AI plan as a design property. It is
not one — it is an unenforced convention with three independent holes. An interviewer who
finds one hole will look for the others.

**A possible solution.** Decide which product you are building and say so in one place. If
tiers are aspirational, delete `assertPremium` and the tier language from the docs rather than
leave a gate that only inconveniences honest clients. If tiers are real, #2 must be fixed
first, the extension routes need the same entitlement check the web routes have, and the
payment module has to exist. Either is defensible; the current state is the one that is not.

**The question you'll be asked.**
> *"Cover letters are Premium. Show me a user who is Premium, and show me how they got there."*

---

## 11. 🟠 Nothing rate-limits the GPU

**The problem.** `ThrottlerModule` is registered, but `config/throttler.config.ts` defines
named limiters for **auth routes only** (login, register, verify, resend, password reset,
refresh, logout), and `@RateLimit` is opt-in per route. No AI route uses it:
`POST /match-report`, `POST /generate/cover-letter`, `POST /generate/interview-prep`,
`GET /recommendations/by-job` — all authenticated, all unlimited, all reaching an LLM or an
embedding model, several of them ungated (#10).

`POST /match-report` is the worst case: it runs requirement extraction over up to 8,000
characters of caller-supplied text, per call, with no cap and no dedupe.

**Why it matters.** The RAG plan treats cost and latency as a Phase-D concern ("cost per 1,000
matches"). But the cost *ceiling* is an availability property, and it is unbounded today: one
authenticated user in a `while` loop can saturate the GPU box for everyone, or run up the bill
on a paid inference provider (see `jobfits-ai-service/docs/DEEPSEEK_PROVIDER_PLAN.md`). The
heuristic fallbacks mean it degrades rather than dies — so you would find out from the
invoice, not from an alert.

**A possible solution.** A per-user limiter on every route that reaches the AI service — a
handful per hour is generous for real use. Cache `match-report` by
`(userId, source, externalId, hash(description))`: the same posting re-opened is the common
case and should cost nothing. Count LLM calls per user in the metrics module that already
exists.

**The question you'll be asked.**
> *"What's the most money one signed-up user can cost you in an hour?"*

---

## 12. 🟠 The salary formatter invents both a currency and a scale

**The problem.**

```ts
export function formatSalaryRange(job): string {
  return `$${job.salaryMin}K – $${job.salaryMax}K`;   // shared.types.ts:84-86
}
```

`HANDOFF_2026-08-17.md` §7.4 already flags the null case (`$0K – $0K` for the 348 of 367 jobs
with no salary, marked **"Not yet done"**). Reading the function, the null case is the
*smaller* half of the bug:

- **The currency is hardcoded `$`.** The corpus is now 305 Cambodian jobs. `Profile` has a
  `salaryCurrency` column; `Job` has none, and the formatter reads neither.
- **The unit is hardcoded `K`.** A Phnom Penh job paying `500` renders as **`$500K`** — off by
  a factor of a thousand, in a product whose stated rule #4 is *"A fact you do not have must
  not look like a fact you do."* This is worse than `$0K`: `$0K` is obviously broken, `$500K`
  looks like data.

**Why it matters.** Salary is also a scored dimension (10% of the match weight) and the
best-correlating sub-score in the last calibration run (ρ 0.684). Getting it visibly wrong
undermines the number sitting next to it.

**A possible solution.** Return `null` when either bound is missing, and render nothing. Add
`salaryCurrency` and a `salaryPeriod` to `Job` and the DTO — monthly is the Cambodian norm,
annual is the TheMuse norm, and the corpus already mixes them — then format from the data.
Until the column exists, print the raw number with no unit rather than asserting `K`.

**The question you'll be asked.**
> *"Your users are in Cambodia. This job pays $500K a year?"*

---

## 13. 🟡 The percentage you *do* show has never been calibrated

**The problem.** The project rejected the LLM `fitScore` on strong evidence: Spearman ρ of
0.137 / −0.065 against 150 hand-graded pairs, BAD scoring above GREAT. The rule that came out
of it is stated everywhere: **no percentage may be shown to a user.**

But `Recommendation.score` **is** shown to the user, as a match percentage, on every job card
and in the extension badge. What has actually been measured about it:

- *Retrieval* metrics (Recall / MRR / nDCG) — which measure **ordering**, not the number.
- One `eval-score-calibration.ts` run at **n = 1 candidate** — and per `HANDOFF_2026-08-17.md`
  §6 that candidate **has no résumé**, so `experience` (25% of the weight) is a constant 40.

So the displayed percentage rests on a sample of one, with a quarter of its weight provably
inert. The standard that disqualified `fitScore` was never applied to the number that ships,
and there is no principled reason for the asymmetry.

**Why it matters.** This is the finding most likely to come from someone who has *read* your
eval work and respects it. It is not "your number is wrong" — it is "you built the machinery
to know, and pointed it at one of the two numbers."

**A possible solution.** No new code is needed: `HANDOFF_2026-08-17.md` §6 already names
re-labelling as the unblock, and `eval-score-calibration.ts` exists. What is missing is
**stating the standard** — *no user-facing number without a calibration ρ and an `n`* — and
applying it to the deterministic scorer too. In the meantime, consider showing a rank or a
coarse band (High / Medium) instead of "87%": the evidence for ordering is solid, the evidence
for magnitude is not, and the UI should claim exactly as much as the evidence supports.

**The question you'll be asked.**
> *"You showed me a beautiful negative result on the LLM's fit score, and you shipped a 0–100
> match score anyway. What's the ρ on the one you shipped?"*

---

## 14. 🟡 Deleted users can still log in — and can never come back

**The problem.** Two halves:

- `UserRepository.delete` sets `deletedAt` (soft delete)
  ([user.repository.ts:66-71](../src/modules/user/infrastructure/repositories/user.repository.ts#L66-L71)).
  `LoginHandler` checks lockout, password and `isVerified` — **never `deletedAt`**
  ([login.handler.ts:47-70](../src/modules/auth/application/commands/login.handler.ts#L47-L70)),
  and `findByEmail` does not filter it either. A deleted account keeps working.
- `User.email` is `@unique` and the row is retained, so the address is permanently occupied. A
  user who deletes their account **can never register again with that email**.

This is very likely the real story behind the lost eval labels. `HANDOFF_2026-08-17.md` §6
reports that `snowrin168@gmail.com`'s row was deleted and the email re-registered, cascading 50
labelled pairs. A *soft* delete cannot produce that outcome — the unique index would have
blocked re-registration. So the row was **hard-deleted out-of-band** (Supabase console), which
is exactly the workaround that a non-functioning soft delete plus a permanently-occupied email
forces on you.

**Why it matters.** The eval-set loss is treated in the handoff as an unexplained one-off. It
is not: it is the predictable consequence of a delete path that does not work, and it will
happen again. `MatchLabel` cascades on user delete — hand-labelled ground truth, the most
expensive artefact in the project, held by a foreign key with `onDelete: Cascade`.

**A possible solution.** Filter `deletedAt: null` in `findByEmail` / `findById` on the auth
path. On soft delete, release the address (`email = "deleted+<id>@…"`, keep the original in a
retained column) so re-registration works and out-of-band hard deletes stop being necessary.
Separately: `MatchLabel` is research data, not user data — either `onDelete: SetNull` with a
nullable `userId`, or export the label set to a file no `DELETE` can reach.

**The question you'll be asked.**
> *"A user asks you to delete their account. Walk me through what happens — then tell me what
> happens when they sign up again next month."*

---

## 15. 🟡 Two match tables

**The problem.** `MatchScore` is keyed `@@unique([jobId, jobSeekerProfileId])` with `score` +
`breakdown`. `Recommendation` is keyed `@@unique([userId, jobId])` with `score` + `breakdown` +
`reasonExplanation`. Same data, two identity models — one hanging off `JobSeekerProfile`, one
off `User`. Only `Recommendation` is written by the matching pipeline.

**Why it matters.** A reader cannot tell which is authoritative, and the candidate identity is
unresolved across the schema more broadly: matching uses `profiles.embedding`, screening uses
`userId`, `MatchScore` uses `jobSeekerProfileId`, and `JobSeekerProfile` / `Profile` / `User`
all coexist. Dead schema is a live source of wrong queries.

**A possible solution.** Drop `MatchScore` if the pipeline does not write it, or put a schema
comment on it saying what it is for. Pick one candidate identity for the matching domain and
document it — `TrackedJob`'s schema comments are an excellent model for exactly this.

**The question you'll be asked.**
> *"You have `match_scores` and `recommendations`. What's the difference?"*

---

## 16. 🟡 A saved job dies with the posting; a tracked job survives it

**The problem.** `SavedJob.jobId` is `onDelete: Cascade`. `TrackedJob.jobId` is
`onDelete: SetNull` with copied title/company/url snapshot columns, and `JOB_TRACKER_PLAN.md`
§2 argues that case well — postings vanish (*"bongthom returned 404 for 9 of 43 postings during
the ingestion work"*). Every word of that argument applies to a saved job too, and `SavedJob`
has no snapshot at all: delete the job and the user's bookmark is gone without a trace.

**Why it matters.** The tracker's reasoning was never back-ported. With re-ingestion running
against boards that delist aggressively, "my saved jobs disappeared" is a matter of time.

**A possible solution.** Give `SavedJob` the same treatment — snapshot columns plus `SetNull` —
or fold saved jobs into the tracker's `SAVED` stage, which is arguably what it already is. That
would also resolve the awkward three-way split between `SavedJob`, `saved_external_jobs` and
`TrackedJob(stage=SAVED)`: three tables for one user intent.

**The question you'll be asked.**
> *"Why does a tracked job survive the posting being deleted, but a saved job doesn't?"*

---

## 17. 🟡 The ER diagram documents a database that does not exist

**The problem.** `docs/JobFits_ER_Diagram.md` describes tables with **no counterpart in
`schema.prisma`**: `salary_data`, `learning_paths`, `learning_progress`, `referrals`,
`interview_tips`, `interview_questions`, `notification_preferences`, `user_settings`, `faqs`,
`knowledge_base`, `help_center`, `job_listings`, `job_forms`, `job_form_responses`,
`subscriptions`, `payments`. It also gives `users.role` as `USER|PREMIUM|PROFESSIONAL|ADMIN`;
the real enum is `JOB_SEEKER|EMPLOYER|ADMIN` with tier as a **separate** `SubscriptionTier`
column — i.e. the diagram conflates role and tier, which is exactly the distinction the auth
and paywall model turns on (#10).

This is not merely stale. `jobfit-extension/docs/CONTRACTS.md` specifies `GET /salary`
returning *"from `salary_data` aggregate"* and `GET /learning/gap` returning a `learningPath`
object — **contracts written against tables that do not exist.** Both routes were built and
both had to silently degrade (`PROGRESS.md`: *"`learningPath: null` (no LearningPath table)"*,
*"aggregates Job.minSalary/maxSalary; no salary table"*). The extension's **mock** still
returns the rich shape, so the mock is more capable than the real endpoint — the direction that
turns a working demo into an empty screen at the moment it matters.

**Why it matters.** Two downstream repos treat this file as the data model.

**A possible solution.** Regenerate the ER diagram from `schema.prisma` (which is the source of
truth and says so elsewhere), and mark aspirational tables clearly as *planned*. Then re-check
each contract against it, and cut the mocks down to what the real endpoint can return.

**The question you'll be asked.**
> *"Show me the salary table your salary endpoint reads."*

---

## 18. 🟡 `docs/SRS.md` is empty

**The problem.** `jobfit-frontend/docs/SRS.md` is **0 bytes**.
`docs/Missing and Not Start feature/01-scorecard.md` grades "All 33 Functional Requirements" —
ids like `AUTH-001`, `RESUME-004`, `NOTIF-002` — against *"the SRS acceptance criteria"*. The
document defining those criteria does not exist in any of the four repos.

**Why it matters.** The scorecard is one of the strongest artefacts here; it is honest about 10
"not started" items. But a requirement id that resolves to nothing cannot be audited, and "the
SRS says so" stops being a usable answer. It is also how the gap in #9 survives: no requirement
was ever written for the employer's side, so nothing marks it missing.

**A possible solution.** Reconstruct the SRS from the scorecard — it already carries the ids
and one-line statements. A couple of hours turns it into a real requirements document, and the
act of writing it forces the employer-side requirements to exist.

**The question you'll be asked.**
> *"What are your requirements? Not the features — the requirements."*

---

## 19. 🟡 Khmer postings get a confident number and a silently wrong skills table

**The problem.** `MULTI_SITE_PLAN.md` §5 documents this precisely and honestly: every text
matcher (`keyword-scan.ts`, `skill-gap.service.ts`, the AI service's groundedness check) splits
on Latin character classes, and Khmer is written without spaces between words, so word-boundary
matching cannot work at all. What *does* work is bge-m3, measured at cosine 0.82 between a
Khmer and an English title for the same role vs 0.45 for different roles.

The gap is that this lives as a *known limit in a doc* and is **not surfaced anywhere in the
product**. On a Khmer posting the match report still renders a skills table, still counts
`matchedCount` / `missingCount`, still shows ATS keyword checks — all computed from whatever
Latin brand names happened to appear. The user sees "you're missing 11 skills" and it means
nothing.

This directly undercuts the project's most interesting claim. The corpus went to 83% Cambodian
specifically to serve Cambodian users; the analysis layer only works in English.

**Why it matters.** Rule #4 again: *"A fact you do not have must not look like a fact you do."*
An empty missing-list on a Khmer posting is exactly the *"never rendered as perfect fit"* case
that `INTERNAL_EXTERNAL_JOBS_PLAN.md` §6 was careful to distinguish for English — the same
distinction was never extended to language.

**A possible solution.** Detect the script (a Khmer Unicode-range ratio over the description is
enough — no ICU needed for *detection*) and set `skills.available: false` with a reason of
`LANGUAGE_UNSUPPORTED`, which the match-report payload already models as distinct from "no
requirements". Keep showing the match score, which is evidenced. Say plainly: *"skills analysis
isn't available for Khmer postings yet."* That is a one-day change that converts a silent wrong
answer into an honest limitation — and it is a far better interview story than the ICU
segmentation project.

**The question you'll be asked.**
> *"Most of your jobs are Cambodian. Open a Khmer posting and tell me what the skills table is
> computed from."*

---

## The pattern behind most of these

Nearly every finding above has the same shape: **a write happens and the derived data is never
told.**

- Re-embed without invalidating recommendations (#6)
- Ingest without fanning out to scout (#7)
- Store `resumeId` without reading it (#5)
- Ship a feature without updating the privacy policy (#8)
- Change the schema without regenerating the ER diagram (#17)
- Build routes on one branch and clients against another (#4)

If there is one architectural question to be ready for, it is that one:

> *"Your system has a lot of derived state — embeddings, recommendations, screening snapshots,
> reports. What is your invalidation strategy?"*

The honest current answer is *"lazy, on empty, plus scripts run by hand."* Knowing that, and
being able to say what you would build instead — event-driven invalidation on the candidate
side, a fan-out job on the corpus side, freshness stamps on anything cached and shown — turns
the weakest part of the system into one of the better answers you give.

---

## What this review did NOT find (worth saying out loud)

The reasoning quality across these docs is well above the norm, and several things a reviewer
expects to be wrong are right, deliberately, with evidence:

- **Negative results are kept, dated and defended** — the `fitScore` ρ, the BM25 AND/OR A/B,
  the v4-not-v5 prompt default. *Best-measured, not newest* is a real engineering standard, and
  most people do not hold it.
- **`TrackedJob` vs `Application`** is a genuinely good domain call, and the schema comments
  explain **why**, which is rare.
- **`sourceType` is enforced at the endpoint, not the button** — the plan explicitly says the UI
  hiding a button is not enforcement.
- **`semantic: false ⇒ overall: null`** instead of a neutral 0.5 that turned out to be the remap
  ceiling and scored 100 — a subtle bug found by measurement and fixed in the honest direction.
- **The eval harness caught an untrustworthy model before it shipped.** That is the strongest
  thing in the portfolio and should be the first thing you talk about.

The findings above are what is left after all of that — and most of them are freshness,
authorization, and documents that fell behind the code, not reasoning errors.
