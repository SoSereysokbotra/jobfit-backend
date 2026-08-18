# Job Tracker — backend

> A drag-and-drop board for jobs the user is chasing **on other sites**. Backend only;
> the frontend is a separate piece of work.
> Status: **built and verified live.**

---

## 1. Why this is not the application pipeline

The obvious implementation is to reuse `Application` and `ApplicationStatus`. It is wrong,
for two independent reasons.

**An Application records what an EMPLOYER decided.** The whole lifecycle work exists to
enforce that: `EMPLOYER_SETTABLE_STATUSES` is SCREENING/INTERVIEW/OFFER/REJECTED, and
`ApplicationTransitionService` **refuses** a candidate asserting any of them. A
drag-and-drop board is the exact opposite — the user moves their own card, and the stage
means *"this is where I think I am"*, not *"this is what the employer recorded"*. Wiring
the board to `Application.status` would either refuse every drag or let a candidate write
into an employer's pipeline board. That is precisely the mistake `ARCHIVED` was, before it
became a per-actor column.

**These jobs cannot have an Application at all.** The server refuses an in-app application
to an `EXTERNAL` posting, because it would go nowhere — no employer exists here to receive
it. The tracker is for exactly those jobs: applied to on bongthom, jobnet, LinkedIn, or by
email.

So: a separate `tracked_jobs` table, its own `TrackedJobStage` enum, and the user owns the
stage outright. **Any stage may follow any other, including backwards** — moving a card
back is a correction to one's own notes, not an invalid transition.

## 2. The snapshot is the point

`title` / `companyName` / `url` / `location` are **copied onto the card**, not read through
`jobId`. A tracked card must survive:

- the posting being taken down upstream (bongthom returned 404 for 9 of 43 postings during
  the ingestion work — these things vanish),
- the posting never having been in our database (saved from the extension, typed by hand),
- the posting being re-ingested and changing.

`jobId` is a convenience link when we happen to hold the posting, with `ON DELETE SET NULL`
so losing the job does not lose the card.

When `jobId` IS supplied, title and company are read **from the job**, not from the request
— a caller should not be able to file one of our own postings under the wrong name.

## 3. Positions and the drag

`position` is an integer per `(user, stage)`. A move **renumbers the affected columns from
the resulting order**, in one transaction.

Renumbering rather than shifting neighbours: positions have to stay dense and unique or the
board's order goes arbitrary the first time two cards collide, and a shift-the-neighbours
approach needs several conditional updates and still races. One clear write per card lands
the board in exactly the state the user just dragged.

One transaction because a half-applied move leaves a card in two columns or none — which
the user experiences as the board eating a job.

`position` in the request is the index in the **destination** column, from 0; omitted means
append. An out-of-range index is **clamped, not rejected** — a stale client index must not
fail a drag the user already saw succeed.

`appliedAt` is stamped the **first** time a card reaches APPLIED and never overwritten:
dragging out and back must not rewrite the date they actually applied. It is deliberately
not derived from `stage`, because a card can go straight to INTERVIEW for a job applied to
weeks ago outside the product.

## 4. Endpoints

All under `/api/v1/tracker`, all scoped to the caller **in the WHERE clause** rather than
fetch-then-check, so another user's row is unreachable rather than merely refused.

| | |
|---|---|
| `GET /tracker` | Board, grouped by stage. Every stage present even when empty, so the client renders all five columns without carrying its own copy of the vocabulary. |
| `GET /tracker/archived` | Archived cards, most recent first. |
| `POST /tracker` | Add. `jobId` for a posting we hold, or `title` + `companyName` for anything else. |
| `PATCH /tracker/:id/move` | One drag: `{ stage, position? }`. |
| `PATCH /tracker/:id` | Edit details. **Stage is not editable here** — moving is its own endpoint, so a drag and a note-edit cannot be confused. |
| `POST /tracker/:id/archive` | Hide without deleting. |
| `POST /tracker/:id/restore` | Back onto the board, at the top of its column. |
| `DELETE /tracker/:id` | Remove permanently. |

## 5. Verified

- **26 unit specs**, covering insertion index, append, clamping, source-column renumbering,
  single-transaction, backwards moves, `appliedAt` semantics, and ownership scoping.
- Full suite **638/638**, `tsc` clean, lint clean.
- **Live against the database**: added a card from an ingested bongthom posting (title and
  company copied from the job), added a hand-entered card (`jobId: null`), dragged to
  APPLIED (stage moved, `appliedAt` stamped), read the board back grouped with all five
  columns. Test cards deleted afterwards.

## 6. Found on the way — two hazards, unrelated to this feature

**A `prisma db pull` had dropped the vector dimension.** `schema.prisma` said
`Unsupported("vector")` while the database has `vector(1024)` on both `jobs.embedding` and
`profiles.embedding`. The next `prisma migrate dev` would have seen a type difference and
generated an ALTER — **destroying all 377 embeddings**. Restored to
`Unsupported("vector(1024)")`.

**Migration drift.** `20260813080000_add_saved_external_job` was recorded as applied in
`_prisma_migrations` but its folder was missing, so a fresh clone could not rebuild the
database. The folder is reconstructed from the live table definition (read out of
`information_schema` / `pg_indexes` / `pg_constraint`, not written from memory).

The `saved_external_jobs` table it creates is **unused by any code** and has 1 row. It is
left alone deliberately — dropping a table is a separate, explicit decision.

## 7. Not in scope

- **No frontend.** Requested explicitly as backend-first.
- **No auto-tracking on apply.** Clicking "Apply Externally" does not create a card yet;
  that is a product decision (silently tracking what someone clicked is not obviously
  wanted) and belongs with the frontend work.
- **No match score on the card.** The screenshot shows a LOW/HIGH ring. Recommendations
  already carry a score for jobs we hold, so a card with a `jobId` could show one — but a
  hand-entered card never can, and a ring that is present for some cards and absent for
  others needs a design answer first.

---

## 8. Review note — 2026-08-18

From [`MENTOR_REVIEW_2026-08-18.md`](./MENTOR_REVIEW_2026-08-18.md).

### The §2 argument was never back-ported to `SavedJob`

§2 ("The snapshot is the point") is the best-reasoned decision in the codebase, and it
applies word for word to a **saved** job — which today is `onDelete: Cascade` with no
snapshot columns at all. Delete the posting and the user's bookmark vanishes without a
trace, on a corpus ingested from boards that delisted 9 of 43 postings during one run.

This leaves three tables serving one user intent: `SavedJob` (internal `jobId`, dies with
the job), `saved_external_jobs` (extension, snapshot, survives) and
`TrackedJob(stage=SAVED)` (snapshot, survives). Worth either giving `SavedJob` the same
treatment, or folding it into the tracker's SAVED column — which is arguably what it is.

### §6 note on `saved_external_jobs` is branch-local

The claim that no code uses it is true on `feat/external-job-tracker` and **false on
`origin/main`**, where the controller exists and the extension calls it with its flag set
to `"real"`. The two branches are disjoint: neither can serve both clients. Merge before
deploying either. Details in the review, finding #4.

### §7 "no match score on the card" — the design answer got harder

The open design question (a ring for cards with a `jobId`, nothing for hand-entered ones) now
has a second constraint: `Recommendation.score` is a **write-once cache** that is never
invalidated (review #6), so a score shown on a card can be arbitrarily old. If a ring ships,
it needs a `computedAt` next to it — or it will assert freshness the data does not have.
