# Phase E — clearing the open-issues list from HANDOFF_2026-08-09

> Working document. Started 2026-08-09. Every section below is one item from §6 of
> `docs/HANDOFF_2026-08-09.md`, in the order it is being worked, with what was actually
> found and what was actually changed. If a session ends mid-list, the unchecked boxes
> are the remaining work.

## Rules carried in from the handoff

1. Every claim needs a number, and the number needs its `n` and caveats.
2. When the measurement says no, that is the deliverable.
3. A feature is not finished when it is built, it is finished when someone has used it.

## Things this phase must NOT do

- **Do not re-open skill normalisation** (§5.1). Semantic similarity was measured and
  rejected: the software candidate outscored the mechatronics candidate on an automotive
  job (0.629 vs 0.482).
- **Do not change the `/learning` matcher** (§5.2). `themeWordsOf` and the `management`
  signal word are deliberate. Item E5 below changes the matcher's *input*, never its rules.
- **Do not touch LLM `fitScore`** (ρ 0.137 / −0.065, unusable).

---

## Order of work

Cheapest-first is wrong here; this is ordered by *how many future bugs each one closes*.

| # | Handoff § | Item | State |
|---|---|---|---|
| E1 | 6.3 | Stale offers on closed applications | ☐ |
| E2 | 6.4 | `useOffers` fetches outside React Query | ☐ |
| E3 | 6.6 | `job.mappers.ts` fabricates type/level/industry | ☐ |
| E4 | 6.2 | No notification when an offer message arrives | ☐ |
| E5 | 6.1 | Résumé extraction produces generic single-word skills | ☐ |
| E6 | 6.5 | ESLint is not set up at all | ☐ |
| E7 | 6.7 | Phase D (GPU) — hardware-blocked, not workable here | ☐ |

---

## E1 — Stale offers on closed applications

**Symptom.** `soviseth869@gmail.com` has four offers reading `EXTENDED`/`NEGOTIATING` on
applications that are already `ACCEPTED` or `ARCHIVED`. They show in the candidate's
"Active Offers" list, and one already caused a live bug (`51636a1`).

**The choice.** Close the four rows, or have the list filter on the *application's* status.
The handoff says the second fixes the class — a data fix leaves the next divergence to be
found by a user. Doing the filter.

**What was actually found — it was bigger than the list.** `listMyOffers` was not the only
place that trusted the offer's own status. `assertDecidable` did too, so **accept, decline
and post-a-message all waved a stranded offer through** and failed deep in the transition
service with `Invalid status transition: ACCEPTED -> WITHDRAWN` — a message about the
mechanism, not the reason. `accept` had already been patched to filter its auto-withdraw
sweep (`51636a1`), which fixed the symptom for one caller and left the other three.

**The rule, stated once.** An offer is live only if the application behind it can still
reach `ACCEPTED`. That is now `ACCEPTABLE_FROM`, derived from `TRANSITIONS` the same way
`WITHDRAWABLE_FROM` is, so it cannot drift from the lifecycle.

**Why lapsed rather than filtered.** The candidate *did* receive the offer. Dropping the row
from the response would rewrite their history to tidy up a display problem. The DTO carries
`applicationStatus` and a derived `lapsed`; the row survives, and the UI stops presenting a
decision that cannot be made.

- [x] Findings — 4 call sites trusted offer status alone; 1 had been patched, 3 had not
- [x] Change — `ACCEPTABLE_FROM`; `assertDecidable` → `assertActionable`; `lapsed` on the DTO
- [x] Change (frontend) — `isActiveOffer`/`isPastOffer`; a third past state on the card
- [x] Test — 9 new specs, `jest src/modules/offer` 27/27

---

## E2 — `useOffers` outside React Query

**Symptom.** The only hook in the frontend that fetches with a bare `useEffect` + promise.
It produced a crash screen on a lapsed session (fixed in `54aa653` by adding the missing
`.catch`) — a bug class that cannot occur inside React Query.

Converted with the public shape unchanged, so `offers/page.tsx` did not move. One query
(`qk.offers.list()`) and three mutations; every mutation invalidates on `onSettled` rather
than `onSuccess`, because a refusal usually means the client is stale and needs the refetch
at least as much as a success does. 4xx no longer retries.

- [x] Findings
- [x] Change
- [x] Test — `tsc` clean (the frontend has no test suite)

---

## E3 — `job.mappers.ts` fabricated fields

**Symptom.** Every job card claims "Full-time · Mid-level" and every job is filed under
"Technology", because the mapper hardcodes those three. Carried over from 08-07.

**Root cause.** `Job` has no `employmentType`, no `experienceLevel` and no industry the API
exposes — so there was nothing truthful to map. The enums `EmploymentType` and `JobLevel`
already existed in `schema.prisma` and were used by no model.

**The columns exist now, and every existing row is NULL.** Backfilling a default would
recreate the bug one layer deeper and much harder to see: a fabricated value in the
database is indistinguishable from an employer's own answer. "The employer has not said"
is the truth about all 55 existing postings.

**Making the frontend fields optional is what did the work.** `type`, `level` and
`industry` were required on the `Job` view type, which is *why* the mapper defaulted them.
Turning them optional produced 17 type errors — every consumer that had been silently
handed a plausible lie, now forced to decide what "not known" renders as. All three
render as nothing; facet sections hide when no job in the set states the field, rather
than showing checkboxes that all read 0.

`industry` now comes off the company profile, which the backend already resolves to a
name — and only on the DETAIL response, so it is genuinely absent in list results.

The employer's create-job form grew both fields, defaulting to "Not specified". A column
no one can fill is not a fix.

- [x] Findings
- [x] Change (backend) — 2 nullable columns, migration, entity/repo/mapper/DTOs/use-cases
- [x] Change (frontend) — optional types, honest mapper, 17 call sites, employer form
- [x] Test — `job.mapper.spec.ts` 3/3; backend suite 338/338; both `tsc` clean

---

## E4 — No notification when an offer message arrives

**Symptom.** The employer only sees the unread badge if they happen to open the board.

**Root cause.** The whole notification module is stubs — `NotificationService.sendEmail`
and `.createInAppNotification` are empty bodies, all three listeners are `TODO`, and there
is no `Notification` model in `schema.prisma`. There is nowhere for a notification to go.
The frontend already had a bell, a feed and a badge, all reading five invented items from
a mock, with read state in the React Query cache that reset on reload.

**Two things found that the handoff did not know:**

1. **`ApplicationStatusChangedEvent` is published from exactly one place** —
   `ApplicationService.updateStatus`, the candidate changing their OWN application, which
   is the single case where the candidate needs no telling. Every employer-driven move
   (screening, interview, offer, rejection) reaches the chokepoint from a different caller
   and published **nothing at all**. So `ApplicationStatusChangedListener` would not have
   fired for any status change worth notifying about even if its body were written.
2. **An `@OnEvent` listener could not be made correct here anyway.** `emitAsync` fires
   while the transaction is still open, so a listener can notify someone of a hiring
   decision that then rolls back.

**So notifications are written by the chokepoint, on the caller's transaction**, beside
the two audit rows it already writes — a third record of the same event, exactly as true
as the change it describes. The stub listener is deleted rather than filled in, with the
reasoning recorded in `notification.module.ts`.

**Who gets told: the counterparty, never the actor.** Which side that is follows from
`actor`, which the chokepoint already demands rather than infers — the same parameter that
made the entitlement rules work. Telling someone what they just did is noise that trains
people to ignore the bell.

Offer **messages** are not status transitions after the first, so `OfferService` notifies
for those itself — which is the reported bug: message two onward moved nothing, so nothing
told the employer.

- [x] Findings
- [x] Change — `Notification` model + migration, real service, 4 endpoints, 2 trigger sites
- [x] Change (frontend) — mock feed deleted, real endpoints, persisted read state,
      clicking a notification navigates to its `link`
- [x] Test — 13 new specs; backend suite 350/350; both `tsc` clean

---

## E5 — Résumé extraction produces generic single-word skills

**Symptom.** The operator's CV parses to *Programming, Communication, Technical Skills,
Hardware + Software*. Those match broad requirement text and evidence almost nothing, so
every gap list is **shorter than the truth** — two of three "covered" items on the measured
CV were weak matches (§5.3).

**Two halves, and they are separate fixes:**

- **(a) The parse.** `resume_parse_v4.txt` says only *"skills is a flat list of individual
  skill names (e.g. TypeScript, AWS)"*. Nothing forbids a category label, and a CV whose
  own section heading reads "Technical Skills" invites the model to echo it back.
- **(b) The read.** `SkillGapService.latestParsedResume` reads `parsedData.skills` and
  nothing else, discarding project technologies, experience titles and field of study —
  concrete terms already sitting in the database.

This changes what the matcher is *given*, not how it matches. §5.2 stands.

### What the measurement actually said — the interesting part

The prompt fix was tried first. `resume_parse_v5.txt` adds explicit rules: no section
headings, no bare categories, **one skill per entry, split every line**, with worked
examples. Measured n=8 runs each against `qwen3:0.6b`, on a synthetic CV with a labelled
skills section (the operator's real CV is not in the repo, so this measures only the
defect, not the 7-field accuracy axis that chose v4):

| | unusable skill entries | runs with at least one |
|---|---|---|
| `v4` | 14 of 43 | 6 of 8 |
| `v5` | 12 of 45 | 4 of 8 |

**A real improvement, and nowhere near a fix — 6/8 vs 4/8 at n=8 is inside the noise.**

The run output showed the *dominant* defect was not category labels at all (v4 produced
those in only 1 of 8 runs). It was this:

```
'Languages: C++, Python, TypeScript'   ← returned as ONE skill
'Hardware: Arduino, servo motor, PID control'
```

Three real skills glued into a string no employer writes, which the matcher's whole-word
test cannot see inside. **v5 states the rule as plainly as it can be stated and still glues
them together half the time.**

**So the conclusion is that the prompt is the wrong layer.** Splitting on a comma is a
string operation with a guaranteed outcome; asking a 0.6b model to do it is not.
`splitSkillEntry` does it in code, applied at **read** time as well as write time so the
parses already in the database are repaired rather than left behind a fix that only helps
future uploads. The v5 rules stay — they do no harm and should help a larger model — but
**the default stays `v4`**, because "best-measured, not newest" is the rule and v5 has not
been measured on the axis that chose v4.

Writing the splitter's tests found two over-splitting bugs before they shipped: a
three-word bound on the label (`"Led a team of six: delivered…"` was losing its first
half) and the decision not to split on `and` at all (`"Health and Safety"` is one skill,
and nothing distinguishes it from `"Docker and Kubernetes"` — so the safe direction is to
under-credit).

- [x] Findings — the reported defect was the *second* most common one
- [x] Change (AI service) — `resume_parse_v5.txt`, default deliberately unchanged
- [x] Change (backend) — `splitSkillEntry` + widened evidence, read and write paths
- [x] Test — 24 new specs; backend 380/380; AI service 48/48; both `tsc` clean

---

## E6 — ESLint

**Symptom.** No config, not a dependency, in either repo. Phase 4 of the lifecycle plan
shipped its guard as a jest spec instead, deliberately.

Adopting ESLint is a real decision, not a side effect — the risk is a hundred pre-existing
violations turning into noise nobody reads. Adopted with rules that are *already true* of
this codebase, so the baseline is green on day one and any red is a regression in the
change in front of you.

**Baselines, and what happened to them:**

| | on adoption | after |
|---|---|---|
| backend | 10 errors, 8 files | **0** — every one fixed, none ruled away |
| frontend | 49 errors, 10 warnings | **0 errors**, 10 warnings kept ON |

The frontend's 10 warnings are left visible on purpose: 9 are `<img>` vs `next/image`,
which is a real change with real trade-offs and not a lint cleanup, and 1 is a genuine
`exhaustive-deps` worth fixing properly. Silencing them would mean the count can never
be a signal.

**It found a real bug on day one.** `NotificationBell` was imported in `topnav.tsx` and
never rendered — so the entire notification feature, including everything built in E4 this
session, was unreachable from the app. Nobody found that by using the page; `no-unused-vars`
found it in the first run. It also caught a missing `useMemo` dependency in the `useOffers`
rewrite from E2, correct only by coincidence.

**Deliberately NOT added: an ESLint rule for the status chokepoint.** The comment at the
top of `application-transition.service.ts` claimed one existed; it never did. An AST
selector cannot tell a legitimate `application.update` (the per-actor archive columns)
from a status write, so the rule would either miss bypasses or cry wolf on correct code.
`status-write-guard.spec.ts` already does this properly and was proven by planting a real
bypass. The stale comment is corrected rather than the claim being made true.

- [x] Findings
- [x] Change — eslint 8 + typescript-eslint (backend), `next/core-web-vitals` (frontend)
- [x] Test — `npm run lint` exits 0 in both repos; backend 380/380; both `tsc` clean

---

## E7 — Phase D (GPU)

**Confirmed still blocked, not skipped.** `docs/RAG_PHASE_D_HANDOFF.md` §2 and §11: the
next step is running the existing generation harness against full `qwen3` unchanged, and
full `qwen3` is unusable on this laptop — it needs the GPU box. Local work is pinned to
`qwen3:0.6b`. Nothing in this phase can unblock that, and there is no version of it that
can be done here honestly; running the harness against `qwen3:0.6b` and reporting the
number as Phase D's would be exactly the rounding-up the project forbids.

`jobfits-ai-service/runpod-worker/` is the staging ground for it when hardware exists.

- [x] Confirmed blocked (checked, not assumed)

---

## Verification log

| Item | Claim | Number | n | Caveat |
|---|---|---|---|---|
| E1 | Call sites deciding "is this offer actionable?" from the offer's status alone | 4 → 0 | 4 sites | 1 had been patched (`51636a1`), 3 had not |
| E1 | Backend specs on the stranded-offer class | 9 new, 27/27 pass | — | Unit only — see the caveat below |
| E3 | Job postings asserting an employment type nobody set | 55 → 0 | 55 rows | All 55 stay NULL; the API omits the field |
| E3 | Frontend call sites silently handed a fabricated value | 17 | — | Surfaced by making the type optional |
| E4 | Publishers of `ApplicationStatusChangedEvent` | 1 | — | And it is the one case needing no notification |
| E5 | Unusable skill entries, `resume_parse_v4` | 14 of 43 · 6 of 8 runs | n=8 | Synthetic CV, `qwen3:0.6b` |
| E5 | Unusable skill entries, `resume_parse_v5` | 12 of 45 · 4 of 8 runs | n=8 | **Inside the noise. Prompt is the wrong layer.** |
| E6 | ESLint baseline, backend | 10 errors → 0 | 8 files | All fixed, none ruled away |
| E6 | ESLint baseline, frontend | 49 errors → 0 | — | 10 warnings kept visible on purpose |
| E6 | Real bugs found by ESLint on day one | 2 | — | Unrendered `NotificationBell`; a `useMemo` dep |
| all | Backend suite | 326 → 380 | — | 54 new specs |

### Live checks against the running app (2026-08-10)

Booted `dist/main`, logged in as `strong@seed.jobfits.test`:

- `GET /notifications` → `[]`, `GET /notifications/unread-count` → `{"unread":0}`. Both
  routes mapped and answering; the feed is genuinely empty for this user.
- `GET /jobs` → all three postings **omit** `employmentType` and `experienceLevel`
  entirely, rather than reporting a default. Including the teaching one.

**E4 confirmed end to end — a real notification, from a real stage change.** As
`employer@seed.jobfits.test`, moved `soviseth869@gmail.com`'s *Primary School Mathematics
Teacher* application `SCREENING → INTERVIEW`. The row that appeared:

```
to: soviseth869@gmail.com
[APPLICATION] You have moved to interview
    link=/applications/62d9cd80-…  read=false
```

Addressed to the **counterparty**, not the employer who made the move. Unread. Deep link
resolves. `notifications in database: 1` — it was 0 before the transition, so nothing else
wrote it. This is the one thing the previous handoff's rule 3 demanded and it now holds.

The fallback body read `"… — now interview."` — grammatically wrong, and only visible by
looking at the row. Fixed to name the job instead, since the title already says what
happened. **Third defect this session found by looking at output rather than code.**

### ⚠️ E1 could NOT be confirmed against live data, and that matters

§6.3 of the 08-09 handoff describes four offers reading `EXTENDED`/`NEGOTIATING` on
applications already `ACCEPTED`/`ARCHIVED`, on `soviseth869@gmail.com`. **Those rows no
longer exist.** Queried directly: that account has **0 offer rows**, and the entire
database holds **2 offers**, of which **0 are stranded**.

So the `lapsed` behaviour is pinned by 9 unit specs and has **not** been seen working on
the data that motivated it. The fix is still the right one — the handoff itself argued the
list-filtering approach because "the second fixes the class" — but nobody should record
this as verified end-to-end. To see it, strand an offer deliberately: set an application to
`ACCEPTED` while its `Offer` row still reads `EXTENDED`, then open `/offers`.
