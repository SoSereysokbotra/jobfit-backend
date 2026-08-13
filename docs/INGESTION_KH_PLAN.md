# Cambodian job-board ingestion — implementation plan

> Adding **bongthom.com** and **jobnet.com.kh** as ingestion sources alongside TheMuse.
> Written before any code, per the project rule that a plan states its evidence first.
>
> **Status: built. bongthom verified live (15/15). jobnet UNVERIFIED against the live site
> — see §7.** The plan below is the original; §7 records where reality departed from it,
> including one finding that changed the design after approval.

---

## 0. Why this is worth doing

The corpus is 61 published jobs, of which 43 are TheMuse — a US board. The product's
users, seed data and operator are in Cambodia. Every retrieval and calibration number in
`PHASE_E_PLAN.md` is measured against a corpus that mostly does not contain jobs its users
could take.

bongthom alone advertises **275 current postings** in one feed.

---

## 1. What was actually measured (2026-08-13)

Not assumed — each row was fetched and inspected.

| | bongthom.com | jobnet.com.kh |
|---|---|---|
| `robots.txt` | **Absent** (returns site HTML) | **Absent** (returns site HTML) |
| Machine-readable feed | ✅ `/rss.xml`, advertised in `<head>` via `<link rel="alternate">` | ❌ none — `/rss`, `/feed`, `/sitemap.xml` all return HTML |
| Postings available | **275** in the feed | **30 unique** per `/jobs-in-cambodia` page |
| Detail page | Server-rendered, ~38 KB | Server-rendered, ~187 KB |
| Structured data | ❌ no JSON-LD, no microdata | ✅ **schema.org `JobPosting` JSON-LD** |
| Terms of Use | ⚠️ **JS-rendered — could not read** | ⚠️ **could not read** |

### What each source actually yields

**bongthom** — RSS gives `title`, employer (inside CDATA), `guid` (`btdc-id: 41023`),
`link`, `pubDate`. The detail page adds, as `<strong>Label:</strong><span class="value">`:

```
Salary:           $400 - $650
Schedule:         Full-time
Career Category:  Sales / Marketing, Business Administration
```

**jobnet** — one JSON-LD block per detail page:

```
Title              "Event Assets Manager"
Description        2951 chars of HTML  ← htmlToText already handles this exactly
employmentType     "Full Time"
hiringOrganization { name: "Vattanac Brewery Limited" }
jobLocation        { addressLocality: "Phnom Penh", addressCountry: "Cambodia" }
datePosted / validThrough / identifier
```

**Two quirks that will break a naive parser and are handled explicitly in §3.6:**
- The keys are `Title` and `Description` — **capitalised**, not schema.org's lowercase.
  `d.title` is `undefined`; the value is in `d.Title`.
- The JSON-LD contains **unescaped control characters** (raw newlines inside strings), so
  `JSON.parse` throws. It needs a lenient pass.

---

## 2. The permission question — stated honestly

**I could not read either site's Terms of Use.** Both are JavaScript-rendered, so a plain
fetch returns an empty shell. Absent `robots.txt` means *no crawl rules are declared*,
which the Robots Exclusion Protocol treats as permissive — but **that is not affirmative
permission, and a ToS clause outranks robots.txt.** Someone must open both pages in a
browser before this ships.

What the design does to stay on the defensible side regardless:

| Choice | Why it matters |
|---|---|
| `sourceType: EXTERNAL` on every ingested job | The server already **refuses in-app applications** to EXTERNAL jobs and sends the user to `externalUrl`. Traffic flows *to* the source, which is the tolerated aggregator pattern. |
| bongthom read via its **own advertised RSS feed** | A publisher-advertised feed is an explicit invitation to syndicate. This is consumption, not scraping. |
| Identifying User-Agent + contact URL | They can see who we are and block us if they object. An anonymous browser-spoofing UA is what makes scraping adversarial. |
| Conservative rate limit, detail pages fetched **once** per posting | Steady-state load is a handful of requests per run, not 275. |
| No logo/image hotlinking | We store text, not their bandwidth. |

**If either ToS forbids automated access, that source gets deleted, not negotiated.**

---

## 3. Design decisions

**3.1 — Reuse `IngestionService`, do not build a parallel pipeline.**
`persist()` already upserts companies, dedups on `@@unique([source, externalId])`, sets
`PUBLISHED`, stamps `lastSeenAt`, and counts created/updated/skipped. Two more sources are
two more adapters, not a second pipeline.

**3.2 — `JobSource` becomes a union of three.**
`'THEMUSE'` → `'THEMUSE' | 'BONGTHOM' | 'JOBNET'`. TypeScript then forces every `switch`
over sources to handle the new ones.

**3.3 — A `JobBoardSource` interface, so the service stops naming sources one by one.**
`IngestionService.ingestFromTheMuse(pages)` is source-specific. Three of those is a smell.
One interface (`fetchJobs(limit): Promise<NormalizedJob[]>`) plus a registry keyed by
`JobSource` means the controller takes a source parameter and nothing else changes.

**3.4 — `NormalizedJob` grows three optional fields.**
Both new sources carry data the current shape throws away:

```ts
minSalary?: number | null;
maxSalary?: number | null;
employmentType?: EmploymentType | null;   // the enum added in E3
```

This is the payoff for E3: `employmentType` has been NULL on all 61 jobs because nothing
could fill it. bongthom says `Full-time`, jobnet says `Full Time`. **`persist()` must only
write these when present** — the E3 rule stands, a fact we do not have must not become a
default.

**3.5 — bongthom: RSS for discovery, detail page only for postings we have not seen.**
The RSS feed is one request and lists all 275. Detail pages are fetched only for
`externalId`s absent from the database. Steady state after the first run is a handful of
requests. Re-fetching all 275 every run was rejected: postings rarely change after
publication, and it is ~275× the load for almost nothing.

**3.6 — jobnet: parse the JSON-LD, never the CSS.**
Publisher-authored structured data is meant to be machine-read and survives restyling;
CSS selectors do not. The two quirks from §1 are handled: read `Title`/`Description` with
a case-insensitive key lookup, and strip control characters before `JSON.parse`. **If the
JSON-LD is missing or unparseable the posting is SKIPPED, not guessed at** — a job with a
fabricated title is worse than a job we did not import.

**3.7 — Descriptions go through `htmlToText`.**
jobnet's `Description` is HTML; bongthom's detail body is HTML. The converter built in E10
already handles exactly this, including the plain-text-never-markup rule that matters most
here because this is third-party input.

**3.8 — Salary parsing is deliberately narrow.**
bongthom writes `$400 - $650`. Parse only the forms actually observed, and store nothing
when the text does not match (`Negotiable`, `N/A`, Khmer text). Cambodia quotes salaries in
USD; `Job` has no currency column, and every existing row is treated as USD, so this
inherits that assumption rather than inventing a new one. **A wrong salary is worse than an
absent one** — it feeds `scoreSalary`, which calibration measured as the *strongest* signal
(ρ 0.684).

**3.9 — Khmer titles are kept verbatim.**
Real postings are titled e.g. `មន្ត្រីឥណទាន`. No transliteration, no dropping. BGE-M3 was
chosen precisely for being multilingual (RAG plan §171), so Khmer text embeds meaningfully.
The BM25 leg is English-configured and will not match Khmer — already recorded as a known
limitation in E8, and this makes it matter more.

**3.10 — `remoteType` defaults to `ON_SITE` for both.**
Neither source has a remote flag. Cambodian postings are overwhelmingly on-site, and
`ON_SITE` is the existing default in the schema. Not inventing a `REMOTE` we cannot see.

---

## 4. Phases

Each phase ends green — `tsc`, lint, jest — and is committed separately.

### Phase 1 — Contract (no behaviour change)
- `ingestion.types.ts`: widen `JobSource`; add the three optional fields to `NormalizedJob`.
- `JobBoardSource` interface + registry.
- Refactor `IngestionService` to dispatch by source; keep `ingestFromTheMuse` as a thin
  wrapper so the existing route and its callers do not break.
- `persist()` writes salary/employmentType **only when present**.
- Existing ingestion tests must pass untouched — that is the proof this phase changed nothing.

### Phase 2 — bongthom
- `sources/bongthom.source.ts`: fetch + parse RSS; fetch detail pages for unseen ids;
  label-driven extraction of Salary / Schedule / Career Category.
- `bongthom.source.spec.ts` against **saved fixtures** (a real RSS sample + a real detail
  page checked into `test/fixtures/`), so the tests do not hit the network and still fail
  loudly if our parsing assumptions break.
- Rate limiter + identifying User-Agent shared by both sources.

### Phase 3 — jobnet
- `sources/jobnet.source.ts`: fetch listing → job links; fetch detail → lenient JSON-LD.
- `jobnet.source.spec.ts` against a saved fixture, **including the malformed-JSON case**,
  because that is the failure mode already observed.

### Phase 4 — Run it, and measure what changed
- Add the two sources to the ingestion route.
- Run against the live sites, once, with a small limit.
- Embed the new jobs; **re-run both harnesses** (`eval-retrieval`, `eval-score-calibration`)
  and record before/after in `PHASE_E_PLAN.md`.

---

## 5. Risks, and what would falsify this plan

| Risk | Signal | Response |
|---|---|---|
| A ToS forbids automated access | Human reads the page | **Delete that source.** Not negotiable. |
| Markup/JSON-LD changes | Fixture tests still pass but live run yields 0 or garbage | Fixtures catch our regressions, not theirs — so the run reports `skipped` counts and a run with a high skip rate is a failure, not a success |
| Corpus change invalidates baselines | Retrieval/calibration numbers move | **Expected and fine** — but must be re-measured and recorded, not silently absorbed. This is why Phase 4 exists. |
| Khmer content dilutes BM25 | Sparse leg returns nothing for Khmer queries | Already a known dead leg (E8). Record; do not fix here. |
| We become a nuisance | They block our UA | Rate limit + identifying UA + detail-once are the mitigations; being blockable is deliberate |

**What would make me stop and re-plan:** if the live run's `skipped` count exceeds roughly
a fifth of `fetched`, the parsing assumptions are wrong and the fix is not "loosen the
parser" — it is to look at what actually came back.

---

## 6. Explicitly NOT in scope

- **No Khmer→English translation.** BGE-M3 is multilingual; a translation layer is an
  unmeasured LLM step on the ingest path.
- **No LLM extraction of requirements at ingest.** `extractedRequirements` already has a
  batch path (`extract-job-requirements.ts`); ingestion stays deterministic.
- **No scheduling.** There is no nightly batch for anything yet (see
  `recompute-recommendations.ts`); adding cron for ingestion alone would be inconsistent.
- **No logo/image storage.** Text only.
- **No third site.** The request listed bongthom twice; only two distinct sources exist.

---

## 7. What actually happened (2026-08-13)

### 7.1 — The design changed AFTER approval, on evidence

The approved plan (§3.5) fetched bongthom detail pages for descriptions, salary and
category. **Two things found while implementing say the publisher does not want that:**

1. The description on a detail page is interleaved with `<span class="noselect">`, and
   their stylesheet defines `.noselect { user-select: none }`. A human highlighting the
   description gets a broken copy. That is an anti-copying measure, not styling.
2. Their **RSS feed omits the description** — it syndicates the listing only.

Both point one way: *syndicate the listing, do not take the body.* No Terms of Use reading
is needed to see it. **bongthom is now feed-only**, and salary/category/employmentType are
NOT collected from it. The cost — thin descriptions that embed poorly — was accepted
knowingly.

jobnet is the opposite and unchanged from the plan: **zero** anti-copy measures, and the
full description published as schema.org JSON-LD, markup whose purpose is to be
machine-read.

### 7.2 — A latent bug found while wiring, unrelated to either site

`IngestionService.persist()` never set `sourceType` on create, and the schema defaults to
`INTERNAL`. The 43 existing THEMUSE jobs are `EXTERNAL` only because migration
`20260806090000` backfilled them once — there is no trigger. **The next ingestion run
would have created jobs as INTERNAL**, reintroducing exactly what that migration was
written to fix: a user clicking Apply on a posting that lives on another site, with the
application going nowhere. Now set explicitly; verified — all 15 new rows are `EXTERNAL`.

### 7.3 — Results

| | bongthom | jobnet |
|---|---|---|
| Unit tests (real captured fixtures) | ✅ 12 | ✅ 18 |
| Live run | ✅ **276 fetched, 261 created, 15 updated, 0 skipped** | ✅ **30 links, 29 created, 1 skipped, 0 errors** |

Both verified against the live sites. The 15 "updated" on bongthom are the rows from an
earlier smaller run, which is dedup on `(source, externalId)` working.

jobnet's single skip is a posting with no usable `JobPosting` JSON-LD — the designed
refusal, not a failure. **3% skip, well inside the 20% stop condition of §5.**

**jobnet was briefly unreachable earlier** — listing, detail and homepage all timing out at
60 s on two User-Agents, after ~8–10 requests spaced ≥1 s apart. Retrying was deliberately
not attempted. It returned to normal ~25 minutes later (0.8 s response), so it was a
transient outage on their side, **not** a block. Worth remembering: this ingestion has to
tolerate the source simply being down, and it does — the run reports the error and stores
nothing.

### 7.3b — What each source actually contributes

| source | jobs | `employmentType` | `location` | avg description |
|---|---|---|---|---|
| internal (employer-posted) | 19 | 0 | 19 | 84 |
| **BONGTHOM** | **276** | 0 | 0 | **45** |
| **JOBNET** | **29** | **29** | **29** | **2,099** |
| THEMUSE | 43 | 0 | 43 | 4,562 |

Corpus went from 61 to **367 jobs, 305 of them Cambodian** — the point of the exercise.

Two things this table says plainly:

- **jobnet is the first source ever to populate `employmentType`.** That column was added in
  E3 and had been NULL on every one of the 61 existing jobs, because nothing could fill it.
  29 of 29 jobnet postings state it, along with a location and a real 2 k-character
  description.
- **bongthom's 45-character "descriptions" are titles**, exactly as the feed-only decision
  requires. They are now **75% of the corpus by row count and ~1% by text**. That is a
  known and accepted trade, but see §7.5 — it is not free.

### 7.4 — The corpus change could NOT be measured, because the eval set shrank

Phase 4 required re-running both harnesses. They ran, but the numbers are **not comparable
to the 2026-08-10 baselines**:

| | 2026-08-10 | 2026-08-13 |
|---|---|---|
| Labelled candidates | 2 | **1** |
| Labelled pairs | 100 | **50** |

`snowrin168@gmail.com`'s 50 labels are gone. The user row that owned them was deleted and
the email re-registered — the current row was created `2026-08-13 03:26`, while every
surviving label was written `2026-07-27`. `match_labels` cascades on user delete, so the
labels went with it. There is **no `USER_ACCOUNT_DELETED` audit row**, so it did not happen
through the admin path.

Not caused by this work, but it means **any before/after claim about the 15 new jobs would
be false** — the instrument changed at the same time as the thing being measured. The
figures below are recorded as a new baseline, not as a delta:

```
retrieval    Recall@10 0.500 · MRR@10 0.500 · nDCG@10 0.606   (n=1)
calibration  TOTAL ρ 0.662 · skills 0.553 · salary 0.684 · other 0.518 · experience 0.000
```

**This is now the second harness limitation of the same shape** (see E8: the labelled users
were exactly the ones who did not exhibit the BM25 bug). The eval set is one candidate, no
résumé, no Cambodian jobs. **Re-labelling is the highest-value next step for matching
work** — every retrieval or scoring change is currently unmeasurable.

### 7.5 — A retrieval drop here would NOT mean the product got worse

Before running the harness again, check what it can even see. Every labelled job comes from
the **pre-existing** corpus:

| label | sources | n |
|---|---|---|
| GREAT | internal 6, THEMUSE 3 | 9 |
| OK | THEMUSE 2, internal 1 | 3 |
| BAD | THEMUSE 37, internal 1 | 38 |

**Not one labelled job is from bongthom or jobnet.** The corpus went 62 → 367, so the 12
relevant jobs now compete against ~305 additional candidates that the eval set has no
opinion about. Recall@10 can only fall.

That fall would measure **"the eval set does not cover the new corpus"**, not "retrieval
regressed". For the Cambodian user this product is for, 305 local jobs is the improvement;
the harness simply cannot express that, because its only labelled candidate is a Senior
Software Engineer graded against US postings.

**Do not tune anything on the post-ingestion retrieval number.** It is reported below for
the record and is not a baseline worth defending. The baseline to rebuild is a label set
that includes Cambodian jobs.
