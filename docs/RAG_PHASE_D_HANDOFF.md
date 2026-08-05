# JobFits RAG Project — Handoff for Phase D (new-chat brief)

> Paste this whole file into a new chat. It is self-contained — assume the reader knows
> nothing about this project.
> Goal: **turn JobFits' matching from "plausible but unvalidated" into a system whose quality
> is measured, defensible, and improvable.** Plan of record:
> `jobfits-ai-service/docs/jobfits-rag-plan.md` (§7 generation, §8 evaluation, §10 phases).

---

## 0. The one thing to internalize
**Every change must be checked against the eval harness — prove the number moved, don't guess.**
Measure retrieval and generation *separately*. Never ship a match number you can't defend.
A phase that produces no metric is not finished.

**Corollary that Phase C earned the hard way:** when the harness returns a bad number, the
bad number is the deliverable. Do not tune until it looks good. Two of the three defects found
in Phase C were in *our own prompts*, and the harness only caught them because nobody was
allowed to round the result up.

## 1. Repos, stack, machine (Windows / PowerShell + Git Bash)
- **Backend** (the focus): `D:\Year2\Jobfit\jobfit-backend` — NestJS + DDD + Prisma + Postgres
  (Supabase). **All matching, both eval harnesses, and the Postgres schema live here.**
  Node 22, `npx tsc` / `npx jest`.
- **AI service**: `D:\Year2\Jobfit\jobfits-ai-service` — **FastAPI, STATELESS, no DB.** Only
  model-serving endpoints (`/embed`, `/resume/parse|score`, `/generate/*`, `/rerank`,
  `/match/reason`, `/health`). Python venv at `.venv`, pytest + respx. Calls **Ollama** on
  `localhost:11434`.
- **Frontend**: `D:\Year2\Jobfit\jobfit-frontend` — Next.js (not needed for Phase D).
- ⚠️ **Architecture reality:** the RAG plan's §4–§5 originally implied matching lived in the AI
  service — it does NOT. AI service = stateless models; backend = matching + Prisma.

## 2. Local environment / how to run things
- **Ollama** must be running (`ollama serve` or the app) with `bge-m3` (embeddings) and
  `qwen3:0.6b` (generation/rerank/match-reason). **Full `qwen3` is unusable on this laptop**
  (too slow) — always `qwen3:0.6b` locally; the full model needs the GPU box.
- **Start the AI service** (from `jobfits-ai-service`, Ollama up):
  ```
  GENERATION_MODEL=qwen3:0.6b AI_SERVICE_KEY=change-me .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
  ```
  Backend `.env`: `AI_SERVICE_URL=http://localhost:8000/api/v1`, `AI_SERVICE_KEY=change-me`.
- **Redis** (BullMQ) via `docker start jobfit-redis` — needed for the résumé-parse queue, not
  for eval. Eval runs log a harmless `ECONNREFUSED 127.0.0.1:6379` when it's down.
- **Gotchas:**
  - After a `schema.prisma` change: hand-write the migration SQL + `npx prisma migrate deploy`
    (NOT `migrate dev`), then `npx prisma generate`. **`prisma generate` fails with EPERM if
    the backend dev server is running** — stop it first (port 4000).
  - LF→CRLF git warnings on Windows are harmless.
  - The AI service on :8000 gets orphaned across sessions — check
    `curl localhost:8000/api/v1/health` before blaming anything else.
  - **Prompt files are `lru_cache`d.** Editing a `.txt` prompt does nothing until the AI
    service is restarted. This silently invalidated one measurement already.

## 3. What's DONE (scorecard, plan §12)
| Stage | Metric | Status |
|---|---|---|
| Retrieval | Recall@10 / MRR@10 / nDCG@10, sliced | ✅ done |
| Generation | Faithfulness (groundedness) | ✅ done — **and the answer was negative** |
| Generation | fitScore ↔ human-label correlation | ✅ done — **negative** |
| Generation | Answer relevance | 🟡 partial (requirement groundedness only; LLM-judge = C4) |
| Serving | p50/p99 latency; cost/1k; cache hit | ❌ **Phase D — NEXT** |
| Loop | metric moved by 1 feedback iteration | 🟡 partial (moved MRR via reranker) |

- **Phases 0–4 (AI feature integration)** — done: AiModule client, résumé parse, résumé score
  (tier-gated), semantic matching (pgvector), generation (cover letter/interview).
- **Phase A (eval harness)** — done. `MatchLabel` table, JSONL eval set, Recall@k/MRR@k/nDCG@k
  (GREAT=2/OK=1/BAD=0), sliced by category/seniority/language with per-slice `n`. Reuses the
  **real** retrieval query (`RecomputeUserMatchesUseCase.retrieveRankedJobs`).
- **Phase B (retrieval)** — done, each measured:
  - **Hybrid** (BM25 `tsvector` + RRF) — **ON** by default. Neutral on the 51-job corpus.
  - **LLM reranker** (`/rerank`) — **OFF** by default. Measured **MRR 0.63 → 0.75 (+20%)**.
  - **Metadata pre-filter** — **OFF** by default. Trades ~11% recall for +25% MRR; recall wins.
- **Phase C (generation)** — done, see §4. **Result was negative. Read §4 before Phase D.**

## 4. ⚠️ Phase C result — READ THIS BEFORE PRODUCTIONIZING ANYTHING
`POST /match/reason` returns structured reasoning:
`{ fitScore, matchedRequirements[{requirement, evidenceFromCv}], gaps[], verdict, promptVersion, degraded }`.
It was measured on all 150 labeled pairs with **two** prompt versions:

| Metric | v1 | v2 (current default) |
|---|---|---|
| Calibration — Spearman ρ (pooled) | 0.137 | **−0.065** |
| Faithfulness (verbatim, micro) | 5.9% | **16.9%** |
| Evidence quotes claimed | 808 (over 148 pairs) | 166 (over 67 pairs) |
| Requirement groundedness | 87.7% | 89.2% |

| mean fitScore | BAD | OK | GREAT |
|---|---|---|---|
| v1 | 0.734 | 0.922 | 0.815 |
| v2 | 0.199 | 0.146 | 0.150 |

**Conclusion: `/match/reason` is NOT fit for any user-facing path at either version.**
- v1 called **88 of 111** BAD-graded jobs `"strong"` — no discrimination.
- v2 fixed the verdict spread but **inverted the score ordering** (BAD 0.199 > GREAT 0.150).
- v2's faithfulness gain is partly **evasion**: 82 of 150 pairs produced *zero* matched
  requirements. 16.9% of 166 claims is not "3× better" than 5.9% of 808.
- **28 of v2's 138 ungrounded quotes are the prompt's own few-shot example**, copied verbatim
  even though it was deliberately set in an unrelated domain (pastry chef). This model copies
  examples regardless of domain.
- 5 quotes were the literal placeholder `No evidence provided`.

Full read, confounds and caveats: **`eval/reports/BASELINE-GENERATION-2026-08-05.md`**.

**The load-bearing inference:** calibration moved 0.137 → −0.065 across two prompt versions —
i.e. *randomly around zero*. That points at **model capacity, not prompting**. Treat
`qwen3:0.6b` as unable to produce a user-facing fitScore.

## 5. Current eval state (READ THIS before trusting any number)
- **Eval set: 3 candidates / 150 labels**, in the `match_labels` table. Slice tags auto-filled
  by `evaluation/job-slices.ts`.
- **Corpus: 51 PUBLISHED jobs, all English** (imported from TheMuse). ⚠️ **No Khmer jobs exist**,
  so the language slice cannot show the Khmer gap — a data problem, not a code problem.
- **Class imbalance:** 111 BAD / 26 GREAT / 13 OK. ρ is sensitive to the small positive classes.
- **Retrieval baseline (hybrid, no filter/rerank, n=3): Recall 0.511 / MRR 0.667 / nDCG 0.648.**
- **All of the above is REAL-model evidence** (real bge-m3 + real qwen3:0.6b). The pytest/jest
  suites are respx/jest-mocked for fast CI; the *eval runs* are the evidence.
- **n = 3 candidates is thin. More labels beats more prompt tuning as the next investment.**

## 6. How to run both harnesses (all from `jobfit-backend`)
```bash
# Labeling (once per new candidate): worksheet -> hand-label -> load -> tag
npx ts-node -r tsconfig-paths/register scripts/eval-export-worksheet.ts
npx ts-node -r tsconfig-paths/register scripts/eval-load-labels.ts eval/worksheets/<userId>.jsonl
npx ts-node -r tsconfig-paths/register scripts/eval-tag-labels.ts

# RETRIEVAL eval (writes eval/reports/<ts>.md)
npx ts-node -r tsconfig-paths/register scripts/eval-retrieval.ts            # hybrid (default)
npx ts-node -r tsconfig-paths/register scripts/eval-retrieval.ts 10 rerank  # + LLM reranker
npx ts-node -r tsconfig-paths/register scripts/eval-retrieval.ts 10 filter  # + metadata pre-filter

# GENERATION eval (needs AI service up; writes eval/reports/generation-<v>-<ts>.md + .json)
npx ts-node -r tsconfig-paths/register scripts/eval-generation.ts             # default prompt
npx ts-node -r tsconfig-paths/register scripts/eval-generation.ts v=v1        # a specific version
npx ts-node -r tsconfig-paths/register scripts/eval-generation.ts limit=6 c=3 # smoke run
```
Generation runs take **~25–35 min** for 150 pairs on the laptop (~30s/pair at concurrency 4).

**Reading a generation report:**
- Ties cap ρ **below 1** (grades take 3 values; a perfect ordering scores ≈0.95). Compare
  versions to each other, never to 1.0.
- **ρ = 0 also means "undefined"** (constant series). Always read it with `n`.
- **Faithfulness is verbatim-only** — it proves a quote *exists* in the CV, not that it
  *supports* the requirement it was attached to. A real quote about *AWS ECS* passed against a
  *Kubernetes* requirement. Treat it as an **upper bound**. Closing this = C4 (LLM-judge/Ragas).
- **`degraded: true`** = the AI service's deterministic fallback fired (LLM failed twice). Those
  rows are excluded from every metric. **A high degraded count invalidates the run.**

## 7. Key files
- **Retrieval + matching:** `src/modules/matching/application/use-cases/recompute-user-matches.use-case.ts`
  (`retrieveRankedJobs` = single source of truth; `execute` writes `recommendations`).
- **Scoring (deterministic):** `src/modules/matching/domain/scoring/*` (skills=cosine 40 /
  exp 25 / loc 15 / salary 10 / other 10).
- **Eval harnesses:** `src/modules/matching/evaluation/` — `metrics.ts` (IR metrics +
  `spearman`/`pearson`/`rankWithTies`), `retrieval-eval.service.ts`,
  **`generation-eval.service.ts`**, `eval-set.loader.ts`, `job-slices.ts`.
  Scripts: `scripts/eval-*.ts`. Docs: **`eval/README.md`**.
- **AI client:** `src/infra/ai/ai.client.ts` + `ai.types.ts` — `embed / parseResume /
  scoreResume / generateCoverLetter / generateInterview / rerank / matchReason`.
- **AI service:** `app/routers/*`, `app/services/*`, `app/schemas/*`, `app/prompts/*`.
  `/match/reason` is the newest — **mirror its pattern for anything new.**
- **Prisma:** `prisma/schema.prisma` — `MatchLabel`, `Recommendation`, `Job`/`Profile` with
  `embedding vector(1024)` + `Job.searchTsv tsvector`.

## 8. Git state (both repos on `main`, committed, NOT pushed)
- backend: `27a75c7` (C3 comparison) ← `2bccf62` (generation eval harness + v1 baseline)
  ← `52f4cee` ← `5a3b9da` ← `4c32c13`.
- ai-service: `fec56f5` (v2 default + C3 record) ← `a7f574f` (/match/reason) ← `347231b` (/rerank).
- Working trees clean. **Tests green: backend 156/156 jest + `tsc` clean; AI service 32/32 pytest.**
  Keep them green — run both before every commit.

---

# 9. WHAT TO DO NEXT

## Step 0 (do this FIRST — it decides what Phase D even means)
**Run the existing generation harness against full `qwen3` on the GPU box.** Change nothing
else: same 150 pairs, same prompts, same script. One run, no new code.
```
GENERATION_MODEL=qwen3 ... uvicorn app.main:app --port 8000     # on the GPU box
npx ts-node -r tsconfig-paths/register scripts/eval-generation.ts v=v2
npx ts-node -r tsconfig-paths/register scripts/eval-generation.ts v=v1
```
- **If calibration becomes usable** (ρ meaningfully positive, GREAT > OK > BAD in mean
  fitScore): generation is rescued, Phase D proceeds as the plan writes it.
- **If ρ stays near zero:** the ceiling is not the model size either, and `/match/reason`
  should be shelved rather than served. Phase D then optimizes retrieval serving only.

**Do not write a v4 prompt before this run.** Two prompt versions already moved calibration
randomly around zero. (A cheap **v3** — drop the literal few-shot example, and reject
`No evidence provided`-style placeholders at the schema level rather than by instruction — is
worth *one* run for faithfulness, but it will not fix calibration.)

## Phase D — productionize the AI path (plan §10 steps 8–9)
**D1 — Serving + cost/latency table (step 8).**
- Swap Ollama → **vLLM** for the generation model; keep the AI service's HTTP contract
  identical so nothing in the backend changes.
- Add **Redis caching** (closes a standing prod gap): cache embeddings and `/match/reason`
  results keyed by a hash of the input text + `promptVersion`. `promptVersion` **must** be in
  the cache key or a prompt change will silently serve stale reasoning.
- Deliverable: a **cost/latency table** — p50/p99 per stage (retrieve, rerank, generate),
  cost per 1,000 matches on Ollama vs vLLM, and cache hit rate. Current laptop figures for
  `/match/reason` (mean ~33s, p99 ~100s at concurrency 4, qwen3:0.6b) are *indicative only* —
  do not reuse them as a serving baseline.
- ⚠️ **Watch the quadratic trap** (plan §9): never call the LLM on every candidate × every job.
  Retrieval narrows to ~10 per candidate *before* the LLM sees anything.

**D2 — Close the feedback loop (step 9).**
- Wire user thumbs-up/down → `match_labels` with `source=FEEDBACK` (the enum already exists
  alongside `HUMAN`).
- Then **show one feedback-driven iteration that moved a metric** — that's the actual
  deliverable, not the plumbing.
- Keep FEEDBACK and HUMAN labels distinguishable in reports; they are not equally trustworthy.

**D3 — Data-quality debts (parked here by the plan).**
- Add real queryable **`seniority`** and **`category`** columns on `Job` + a language-detection
  step. The eval-file slice tags are a Phase-A stopgap.
- **Get Khmer jobs into the corpus.** Until then the language slice cannot show the Khmer gap,
  which is the project's most interesting research angle (plan §14).
- **Label more candidates.** n=3 is the single biggest threat to every number in this document.

## Still open outside A–D
- **C4 — LLM-judge / Ragas** for the verbatim-faithfulness blind spot (§6). This is where the
  fuller Python eval belongs.
- **Phase B leftovers:** ship the reranker to real users (a cost decision), try a proper
  cross-encoder (BGE-reranker-v2 / Qwen3-Reranker) instead of the listwise LLM.
- **Stale doc:** `docs/PROJECT_PHASES.md` still shows B in progress and C not started.

## 10. Working agreements that produced the good results
1. **Never report a number without `n` and its caveats.** Every report has a Caveats section;
   keep it.
2. **Versioned prompts are added, never edited in place** — an old measurement must stay
   reproducible. Prompt files are `lru_cache`d: restart the service after any change.
3. **The default prompt version is the best-*measured* one, not the newest.**
4. **A/B on the same 150 pairs, or it isn't a comparison.**
5. **Suspect your own prompt first.** Two of Phase C's three defects were self-inflicted
   (few-shot example leakage, and a placeholder the instructions invited).
6. Run `npx jest` + `npx tsc --noEmit` (backend) and `pytest` (AI service) before committing.
