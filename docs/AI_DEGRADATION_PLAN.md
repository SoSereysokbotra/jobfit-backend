# AI service resilience — what happens when the AI is down

**Date:** 2026-08-25 · **Implemented:** 2026-08-27 · **Branch:** `main` · **Verified at:**
`29263da` plus uncommitted working-tree changes (see §8 for what is now built)
**Method:** read `jobfits-ai-service` and `jobfit-backend` directly, then **ran the whole
stack locally and reproduced every failure mode**. Latency figures are measured on this
machine, not estimated.

> **Why this file exists.** "What should happen when the AI is unavailable?" was asked as a
> design question. It turned out to be partly a configuration question: the AI service's
> generate timeout was set *below the measured cost of its own core task*, so résumé
> parsing failed 100% of the time on this hardware for reasons that had nothing to do with
> availability. This document separates the two, and records what was measured so the next
> person does not have to re-derive it.

---

## 1. What the AI service actually is

`jobfits-ai-service` — FastAPI, 9 endpoints under `/api/v1`. Every route requires
`X-AI-Service-Key` except `/health`.

| Endpoint | Purpose | Provider |
|---|---|---|
| `POST /resume/parse` · `/resume/score` | CV → structured data, ATS scoring | Ollama only |
| `POST /embed` | text → `vector(1024)` (bge-m3) | Ollama only |
| `POST /rerank` | LLM reranking of a shortlist | Ollama only |
| `POST /match/reason` | grounded match reasoning | Ollama only |
| `POST /generate/cover-letter` · `/generate/interview` | generation | DeepSeek → Ollama |
| `POST /job/requirements` | posting → requirement list | DeepSeek → Ollama |
| `GET /health` | liveness + model list | — |

**Screening does NOT live here.** `ApplicationScreeningService` is backend-side and fully
deterministic — pgvector cosine plus string matching over requirements extracted and cached
earlier. It makes **no AI call at request time**. Verified by inspection: `grep aiClient`
across `application-screening.service.ts`, `skill-gap.service.ts` and `job-match.service.ts`
returns nothing.

### Structure

`routers/` → `services/` → `ollama_client.py` → Ollama. `ollama_client.py` documents itself
as *"the ONLY module that talks to Ollama"*, and that invariant holds. A `ChatRouter` picks
DeepSeek-or-Ollama per task.

### Error handling — good

Every `httpx` failure is converted into a structured envelope
(`{"error": {"code", "message"}}`) with real codes: `MODEL_TIMEOUT`, `MODEL_ERROR`,
`INVALID_MODEL_OUTPUT`, `UNAUTHORIZED`, `BAD_REQUEST`, `INTERNAL`. **A failure here is
reliably detectable by the backend, not a generic connection error.**

### Retries — essentially none

No network-level retry anywhere. The single exception is `match_reason_service.py`, which
retries once on **JSON shape drift** (not on connection failure) and then falls back to a
deterministic keyword-overlap answer with `degraded=True`, explicitly refusing to invent
evidence. **That is the best degradation pattern in either repo** and is the model the rest
should follow.

### Two findings that matter

**(a) `/health` is a liveness check wearing a readiness check's name.**

```python
try:
    models = await get_ollama_client().list_models()
except Exception:
    models = []          # "Ollama status is advisory"
return {"status": "ok", "modelsLoaded": models}
```

With Ollama completely down this returns `status: ok`. `modelsLoaded: []` is the only real
signal. **Anything polling `/health` to decide whether the AI works gets a green light
during a total outage.**

**(b) The fallback boundary follows privacy, not criticality.**

`FallbackProvider` does DeepSeek → Ollama, but only for `interview` and `job_requirements`.
Résumé parse/score, embed, rerank and match-reason are welded to Ollama *structurally* —
`chat_router.py` is never wired to those services, so adding a résumé task to
`DEEPSEEK_TASKS` does nothing. That is a deliberate and well-built privacy guarantee.

**But note the implication:** the two tasks with a hosted fallback are the two that matter
least. Résumé parsing and embeddings — the core product — have no fallback at all. An
Ollama outage removes precisely the capabilities JobFits is sold on.

---

## 2. Backend integration

`AiClient` (`src/infra/ai/ai.client.ts`) is well built: 1 retry on 5xx/timeout/network, 4xx
not retried, per-call timeouts, structured `AiServiceError`, and metrics
(`jobfit_ai_calls_total{operation,outcome}`).

Config defaults (`src/config/ai.config.ts`):

| Var | Default | Note |
|---|---|---|
| `AI_SERVICE_URL` | `http://localhost:8000/api/v1` | ~~absent from `cloudbuild.yaml`~~ wired (§8) |
| `AI_SERVICE_KEY` | `''` | ~~absent~~ wired as a Secret Manager secret (§8) |
| `AI_TIMEOUT_MS_GENERATE` | 60000 | too low — see §3; local is now 250000 |
| `AI_TIMEOUT_MS_EMBED` | 10000 | too low — see §3; local is now 30000 |
| `AI_TIMEOUT_MS_RERANK` | 5000 | ~~shared the generate timeout~~ its own budget (§8) |
| `MATCHING_RERANK_ENABLED` | on | safe to leave on now that rerank has its own timeout |

**Deployment note (not urgent — production is not live).** With `AI_SERVICE_URL` unset, a
deployed backend defaults to `localhost:8000` and every AI call fails `NETWORK`. This is a
release-blocking config line, not a code problem.

---

## 3. What was measured

Run on an **RTX 5050 Laptop (8 GB VRAM), 15.6 GB RAM**, with `qwen3:4b` and `bge-m3`
resident in VRAM.

| Operation | Measured | Against | Result |
|---|---|---|---|
| Résumé parse, cold model | **73.5 s** | 60 s timeout | ❌ every upload failed |
| Résumé parse, timeout raised | **75 s** | 240 s timeout | ✅ `SUCCESS` |
| Embedding, cold model | **11.5 s** | 10 s timeout | ❌ first call after idle failed |
| Embedding, warm | **6.2 s** | 30 s timeout | ✅ |
| `qwen3:4b` cold load + trivial prompt | 43.5 s | — | reasoning model; spends tokens in `thinking` |
| `job/requirements`, warm | 46.0 s | — | groundedness 1.0, nothing hallucinated |
| First `GET /recommendations` | **56 s** | — | cold recompute, reranker **off** |

**The headline finding: the generate timeout was set below the measured cost of the
service's own core task.** Résumé parsing did not fail because of an outage — it failed
because 60 s is not enough time for `qwen3:4b` to parse even a short, clean CV on this
hardware. The model output, when finally allowed to complete, was completely correct: name,
email, phone, all 8 skills, both roles.

### Observed failure chain (before the fix)

```
Ollama /api/chat          → MODEL_TIMEOUT at 60 s   (REQUEST_TIMEOUT_GENERATE=60)
AI service /resume/parse  → 504 in 60.6 s
Backend AiClient          → retry → 504 again
Resume                    → parsingStatus: FAILED   (~121 s total)
```

### A second, unrelated hang

With **Redis stopped**, `POST /resumes` hangs until the client gives up — the upload
enqueues to the BullMQ `resume-parsing` queue and `addJob` blocks retrying the connection.
No error, no status, no log the user could act on. `docker-compose.yml` predicts this
exactly: *"Without it, résumé parsing silently never runs (the queue has no inline
fallback)."*

---

## 4. Local configuration as it now stands

Changes made on 2026-08-25 to get the stack working. **Both `.env` files are gitignored**,
so these are machine-local and must be repeated on any other machine.

**`jobfits-ai-service/.env`** (was an empty 0-byte file — created but never filled):

```
GENERATION_MODEL=qwen3:4b        # config.py defaults to "qwen3", which is NOT installed
REQUEST_TIMEOUT_GENERATE=240     # measured 73.5 s on a SHORT résumé
REQUEST_TIMEOUT_EMBED=30         # 10 s did not survive a cold bge-m3 load (11.5 s)
```

**`jobfit-backend/.env`:**

```
AI_TIMEOUT_MS_GENERATE=250000    # MUST exceed the AI service's, or the backend gives up
                                 # first and the structured MODEL_TIMEOUT never surfaces
AI_TIMEOUT_MS_EMBED=30000
MATCHING_RERANK_ENABLED=false    # stopgap — see §6, item 7
```

**Ollama:** `OLLAMA_KEEP_ALIVE=-1` (user scope). Default is 5 minutes idle, after which the
next embed call pays an 11.5 s cold load against its timeout and fails. Both models resident
uses 3.9 GB of 8 GB, so pinning is comfortable.

**Redis:** `docker compose up -d` in `jobfit-backend`. Required for résumé parsing.

### Verified end-to-end after these changes

```
upload PDF → PENDING → PROCESSING → SUCCESS (parsed by AI, 75 s)
           → profile created → profiles.embedding written ✓
           → GET /recommendations → 50 matches, 57-75%, ranked sensibly
```

Top match 75% STRONG with a real breakdown (`skills 74, location 100, experience 80`). All
366 published jobs are embedded.

---

## 5. Failure behaviour today, per feature

| Feature | On AI failure | Visible to the user? |
|---|---|---|
| Résumé parse | `parsingStatus: FAILED` + error persisted | ✅ on `ResumeResponseDto` |
| Résumé score | heuristic fallback | ✅ `scoredBy: 'heuristic'` |
| Cover letter | template fallback | ✅ `generatedBy: 'template'` — **but the UI does not show it** |
| Interview prep | static questions | ✅ `generatedBy: 'static'` — same |
| Job requirements | skipped, `AI_UNAVAILABLE` | ⚠️ internal only; skill-gap honestly reports `JOB_HAS_NO_REQUIREMENTS` |
| Rerank | falls back to fused order | ⚠️ silent — quality loss, not availability |
| **Screening** | **unaffected — no AI at request time** | ✅ applications keep working |
| **Embeddings** | **silently skipped, permanently** | 🔴 **nothing, anywhere** |
| **Recommendations** | serves stale rows | 🔴 no freshness signal |

### The three real problems

**🔴 Embeddings fail silently and permanently.** `embedTexts` catches `AiServiceError`,
logs a warning, returns nulls. A job ingested during an outage never gets a vector; a
profile edited during one keeps a stale one. No status column, no queue, no backfill
trigger. **That job is invisible to matching forever, and nothing says so.**

**🔴 Recommendations serve stale data as current.** The fallback is correct — better than an
empty page — but the user sees old scores presented as live. `computedAt` and `staleAt` now
exist on the row; they are simply not in the response DTO.

**🟠 Rerank shares the generate timeout and sits on the request path.** Raising the timeout
so parsing works would make a failing rerank cost up to 500 s on a user-facing `GET`. It is
disabled locally as a stopgap. It needs its own short timeout (~5 s, no retry): it is a
+20% MRR quality improvement, not a correctness requirement.

---

## 6. The plan

**Principle: never block a user's action; always block a false claim.**

A job seeker with a deadline is worse off unable to apply than able to apply without a
score. But a template cover letter presented as AI-written, or a three-week-old match shown
as current, costs the only thing that makes the scores worth reading.

### Per feature

| Feature | Default | Reason |
|---|---|---|
| **Résumé parsing** | Block the feature, allow manual entry | A CV cannot be half-read. Already correct — **what is missing is recovery**: a `FAILED` parse is permanent until re-upload. The bytes are in storage and the work is deferrable, so this is where a retry queue belongs. |
| **Recommendations** | Serve stale, **label it** | Never empty, never a spinner. Surface `computedAt` / `stale` — *"Matches from 3 August, refreshing now."* |
| **Screening / applying** | No change | Verified AI-independent. Leave it alone. |
| **Cover letter / interview** | Degrade, **disclose in the UI** | The artefact leaves the product and goes to an employer. `generatedBy` is already returned; the frontend must show it. |
| **Embeddings** | Make the failure visible, retry | Silent permanent invisibility is strictly worse than a visible failure, and it is the only failure with no ceiling on its damage. |

### Where status is surfaced

**Both.** A global banner only when `/health/ready` reports AI degraded — one dismissible
line, which prevents the support tickets. Per-feature inline messaging for what is actually
affected, because a banner cannot tell a user whether *their* CV parsed. **Inline is the one
that must exist.**

Extending the existing `/health/ready` soft-indicator pattern (Redis, mail) to AI is right.
**One hard constraint: do not derive that status from the AI service's `/health`** — it
returns `ok` with the models dead. Read `modelsLoaded`, or better, report from the backend's
own recent call outcomes, which `jobfit_ai_calls_total` already records.

### Sequence

**Now — while it is local:**

1. **Make an AI outage loud in development.** Log at `error`, not `warn`; or fail fast at
   boot when `AI_SERVICE_URL` is set but unreachable. **Production should degrade quietly;
   development should scream.** They behave identically today, and that is the actual bug —
   silent degradation is a production virtue and a development liability.
2. **Fix eval integrity** (see §8 — *appears already done in the working tree*).
3. **Give embeddings a visible state** — `embeddedAt` / `embeddingStatus` on jobs and
   profiles. Locally this answers "why is matching empty"; in production it is the retry
   hook.
4. **Split `/health` from `/ready`** on the AI service — `/ready` returns 503 when the models
   are not loaded. The information is already fetched by the current handler and discarded.

**Before / at deployment:**

5. `AI_SERVICE_URL` + `AI_SERVICE_KEY` into `cloudbuild.yaml`.
6. `ai` as a soft indicator on `/health/ready` (see §8 — *partially done*).
7. Give rerank its own timeout (~5 s, no retry) and re-enable it.
8. The user-facing honesty work: `computedAt`/`stale` on recommendations, `generatedBy` in
   the UI, retry queue for `FAILED` parses.

---

## 7. The new-user case — the gap in the above

**A new user is the only case where every fallback above fails at once**, and the plan as
originally written did not cover them. "Serve stale" is a *returning-user* strategy; a new
user has nothing stale to serve.

Day one, AI down:

1. Register → verify → login — **works** (no AI).
2. Create profile → `embedCandidate` → `/embed` fails → warning logged → **no vector**.
3. Upload CV → `/resume/parse` fails → `parsingStatus: FAILED`.
4. Open recommendations → zero rows → recompute → `denseCandidates` requires
   `p.embedding IS NOT NULL` → **zero candidates** → **empty array, HTTP 200**.

Two possible outcomes, both bad:

- **Empty list.** Indistinguishable from *"no jobs match you."* For a new user in Phnom Penh
  looking at 366 live jobs, that is not a degraded experience — it is a wrong and
  discouraging one.
- **Or worse:** if their headline happens to hit the sparse retriever, they get jobs scored
  with `cosineSim = 0` — arbitrary results with deflated scores, presented as matches.

`JobMatchService` already carries a `skillsScored` flag for exactly this, documented as
*"The UI must say so rather than present a deflated number as fact."* **That flag exists on
the single-job endpoint and not on the recommendations list.**

### What to do about it

**Type the empty state.** Three different situations currently render identically:

| Cause | Should say |
|---|---|
| Profile not embedded yet | *"We're still setting up your matches — usually a minute."* |
| CV could not be read | *"We couldn't read your CV. Add your skills manually and we'll match you now."* |
| Genuinely no matches | *"No jobs match your filters yet."* |

Only the third is about them; the first two are about us, and saying so costs nothing.

**Make onboarding resumable.** The profile embed is a one-shot event listener — if it fails,
nothing retries it, ever. That user stays unmatched permanently even after the AI returns.

**This is the one place worth gating.** Not the application flow. But do not let a new user
reach an empty recommendations page during an outage — hold them at *"setting up your
matches"* with real status, because an honest wait beats a page implying the product has
nothing for them.

**Propagate `skillsScored` to the recommendations DTO.** The honesty flag already exists and
is already documented as required; it is simply not wired to the surface where a new user
meets it first.

---

## 8. Implementation status

**Updated 2026-08-27.** The tree compiles; the whole "Now" sequence is done, and items 5,
7 and 8 landed with it.

| # | Item | Status |
|---|---|---|
| — | `ai-availability.service.ts` + `ai.health-indicator.ts` (were imported but missing — the tree did not compile) | ✅ |
| 1 | AI outages loud in development | ✅ `ai-degradation.logger.ts`, applied at 7 fallback sites |
| 2 | Eval integrity (degraded rows counted and excluded) | ✅ was already done |
| 3 | Embedding visibility | ✅ `embeddingStatus`/`embeddedAt`/`embeddingError`, migration applied |
| 4 | `/ready` on the AI service | ✅ `OLLAMA_UNREACHABLE` vs `MODEL_NOT_INSTALLED`, names the missing model |
| 5 | AI config in `cloudbuild.yaml` | ✅ wired; `_AI_SERVICE_URL` intentionally blank until the service is deployed |
| 6 | `ai` on `/health/ready` | ✅ soft indicator, verified live against a dead AI service |
| 7 | Rerank's own timeout | ✅ `AI_TIMEOUT_MS_RERANK=5000`; rerank re-enabled locally |
| 8 | `computedAt` / `stale` on recommendations | ✅ backend side; the UI still has to show it |
| §7 | New-user empty state | ✅ `GET /recommendations/readiness` |

**Verified:** backend 1031 tests / 91 suites, 0 type errors, lint clean; AI service 66
tests. `/health/ready` was exercised against a genuinely-down AI service and returned
HTTP 200 in 0.59 s with `ai.degraded: true`, `reason: NETWORK`.

### Still to do

- **The frontend half of item 8 and §7.** The backend now reports `computedAt`, `stale`,
  `generatedBy` and a typed readiness state. Nothing renders any of them yet, so a user
  still cannot tell a template cover letter from a written one, or a stale match from a
  fresh one.
- **A retry for failed embeddings.** `EMBEDDING_FAILED` is now visible and the readiness
  endpoint tells the user to update their profile to re-fire it — but nothing retries on
  its own. Same for `parsingStatus: FAILED`.
- **`skillsScored` on the recommendations list.** `JobMatchService` carries it for the
  single-job endpoint; the list still does not, so a score computed with no embedding is
  presented like any other.

### ⚠️ Migration drift in the shared database

`prisma migrate status` reports a migration applied to the shared Supabase database that
exists **on no local branch**:

    20260825120000_match_report_payload_version

Someone applied it from a working tree whose migration file was never committed. The
shared dev database therefore has a schema change nobody can reproduce, and a
`prisma migrate reset` would lose it. Not touched here — it needs whoever made it.

## 9. Open questions

**Should `cover_letter` and `interview_feedback` join the DeepSeek allowlist?** Both are in
`KNOWN_TASKS` but excluded from the default allowlist, and both carry user-authored content.
Right now the *paid* features have a hosted fallback and the free ones do not, which is
backwards from a resilience standpoint. It is a privacy decision.

**How long should a `FAILED` parse keep retrying?** A retry queue needs a ceiling. Three
attempts over an hour is a different product promise from a day — and it determines whether
the message says *"we'll try again"* or *"enter it by hand"*.

**Is a stale match still worth showing after a week?** *"Matches from 3 August"* is honest at
two days. At three weeks it may be worse than an empty state with an explanation.

---

## Appendix — running the stack locally

```powershell
# 1. Redis (required for résumé parsing)
cd C:\Users\ROG\Desktop\jobfit\jobfit-backend
docker compose up -d

# 2. AI service
cd C:\Users\ROG\Desktop\jobfit\jobfits-ai-service
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000

# 3. Backend
cd C:\Users\ROG\Desktop\jobfit\jobfit-backend
pnpm run start:dev
```

Ollama starts itself. Models: `ollama pull bge-m3` and `ollama pull qwen3:4b`.

**`bge-m3` is not substitutable** — the pgvector column is `vector(1024)`, sized for it.
`chat_provider.py` says so explicitly: a provider swap there *"would invalidate every stored
embedding rather than degrade politely."*

**Health check that actually means something:**

```
curl http://127.0.0.1:8000/api/v1/health
→ {"status":"ok","modelsLoaded":["qwen3:4b","bge-m3:latest"]}
```

`status: ok` alone proves nothing. **Check that `modelsLoaded` lists both models.**

If résumé parsing hangs rather than fails, check Redis first — that failure mode looks like
nothing at all.
