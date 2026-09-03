# Location matching — the root problem

**Status:** open · **Written:** 2026-09-02 · **Owner:** location must contribute
real signal to the AI ranking, or be removed from it.

---

## The root problem in one sentence

**Nothing in the system resolves a place into anything comparable**, so location
can never influence the ranking meaningfully — no matter how good the input
field is.

Everything below is verified against the code, not assumed.

---

## Why "fix the input field" is NOT the fix

Letting a Cambodian user type "Phnom Penh" fixes *data entry*. It does not make
location analysable. After that change the pipeline still does this:

```
profile.city  = "Phnom Penh"        (a string)
job.location  = "Toul Kork, Phnom Penh, Cambodia"   (another string)
                        ↓
        whole-word regex containment test
                        ↓
              100 / 80 / 55 / 50 / 40
```

That is the whole "analysis". It is why a data-entry fix alone changes nothing
about ranking quality — the exact objection that produced this document.

---

## Verified current state

| Claim | Evidence |
|---|---|
| The AI service has **no geo code at all** | grep for `geo\|geocod\|latitude\|longitude\|haversine\|distance\|nominatim\|mapbox` across `jobfits-ai-service` → no hits. Only `ParseResponse.location` (`app/schemas/resume.py:68`), a free-text field nothing reads back. |
| Location is **not in the candidate embedding** | `buildCandidateText` (`matching-embedding.service.ts:239-257`) = headline + bio + desiredIndustries + résumé summary + skills + experience titles. No city, no country. |
| Location **is** in the external-job embedding | `match-external-job.use-case.ts:211-213` embeds `"<title> at <company> <location>"`. Asymmetric — the job vector carries location text with nothing on the candidate side to match it. This is noise in the cosine, not geo matching. |
| The only comparison is a **regex** | `location-scorer.ts` → `mentionsPlace()` is a `RegExp` word-boundary test. No hierarchy, no distance, no synonyms. |
| `latitude` / `longitude` columns are **dead** | `schema.prisma:354-355` defines them; the DTO, `Location` VO and repository pass them through; **nothing computes them** and no scorer can read them — `CandidateContext` (`scoring/types.ts:4-12`) carries only `city: string \| null` and `country: string \| null`. |
| Onboarding **cannot express a non-US location** | `LOCATION_OPTIONS` (onboarding wizard, line 158) = 7 US cities + "Remote", dropdown-only (no free text, no Enter-to-add). Required field. |
| The saved value is **wrong or empty** | `parseLocationInput` (`profile.mappers.ts:85-90`) splits on commas: `"San Francisco, CA"` → `country: "CA"` (a US state in the country column); `"Remote"` → no comma → `undefined` → nothing saved. |

### What the user actually experiences

- Two people in the same city score differently based on spelling.
- "Phnom Penh" vs a job listed as "Phnom Penh, Cambodia" → 100 by substring luck.
- "PP", "Phnom Penh Capital", or blank → 50–55, same city, same job.
- Location is still **15% of every score** (`MATCH_WEIGHTS`, and 15% of
  `fieldForwardScore` for external jobs) while being essentially arbitrary.

---

## The two halves of the real problem

Fixing only the candidate side solves nothing. **Both sides must resolve to the
same vocabulary.**

1. **Candidate side** (easy) — one value per user, written once at onboarding.
2. **Job side** (the hard half) — for external postings the only input is a free
   text string scraped from a LinkedIn/Indeed page, at request time, with no
   storage allowed. Whatever resolution is chosen must run on that string
   cheaply and offline.

---

## Options

### A. Remove location from scoring entirely
Drop `location` from `MATCH_WEIGHTS` and from `fieldForwardScore`; move the 15%
to skills. Delete the sub-score bar (already removed from the extension panel).

- **Cost:** ~1 hour. No data, no dependencies.
- **Gain:** every score becomes honest immediately.
- **Loss:** location stops influencing ranking at all — which is the thing that
  was wanted in the first place.

### B. Structured hierarchy, no coordinates ← **recommended**
Resolve both sides to `country → admin1 (province/state) → city` using one
static dataset, then score by **hierarchy distance** instead of string overlap:

| Relationship | Score |
|---|---|
| Same city | 100 |
| Same province/admin1 | 85 |
| Same country | 70 |
| Neighbouring country / same region | 55 |
| Different country | 30 |
| Job is REMOTE | 100 |
| Either side unresolved | `null` → excluded from the total, shown as "not computed" |

- **Data:** GeoNames `cities15000` (~25k rows, ~5 MB) or `cities5000` (~50k),
  loaded into a `locations` table with `name`, `asciiname`, `alternatenames`,
  `admin1`, `countryCode`. Free, CC-BY, one-time import.
- **Resolution:** case-insensitive lookup over name + alternate names, so
  "Phnom Penh", "PhnomPenh", "ភ្នំពេញ" and "PNH" all land on the same row. The
  job string is resolved by scanning its comma-parts against the same table.
- **Why this is the right size:** it needs no geocoding API, no per-request
  network call, no coordinates, and it answers the question the ranking actually
  asks — "is this job where the candidate is?" — instead of "do these two
  strings share characters?"
- **Cost:** ~2–3 days (import script, `locations` table + indexes, resolver
  service, rewrite `scoreLocation`, backfill existing profiles).

### C. Full geocoding with coordinates
Geocode both sides to lat/lng, score by haversine distance against a commute
radius. The `latitude`/`longitude` columns and the `Location` VO already exist
for exactly this.

- **Cost:** a geocoding provider (Nominatim self-hosted, or a paid API with
  per-request cost and rate limits), a backfill, a cache, and failure handling
  on the extension's hot path.
- **Verdict:** only worth it once "within 15 km" / commute time is a product
  feature. B is a strict prerequisite anyway — do B first.

---

## Recommendation

**B, and treat every country identically.** No per-country special cases: one
dataset, same resolution path for a user in Phnom Penh and a user in Chicago.
Anything less makes this a Cambodia-only product.

Sequence:

1. **Now** — unblock input: ISO country dropdown (all countries) + free-text
   city, for every user. Fix `parseLocationInput` so a bare city is not silently
   dropped and a state code never lands in `country`. *This is data entry only —
   it does not improve ranking, and must not be described as if it does.*
2. **Then** — import the dataset, add the resolver, rewrite `scoreLocation` to
   hierarchy distance, and return `null` when either side cannot be resolved so
   the UI can honestly say "not computed" (as Skills already does).
3. **Then** — restore the Location bar in the extension panel, because at that
   point it is measuring something real.
4. **Later, only if the product needs it** — C.

Until step 2 ships, location should not carry 15% of the score.

---

## Files this touches

| File | Change |
|---|---|
| `src/modules/matching/domain/scoring/location-scorer.ts` | rewrite: hierarchy distance, not regex |
| `src/modules/matching/domain/scoring/types.ts` | `CandidateContext`/`JobContext` carry resolved ids, not raw strings |
| `src/modules/matching/domain/scoring/weighted-match.calculator.ts` | weight stays 15% only once the signal is real |
| `src/modules/matching/application/use-cases/match-external-job.use-case.ts` | resolve the page's location string at request time |
| `prisma/schema.prisma` | new `locations` table; `Profile` gains a resolved FK |
| `jobfit-frontend` onboarding wizard (line 158, `LOCATION_OPTIONS`) | ISO country list + free-text city |
| `jobfit-frontend` `profile.mappers.ts:85-90` (`parseLocationInput`) | stop dropping bare cities; stop writing state codes into `country` |
| `jobfit-extension` `src/content/JobFitApp.tsx` | Location bar removed 2026-09-02; restore after step 2 |
