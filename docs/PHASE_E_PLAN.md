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
exposes — so there is nothing truthful to map. The enums `EmploymentType` and `JobLevel`
already exist in `schema.prisma` and are used by nothing.

- [ ] Findings
- [ ] Change
- [ ] Test

---

## E4 — No notification when an offer message arrives

**Symptom.** The employer only sees the unread badge if they happen to open the board.

**Root cause.** The whole notification module is stubs — `NotificationService.sendEmail`
and `.createInAppNotification` are empty bodies, all three listeners are `TODO`, and there
is no `Notification` model in `schema.prisma`. There is nowhere for a notification to go.

- [ ] Findings
- [ ] Change
- [ ] Test

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

- [ ] Findings
- [ ] Change
- [ ] Test

---

## E6 — ESLint

**Symptom.** No config, not a dependency, in either repo. Phase 4 of the lifecycle plan
shipped its guard as a jest spec instead, deliberately.

Adopting ESLint is a real decision, not a side effect — the risk is a hundred pre-existing
violations turning into noise nobody reads. Adopt with rules that are *already true* of
this codebase, so the baseline is green on day one.

- [ ] Findings
- [ ] Change
- [ ] Test

---

## E7 — Phase D (GPU)

Hardware-blocked. See `docs/RAG_PHASE_D_HANDOFF.md`. Nothing in this phase can unblock it;
recorded here so the list is complete rather than silently shortened.

---

## Verification log

Numbers go here as they are measured, with `n`.

| Item | Claim | Number | n | Caveat |
|---|---|---|---|---|
| — | — | — | — | — |
