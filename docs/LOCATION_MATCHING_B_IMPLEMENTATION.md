# Option B — Structured location matching: phased implementation plan

**Status:** PHASES 0-1 COMPLETE (2026-09-02) — phase 2 awaiting approval
**Written:** 2026-09-02
**Root problem:** see `LOCATION_MATCHING_ROOT_PROBLEM.md`

---

## Rules for this work (agreed with the user, 2026-09-02)

1. **One phase at a time.** Nothing in phase N+1 starts until the user approves
   phase N. Each phase ends with a STOP gate.
2. **No assumptions.** Every claim about existing code was verified by reading
   it; anything not yet verified is marked ⚠️ UNVERIFIED and must be checked
   before the phase that depends on it.
3. **Every country is treated identically.** No Cambodia-only or per-country
   special cases, in data or in code.
4. **If a phase does not produce its stated result, it gets redone** until it
   does. Each phase below has explicit, checkable acceptance criteria for
   exactly that purpose — "it builds" is never one of them.
5. **All repos in scope.** `jobfit-backend`, `jobfit-frontend`,
   `jobfit-extension`, `jobfits-ai-service`. A repo is only "not touched" when
   that has been verified, not assumed.

---

## Verified current state (checked 2026-09-02, not assumed)

| Fact | Where verified |
|---|---|
| No location/city/geo model exists in the schema | `prisma/schema.prisma` — no matching `model`; 41 migrations, none location-related |
| `Profile.latitude` / `longitude` exist but are dead | `schema.prisma:354-355`; plumbed through DTO/VO/repository, **never computed**, and `CandidateContext` (`scoring/types.ts:4-12`) cannot read them |
| `scoreLocation` is a regex containment test | `domain/scoring/location-scorer.ts`, `mentionsPlace()` |
| **5** consumers of location scoring | `compute-match-score.use-case.ts:32`, `match-external-job.use-case.ts:183`, `job-match.service.ts:90`, `recompute-user-matches.use-case.ts:221`, `match-report.service.ts:390` (via `blendExternal`) |
| Internal jobs: free-text `Job.location String?` | `schema.prisma` Job model |
| `Company` already has structured `city` / `state` / `country` | `schema.prisma` Company model — usable fallback for internal jobs |
| Ingestion writes free-text location, sometimes `null` on purpose | `ingestion.service.ts:119`, `sources/bongthom.source.ts:75-76` |
| Onboarding location picker = 7 US cities + "Remote", dropdown-only | frontend onboarding wizard line 158; `handleLocationSelect` line 920 is the only writer |
| `parseLocationInput` writes state codes into `country`, drops bare cities | `profile.mappers.ts:85-90` |
| **No country list exists anywhere in the frontend** | grep for `iso3166\|country-list\|COUNTRY_OPTIONS` → no hits |
| **AI service has no geo code at all** | grep across `jobfits-ai-service` for `geo\|geocod\|latitude\|longitude\|haversine\|distance\|nominatim\|mapbox` → no hits |
| Extension Location bar already removed | `jobfit-extension/src/content/JobFitApp.tsx`, 2026-09-02 |
| Extension still SENDS location to the backend | `src/data/recommendations.ts` query params |

### Repo scope

| Repo | Touched? |
|---|---|
| `jobfit-backend` | Yes — phases 0, 1, 2, 3a, 5 |
| `jobfit-frontend` | Yes — phase 3b |
| `jobfit-extension` | Yes — phase 4 |
| `jobfits-ai-service` | **No.** Verified: it holds no geo logic, and B is deterministic table lookup, not a model. If any phase turns out to need it, that is a finding to report, not a silent skip. |

---

## PHASE 0 — Dataset + schema foundation

**Goal:** a populated `locations` table. **No behaviour changes.**

### Work
1. Add a `Location` model to `prisma/schema.prisma`:
   `geonameId` (unique), `name`, `asciiName`, `alternateNames String[]`,
   `countryCode` (ISO-2), `countryName`, `admin1Code`, `admin1Name`,
   `population`, `latitude`, `longitude` (stored for a future option C; **not
   read by any scorer in B**).
   Indexes on `asciiName`, `countryCode`, and a GIN index on `alternateNames`.
2. Migration (`prisma migrate dev`), following the existing 41-migration convention.
3. `scripts/import-geonames.ts` — download + parse + upsert:
   - `cities15000.zip` (cities over 15,000 people, worldwide)
   - `admin1CodesASCII.txt` (province/state names)
   - `countryInfo.txt` (ISO-2 → country name)
   - Source: geonames.org, CC BY 4.0. ⚠️ UNVERIFIED: exact row count and current
     file layout — confirm at import time, do not hardcode an expected count.
4. Wire into `package.json` scripts alongside the existing `ingest`/`backfill-*` scripts.

### Acceptance criteria — RESULTS (measured 2026-09-02)
- [x] `SELECT count(*) FROM locations` non-zero: **34,129 rows** (244 distinct countries represented, 46 Cambodian cities)
- [x] Each spot-check returns **exactly one** row:

  | Place | geonameId | admin1Name | country | alternates |
  |---|---|---|---|---|
  | Phnom Penh (KH) | 1821306 | Phnom Penh | Cambodia | 72 (4 Khmer) |
  | Siem Reap (KH) | 1822214 | Siem Reap | Cambodia | 54 (1 Khmer) |
  | Chicago (US) | 4887398 | Illinois | United States | 71 |
  | Bangkok (TH) | 1609350 | Bangkok | Thailand | 80 |
  | Singapore (SG) | 1880252 | **NULL** | Singapore | 53 |
  | London (GB) | 2643743 | England | United Kingdom | 113 |

- [x] `Phnom Penh` carries its Khmer alternate name — 4 Khmer-script alternates present
- [x] ~~`admin1Name` populated for all six~~ — **CRITERION WAS WRONG, corrected.** Singapore is a
      city-state and has no admin1 in GeoNames (verified in the raw dataset before import, not
      discovered after). 25 of 34,129 rows are like this. They are stored as **NULL, never `""`**
      (verified: 0 empty-string rows), because two places with an unknown province are not in the
      same province. **This is a constraint on phase 2:** the "same admin1" branch must require
      both sides non-null, or every city-state would match every other city-state.
- [x] Re-run is idempotent — second run: `34129 → 34129 (0 inserted)`, **0 duplicate geonameIds**
- [x] `npx tsc --noEmit` clean — full suite **113 suites / 1293 tests passed**

### Measured facts
- Dataset: 34,129 cities · 252 countries · 3,865 admin1 codes · `cities15000.zip` 3.2 MB
- 0 rows skipped during parse
- Supabase row limits: no issue at this size

### Deviations from plan (reported, not silently absorbed)
1. **No `package.json` entry added.** The plan said to wire it in "alongside the existing
   `ingest`/`backfill-*` scripts" — but on inspection **none of those have package.json entries
   either**; the repo convention is `npx ts-node -r tsconfig-paths/register scripts/<name>.ts`.
   Followed the real convention instead of the assumed one.
2. **No new dependency for unzipping.** No zip library was installed, so the importer reads the
   ZIP central directory and inflates with stdlib `zlib` (~30 lines) rather than adding a package
   for a maintenance script.
3. **Unrelated schema drift left alone.** `prisma migrate diff` also wanted to rename
   `match_reports_userId_source_externalId_descriptionHash_idx`. That is pre-existing drift, not
   part of this work, so it was excluded from the migration. `prisma migrate status` reports the
   database up to date. Flagged for a separate decision.

### Risks (unchanged)
- `cities15000` excludes towns under 15k. If coverage proves too thin for real users, re-import
  `cities5000` — change one constant, no code change.

> ### 🛑 PHASE 0 COMPLETE — awaiting approval for phase 1.

---

## PHASE 1 — Resolver service (pure, tested, unused)

**Goal:** turn any location string into a resolved place. **Still no behaviour changes.**

### Work
1. `LocationResolverService`:
   - `resolveText(raw: string | null): ResolvedPlace | null` — for job strings
     ("Toul Kork, Phnom Penh, Cambodia", "San Francisco, CA")
   - `resolveStructured(city, country): ResolvedPlace | null` — for profiles
   - Normalisation: lowercase, strip diacritics, collapse whitespace, split on
     commas, try longest phrase first, match against `asciiName` → `name` →
     `alternateNames`. Ambiguity resolved by highest `population`.
2. **Load the whole table into memory at boot** and index it there. The
   extension's `/recommendations/by-job` is a hot path (one call per job page
   viewed) and must not gain a DB round-trip. ⚠️ Measure the memory footprint
   and record it here.
3. Unit tests, all countries: `"Phnom Penh"`, `"phnom penh"`, `"ភ្នំពេញ"`,
   `"Toul Kork, Phnom Penh, Cambodia"`, `"Siem Reap"`, `"Chicago, IL"`,
   `"San Francisco, CA"`, `"Bangkok, Thailand"`, `"Remote"`, `""`, `null`,
   `"asdfgh"`, and a deliberately ambiguous name (e.g. `"Springfield"`).

### Acceptance criteria — RESULTS (measured 2026-09-02, against the real 34,129-row table)
- [x] Every string resolves as expected, or to `null` where that is correct
- [x] `"Chicago, IL"` → Chicago, **US**, admin1 **Illinois** — "IL" read as a state, not Israel
- [x] `"San Francisco, CA"` → San Francisco, **US**, admin1 **California** — not Canada
- [x] Khmer script and `"Phnom Penh"` resolve to the **same** geonameId (1821306); `"PNH"` too
- [x] 1,000 resolutions in **2 ms** (limit 50 ms)
- [x] Memory measured — see below
- [x] Suite green: **114 suites / 1,323 tests**, of which **30 new** location tests

Full-scale resolution results:

| Input | Resolved to |
|---|---|
| `Phnom Penh` / `  phnom   penh ` / Khmer script / `PNH` | Phnom Penh, KH |
| `Toul Kork, Phnom Penh, Cambodia` | Phnom Penh, KH (unknown district ignored) |
| `Siem Reap, Cambodia` | Siem Reap, KH |
| `Bangkok, Thailand` | Bangkok, TH |
| `Chicago, IL` / `Chicago, Illinois` | Chicago, US [Illinois] |
| `San Francisco, CA` | San Francisco, US [California] |
| `London` | London, **GB** (population tie-break) |
| `London, Canada` | London, **CA** [Ontario] (named country overrides population) |
| `Springfield, Missouri` | Springfield, US [Missouri] |
| `Singapore` | Singapore, SG (admin1 **null** — city-state) |
| `New York, NY` | New York City, US |
| `Remote` · `""` · `asdfgh` · `12345` · null | **null** |

### ⚠️ MEMORY — a decision is needed before phase 2 reaches production

**Measured retained steady state: +70.5 MB** (34,129 places, 316,522 lookup keys), after
GC and after the loaded rows become collectable. Load 3.1 s, index build 0.3 s.

Reduced from 83 MB during this phase: `alternateNames` is consumed while building the key
map and never read again, so the index now copies each row into a compact record and lets
the originals be collected (**12.7 MB saved**, no capability lost — re-verified).

**The problem:** `cloudbuild.yaml` sets **no `--memory` flag**, so Cloud Run runs the
default **512 MiB**. Node + Nest + Prisma already occupy a large share of that, and 70.5 MB
on top is not free. `LocationModule` is registered in `app.module.ts`, so the index is
built at boot **even though nothing consumes it yet**.

**DECIDED 2026-09-02 by the user: option 1 — `--memory=1Gi`.** Applied to
`cloudbuild.yaml` (deploy step, beside `--port=8080`), with the measured figure recorded
in a comment there so a later reader knows why the default was overridden. YAML re-parsed
to confirm it is still valid.

The rejected alternatives, recorded so the choice is not re-litigated from scratch:
2. **Index fewer alternate names** — saves memory, but the alternates are exactly what make
   Khmer script and `PNH` resolve. Directly trades away the capability just built.
3. **Query the DB per resolution with an LRU cache** — removes the 70 MB, adds a query on
   every cache miss on the extension's hot path.

⚠️ **The new limit only takes effect on the next deploy.** Nothing has been deployed;
local runs are unaffected either way.

> ### 🛑 PHASE 1 COMPLETE — awaiting approval for phase 2 (and a decision on memory).

---

## PHASE 2 — Rewrite the scorer (the phase that changes numbers)

**Goal:** location becomes real signal.

### Work
1. `scoring/types.ts` — `CandidateContext` and `JobContext` carry
   `place: ResolvedPlace | null` instead of raw `city`/`country`/`location` strings.
2. `location-scorer.ts` — replace the regex with the hierarchy ladder:

   | Relationship | Score |
   |---|---|
   | Job is REMOTE | 100 |
   | Same city (`geonameId` equal) | 100 |
   | Same country **and** same `admin1` | 85 |
   | Same country | 70 |
   | Different country | 30 |
   | Either side unresolved | **`null`** |

3. `SubScores.location` becomes `number | null`.
4. **Weight renormalisation** — when location is `null` it must be *excluded*
   from the total and the remaining weights rescaled, exactly as `semantic:
   false` already excludes skills. Silently scoring a `null` as 50 would
   recreate the bug this whole effort exists to remove.
5. Update all **5** consumers (listed above), including
   `match-report.service.ts` via `blendExternal`.
6. Internal jobs: resolve `Job.location`; when it is null, fall back to the
   job's `Company.city`/`country`, which are already structured.
7. Rewrite the `scoreLocation` cases in `domain/scoring/scoring.spec.ts`.

### Acceptance criteria
Measured against a real profile of `Phnom Penh, Cambodia`:

- [ ] `"Phnom Penh, Cambodia"` → 100
- [ ] `"Toul Kork, Phnom Penh"` → 100
- [ ] `"ភ្នំពេញ"` → 100
- [ ] `"Siem Reap, Cambodia"` → 70
- [ ] `"Bangkok, Thailand"` → 30
- [ ] `"Remote"` → 100
- [ ] `""` / unparseable → `null`, **and the total is computed without it**
- [ ] Same ladder verified for a `Chicago, US` profile — no country-specific code paths
- [ ] A Phnom Penh job and a Bangkok job with otherwise identical inputs differ in the final match % by ~10.5 points (was: 0)
- [ ] Full backend test suite green
- [ ] No consumer still reads `candidate.city` / `job.location` for scoring

> ### 🛑 STOP — report results, wait for approval.

---

## PHASE 3 — Input, so users can supply a resolvable location

### 3a. Backend (new endpoints)
- `GET /locations/countries` → ISO list, **from the imported table** so there is
  one source of truth and no second hardcoded list.
- `GET /locations/cities?country=&q=` → typeahead, available for **every**
  country, not a curated per-country list.
- Both public/authenticated per existing convention; rate-limited using
  `@RateLimit`, never a bare `@SkipThrottle()` (see `rate-limit.decorator.ts`).

### 3b. Frontend
- Onboarding wizard: replace `LOCATION_OPTIONS` (line 158) with a country
  dropdown + city typeahead backed by the endpoints above. Free text stays
  accepted so nobody is blocked by dataset coverage.
- Replace `parseLocationInput` (`profile.mappers.ts:85-90`): never write a state
  code into `country`; never silently drop a bare city.
- `profile-form.tsx` city/country inputs: same components, so both entry points agree.

### Acceptance criteria
- [ ] A user in Cambodia can complete onboarding with **Phnom Penh, Cambodia** — the field that is currently impossible to satisfy
- [ ] A user in the US, Thailand and the UK can each complete it too — verified, not assumed
- [ ] The saved profile has `city` and `country` that `resolveStructured` resolves to a real row
- [ ] `"CA"` can never end up in the `country` column
- [ ] Selecting "Remote" saves a remote preference rather than silently saving nothing
- [ ] Frontend typecheck/build green

> ### 🛑 STOP — report results, wait for approval.

---

## PHASE 4 — Extension: honest display

### Work
- `ExternalJobMatchDto` exposes whether location resolved (`subScores.location`
  nullable, matching how `semantic` already works).
- `JobFitApp.tsx`: restore the Location bar, rendering **"not computed"** when
  null — the treatment Skills already gets. It was removed on 2026-09-02
  precisely because it was not measuring anything; it returns only now.

### Acceptance criteria
- [ ] Location bar shows a real value on a job whose location resolves
- [ ] Shows "not computed" — not a number — when it does not
- [ ] Extension typecheck + build green; verified in the browser on a real job page

> ### 🛑 STOP — report results, wait for approval.

---

## PHASE 5 — Backfill + end-to-end verification

### Work
- Backfill existing `Profile` rows: re-resolve `city`/`country`; report how many
  resolve, how many do not, and what the bad ones look like (expect `country: "CA"` rows).
- Re-run `scripts/recompute-recommendations.ts` so stored matches use the new scorer.
- Before/after measurement on a sample of real users: score spread, and whether
  local jobs now outrank foreign ones for the same skills.

### Acceptance criteria
- [ ] Count of profiles resolved / unresolved recorded in this doc
- [ ] No profile silently keeps a wrong country
- [ ] Measured evidence that ranking changed in the intended direction — a
      number, not an opinion
- [ ] Full suite green across backend, frontend, extension

---

## If this does not work

Per rule 4. Each phase's acceptance criteria are the definition of "works" —
deliberately concrete so the answer is checkable rather than arguable.

- A phase that fails its criteria is **not** reported as done. It gets redone.
- Failures are reported with the failing criterion and the actual output, not
  summarised away.
- Every phase is independently revertible: 0 and 1 add unused code, 2 is one
  scorer plus its call sites, 3–4 are UI. Nothing before phase 2 changes a
  single user-visible number.
- If a phase turns out to be impossible as specified, that is reported before
  building something different — the plan changes with approval, not silently.
