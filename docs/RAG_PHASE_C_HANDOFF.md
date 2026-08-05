# JobFits RAG Project — Handoff for Phase C (new-chat brief)

> Paste this whole file into a new chat (or point the assistant at it). It is self-contained.
> Goal of the project: **turn JobFits' matching from "plausible but unvalidated" into a system
> whose quality is *measured, defensible, and improvable.*** Plan of record:
> `jobfits-ai-service/docs/jobfits-rag-plan.md` (esp. §7 generation, §8 evaluation, §10 phases).

---

## 0. The one thing to internalize
**Every change must be checked against the eval harness — prove the number moved, don't guess.**
Measure retrieval and generation *separately*. Never ship a match number you can't defend.

## 1. Repos, stack, machine (Windows / PowerShell + Git Bash)
- **Backend** (the focus): `D:\Year2\Jobfit\jobfit-backend` — NestJS + DDD + Prisma + Postgres (Supabase).
  **All matching, the eval harness, and the Postgres schema live here.** Node 22, `npx tsc`/`npx jest`.
- **AI service**: `D:\Year2\Jobfit\jobfits-ai-service` — **FastAPI, STATELESS, no DB.** Only model-serving
  endpoints (`/embed`, `/resume/parse|score`, `/generate/*`, `/rerank`, `/health`). Python venv at
  `.venv`, pytest + respx. Calls **Ollama** on `localhost:11434`.
- **Frontend**: `D:\Year2\Jobfit\jobfit-frontend` — Next.js (not needed for Phase C).
- ⚠️ **Architecture reality** (the RAG plan's §4–§5 originally implied matching lived in the AI service —
  it does NOT). AI service = stateless models; backend = matching + Prisma. Docs §4–§5 already corrected.

## 2. Local environment / how to run things
- **Ollama** must be running (`ollama serve` or the app) with models: `bge-m3` (embeddings) and
  `qwen3:0.6b` (generation/rerank). **Full `qwen3` is unusable on this laptop** (500s / too slow) — always
  use `qwen3:0.6b` locally; full model needs the GPU box.
- **Start the AI service** (from `jobfits-ai-service`, Ollama up):
  ```
  GENERATION_MODEL=qwen3:0.6b AI_SERVICE_KEY=change-me .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
  ```
  Backend's `.env` has `AI_SERVICE_URL=http://localhost:8000/api/v1`, `AI_SERVICE_KEY=change-me`.
- **Redis** (BullMQ) via `docker start jobfit-redis` — only needed for résumé-parse queue, not eval.
- **Gotchas:**
  - After a `schema.prisma` change: hand-write the migration SQL + `npx prisma migrate deploy` (NOT
    `migrate dev`), then `npx prisma generate`. **`prisma generate` fails with EPERM if the backend
    dev server is running** — stop it first (check port 4000).
  - LF→CRLF git warnings on Windows are harmless.
  - The AI service on :8000 tends to get orphaned across sessions — check `curl localhost:8000/api/v1/health`.

## 3. What's DONE (scorecard, plan §12)
| Stage | Metric | Status |
|---|---|---|
| Retrieval | Recall@10 / MRR@10 / nDCG@10, sliced | ✅ **done** |
| Generation | Faithfulness (groundedness) | ✅ **done** — v1 baseline **5.9%** |
| Generation | fitScore ↔ human-label correlation (calibration) | ✅ **done** — v1 baseline **ρ = 0.137** |
| Generation | Answer relevance | 🟡 partial — requirement groundedness (87.7%); LLM-judge relevance deferred to C4 |
| Serving | p50/p99 latency; cost/1k; cache hit | ❌ Phase D |
| Loop | metric moved by 1 feedback iteration | 🟡 partial (moved MRR via reranker) |

- **Phases 0–4 (AI feature integration)** — done in prior sessions: AiModule client, résumé parse
  (Qwen), résumé score (tier-gated), semantic matching (pgvector), generation (cover letter/interview).
- **Phase A (eval harness)** — done. `MatchLabel` table; human-editable JSONL eval set
  (`jobfit-backend/eval/`); metrics (Recall@k/MRR@k/nDCG@k graded GREAT=2/OK=1/BAD=0), sliced by
  category/seniority/language with per-slice `n`. Reuses the **real** retrieval query
  (`RecomputeUserMatchesUseCase.retrieveRankedJobs`) — a characterization test proved the extraction
  was behavior-preserving.
- **Phase B (retrieval upgrades)** — done, each measured:
  - **Hybrid** (BM25 `tsvector` + RRF fusion) — **ON** (default). Neutral on the 51-job corpus (kept; scales).
  - **LLM reranker** (`/rerank` via qwen3:0.6b, `RetrievalOptions.rerank`) — **OFF** by default.
    Measured **MRR 0.63→0.75 (+20%)**. Off in prod = it adds an LLM call per user (Phase D cost decision).
  - **Metadata pre-filter** (`RetrievalOptions.filter`) — **OFF** by default. Trades ~11% recall for
    +25% MRR → recall wins, so off. Kept as a measurable capability.

## 4. Current eval state (READ THIS before trusting numbers)
- **Eval set: 3 candidates / 150 labels** (was 4/200 on 07-27 — candidate `711f321a`'s labels
  disappeared between sessions; 4 profiles still exist, all embedded). Labels live in the `match_labels`
  table. Slice tags (category/seniority/language) auto-filled by `evaluation/job-slices.ts`.
- **Corpus: 51 PUBLISHED jobs, all English** (imported from TheMuse). ⚠️ **No Khmer jobs exist**, so the
  language slice can't show the Khmer gap yet — it's a data problem, not code.
- **Clean n=3 baseline (hybrid, no filter/rerank): Recall 0.511 / MRR 0.667 / nDCG 0.648.**
  Baseline reports saved in `jobfit-backend/eval/reports/` (also `BASELINE-2026-07-27.md`, the old n=4 one).
- **Everything above was validated against REAL models** (real bge-m3 embeddings + real qwen3:0.6b
  reranker), not just mocks. The pytest/jest suites are respx/jest-mocked (fast CI) — the eval *runs*
  are the real-model evidence.

## 5. How to run the eval harness (all from `jobfit-backend`)
```
# 1. (once) generate content-only labeling worksheets, hand-label, load:
npx ts-node -r tsconfig-paths/register scripts/eval-export-worksheet.ts
npx ts-node -r tsconfig-paths/register scripts/eval-load-labels.ts eval/worksheets/<userId>.jsonl
npx ts-node -r tsconfig-paths/register scripts/eval-tag-labels.ts     # auto-fill slice tags

# 2. run the retrieval eval (prints table + writes eval/reports/<ts>.md):
npx ts-node -r tsconfig-paths/register scripts/eval-retrieval.ts            # hybrid (default)
npx ts-node -r tsconfig-paths/register scripts/eval-retrieval.ts 10 rerank  # + LLM reranker (needs AI service up)
npx ts-node -r tsconfig-paths/register scripts/eval-retrieval.ts 10 filter  # + metadata pre-filter
```

## 6. Key files (Phase C will touch / reuse these)
- **Retrieval + matching:** `src/modules/matching/application/use-cases/recompute-user-matches.use-case.ts`
  (`retrieveRankedJobs` = single source of truth; `execute` writes `recommendations`).
- **Scoring (deterministic):** `src/modules/matching/domain/scoring/*` (skills=cosine 40 / exp 25 /
  loc 15 / salary 10 / other 10) — this is the CURRENT "generation" stand-in (arithmetic, no LLM reasoning).
- **Eval harness:** `src/modules/matching/evaluation/` — `metrics.ts`, `eval-set.loader.ts`,
  `retrieval-eval.service.ts` (+ `formatReportMarkdown`), `job-slices.ts`. Scripts in `scripts/eval-*.ts`.
- **AI client:** `src/infra/ai/ai.client.ts` (+ `ai.types.ts`) — has `embed/parseResume/scoreResume/
  generateCoverLetter/generateInterview/rerank`. **Add `matchReason()` here for Phase C.**
- **AI service:** `app/routers/*`, `app/services/*`, `app/schemas/*`, `app/prompts/*`. `/rerank` is the
  newest — **mirror its pattern for the Phase C `/match/reason` endpoint.**
- **Prisma:** `prisma/schema.prisma` — `MatchLabel` (eval ground truth), `Recommendation`, `Job`/`Profile`
  with `embedding vector(1024)` + `Job.searchTsv tsvector`.
- **Memory (auto-loads in new chat):** `phase-a-eval-harness-done.md`, `ai-service-stateless-matching-in-backend.md`,
  `phase3-semantic-matching-design.md`, `qwen3-full-unusable-on-laptop.md`, `bge-m3-embedding-dim-1024.md`.

## 7. PHASE C — what to build next (generation quality)
Plan §7/§8/§10 step 6–7. Do it in slices, each ending in a measured number.

**Slice C1 — structured match-reasoning endpoint (AI service).** Mirror `/rerank`.
- `POST /match/reason` — input `{ candidateSummary, jobTitle, jobDescription }`, output validated JSON:
  ```json
  { "fitScore": 0.0, "matchedRequirements": [{"requirement": "...", "evidenceFromCv": "..."}],
    "gaps": [{"requirement": "...", "note": "..."}], "verdict": "strong|possible|weak" }
  ```
- Pydantic-validate, `json_repair` fallback, retry once, deterministic fallback. Prompt must instruct:
  **cite evidence ONLY from the provided CV/JD text** (this is what faithfulness will check).
- Files: `app/schemas/match_reason.py`, `app/prompts/match_reason.txt`, `app/services/match_reason_service.py`,
  `app/routers/match_reason.py`, register in `app/main.py`, `tests/test_match_reason.py` (respx-mocked).
- Backend: add `aiClient.matchReason(...)` + types.

**Slice C2 — generation eval (reuse `match_labels` as ground truth!).**
- New `src/modules/matching/evaluation/generation-eval.service.ts` + `scripts/eval-generation.ts`.
- For each labeled (candidate, job) pair: build candidate text (reuse `loadCandidate`/résumé) + job text,
  call `/match/reason`, then compute:
  - **Calibration** — rank correlation (Spearman) of the LLM `fitScore` vs the human label grade
    (GREAT=2/OK=1/BAD=0). This is THE number that says whether the LLM's judgment is trustworthy.
  - **Faithfulness** — fraction of `matchedRequirements[].evidenceFromCv` that actually appears
    (case-insensitive substring / token overlap) in the candidate text. Catches invented skills.
  - (optional) answer relevance.
- Print a report like the retrieval one (stdout + `eval/reports/`); document caveats + `n`.
- **The user wants the fuller Ragas/Python eval here too** ("Phase C is where Ragas belongs") — a
  simple TS version using `match_labels` is a great first measured result; Ragas can layer on later.

**Slice C3 — iterate, versioned.** Log a `prompt_version` with outputs; change the prompt, re-measure,
prove the number moved. (This is the flywheel discipline.)

### Phase C status (2026-08-05)
- **C1 done** — `POST /match/reason` on the AI service (versioned prompts, retry-once,
  deterministic `degraded` fallback that claims no evidence) + `aiClient.matchReason()`.
- **C2 done** — `evaluation/generation-eval.service.ts` + `scripts/eval-generation.ts`.
  **First baseline: ρ = 0.137, faithfulness 5.9%** on 150 pairs — see
  `eval/reports/BASELINE-GENERATION-2026-08-05.md` for the full read and caveats.
  **Conclusion: v1 generation is not shippable** (the model called 88 of 111 BAD jobs "strong").
- **C3 in progress** — prompt v2 re-measure.
- **C4 (new, from what C2 exposed)** — faithfulness is verbatim-only: it proves a quote is
  in the CV, not that it *supports* the requirement it was attached to (a real quote about
  AWS ECS passed against a Kubernetes requirement). Closing that needs an LLM-judge — this
  is where **Ragas** belongs.
- **Open question for Phase D:** if calibration stays ≈0.14 across prompt versions, the
  blocker is model capacity, not prompting → run the comparison on the GPU box with full
  qwen3 before investing further in prompts.

**Then Phase D** (later): vLLM serving, Redis caching (there's a Redis-in-prod gap), cost/latency table,
wire user thumbs-up/down → `match_labels` (source=FEEDBACK). Also: add real queryable `seniority` +
`category` columns on `Job` and a language-detection step (the eval-file slice tags are a Phase-A stopgap).

## 8. Git state (both repos on `main`, committed, NOT pushed)
- backend: latest = `5a3b9da` (pre-filter / Phase B complete); prior `4c32c13` (eval harness + hybrid + reranker).
- ai-service: latest = `347231b` (/rerank + docs).
- Working trees clean. Tests green: **backend 46/46 jest, AI service ~23 pytest** (all mocked), `tsc` clean.

## 9. First actions for the new chat
1. Read this file + the auto-loaded memory. Confirm current state (run `git log --oneline -3` in both repos;
   `npx jest src/modules/matching` in backend).
2. Start Ollama + the AI service (§2). Confirm `curl localhost:8000/api/v1/health`.
3. Build **Slice C1** (`/match/reason`), mirroring `/rerank`. Test it live against qwen3:0.6b.
4. Build **Slice C2** and produce the **first calibration + faithfulness numbers** against `match_labels`.
   That's the Phase C deliverable: "the LLM's fitScore correlates X with human labels; faithfulness = Y."
```
