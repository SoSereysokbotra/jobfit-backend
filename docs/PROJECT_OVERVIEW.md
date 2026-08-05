# JobFits — Complete Project Overview (start-from-zero brief)

> **Read this first.** It explains the entire project to someone who knows nothing about it:
> what JobFits is, everything that's been built, every measured result, how to run it, and what's
> left. Task-specific handoffs live beside it (`RAG_PHASE_C_HANDOFF.md`, `RAG_PHASE_D_HANDOFF.md`);
> this file is the map they hang off.

---

## 1. What JobFits is

A **job-matching platform** for job seekers and employers. Its AI features: résumé parsing,
résumé scoring (ATS + quality), **semantic job matching / recommendations**, cover-letter
generation, and interview coaching. The project's real goal (per `jobfits-ai-service/docs/jobfits-rag-plan.md`)
was not "add AI" — it was to turn matching from *"plausible but never validated"* into a system
whose quality is **measured, defensible, and improvable.**

## 2. Three repos (Windows; PowerShell + Git Bash)

| Repo | Path | Stack | Role |
|---|---|---|---|
| **Frontend** | `D:\Year2\Jobfit\jobfit-frontend` | Next.js 15 | UI (`:3000`) |
| **Backend** ⭐ | `D:\Year2\Jobfit\jobfit-backend` | NestJS + DDD + Prisma + Postgres (Supabase) | **All matching, both eval harnesses, and the DB schema. The center of gravity.** (`:4000`, prefix `/api/v1`) |
| **AI service** | `D:\Year2\Jobfit\jobfits-ai-service` | FastAPI, **stateless, no DB** | Model serving only (`:8000`). Calls **Ollama** on `:11434`. |

**Architecture reality (important):** the RAG plan originally implied the matching pipeline lived
in the AI service. It does **not**. The AI service is a stateless model-serving layer
(`/embed`, `/resume/parse|score`, `/generate/*`, `/rerank`, `/match/reason`, `/health`). **All
matching, pgvector, and Prisma live in the backend.** Data flow:
`Frontend → Backend → AI service → Ollama`.

## 3. The two bodies of work

**(A) AI feature integration — Phases 0–4.** Make the advertised AI features real, each with a
heuristic fallback so nothing hard-fails when the AI/GPU is down.

**(B) The RAG evaluation project — Phases A–D.** Make matching quality *measured*. This is the
intellectually hard part and the portfolio centerpiece.

## 4. Status at a glance

| Phase | What | Status |
|---|---|---|
| 0 | `AiModule` — typed, resilient HTTP client backend→AI service | ✅ done |
| 1 | Résumé parsing via Qwen (+ regex fallback, `parsedBy`) | ✅ done |
| 2 | Résumé scoring via AI (tier-gated suggestions) | ✅ done |
| 3 | Semantic matching — pgvector embeddings + scorers + `/recommendations` | ✅ done |
| 4 | Generation — cover letters + interview coaching (tier-gated) | ✅ done |
| **A** | **Eval harness** — hand-labeled ground truth + retrieval metrics | ✅ done |
| **B** | **Retrieval upgrades** — hybrid + reranker + pre-filter, each measured | ✅ done |
| **C** | **Generation quality** — structured match-reasoning + calibration/faithfulness | ✅ done (result was **negative** — see §6) |
| **D** | **Productionize** — vLLM, Redis cache, cost table, feedback loop | ⛔ not done — **needs the GPU box** |

**Bottom line: everything buildable on this laptop is done.** Phase D's core requires a GPU box
(full `qwen3` + vLLM), so it is hardware-blocked, not effort-blocked. Stopping here is a
legitimate, complete outcome.

## 5. The measured results (the actual deliverable)

**Retrieval** (hand-labeled eval, current set = 3 candidates / 150 labels, 51 English jobs):
- Baseline (hybrid, no rerank/filter): **Recall@10 0.511 · MRR@10 0.667 · nDCG@10 0.648**.
- **LLM reranker: MRR 0.63 → 0.75 (+20%)** — the headline win. Kept **off in prod** (adds an LLM
  call per user; that's a Phase-D cost decision).
- Hybrid BM25+RRF: **neutral** on this 51-job corpus (kept; pays off at scale). ON by default.
- Metadata pre-filter: **trades ~11% recall for +25% MRR** → recall wins, kept **off** by default.

**Generation** (`/match/reason`, 150 pairs, two prompt versions):
- Calibration (Spearman ρ of LLM `fitScore` vs human grade): **v1 = 0.137, v2 = −0.065** —
  i.e. *randomly around zero*. Faithfulness (verbatim): 5.9% → 16.9% (partly evasion).
- **Conclusion: `qwen3:0.6b` cannot produce a trustworthy match score.** Prompt-tuning didn't fix
  it → points at model capacity. `/match/reason` is **not fit for any user-facing path** yet.
- Full write-up: `eval/reports/BASELINE-GENERATION-2026-08-05.md`.

**Why the negative result is a feature, not a failure:** the harness caught an untrustworthy model
*before* it shipped. That "the bad number is the deliverable" discipline is the whole point of the
project.

## 6. Current data/eval caveats (read before trusting any number)
- **n = 3 candidates is thin** — the single biggest threat to every number. More labels beats more
  prompt tuning as the next investment.
- **Corpus is 51 PUBLISHED jobs, all English** (TheMuse import). **No Khmer jobs exist**, so the
  language slice cannot show the Khmer gap — a data problem, not code.
- Class imbalance: 111 BAD / 26 GREAT / 13 OK.
- Everything above is **real-model evidence** (real `bge-m3` + real `qwen3:0.6b`). The jest/pytest
  suites are mocked (fast CI); the **eval runs** are the evidence.

## 7. How to run it (all backend commands from `jobfit-backend`)

**Prereqs:** Ollama running (`ollama serve`) with `bge-m3` + `qwen3:0.6b`. Start the AI service:
```
# from jobfits-ai-service, Ollama up:
GENERATION_MODEL=qwen3:0.6b AI_SERVICE_KEY=change-me .venv/Scripts/python.exe -m uvicorn app.main:app --port 8000
```
Redis (only for the résumé-parse queue, not eval): `docker start jobfit-redis`.

**Eval harnesses:**
```
# Retrieval (writes eval/reports/<ts>.md)
npx ts-node -r tsconfig-paths/register scripts/eval-retrieval.ts            # hybrid (default)
npx ts-node -r tsconfig-paths/register scripts/eval-retrieval.ts 10 rerank  # + reranker (AI service up)
npx ts-node -r tsconfig-paths/register scripts/eval-retrieval.ts 10 filter  # + pre-filter

# Generation (AI service up; ~25–35 min for 150 pairs on the laptop)
npx ts-node -r tsconfig-paths/register scripts/eval-generation.ts           # default prompt
npx ts-node -r tsconfig-paths/register scripts/eval-generation.ts v=v1      # specific version
npx ts-node -r tsconfig-paths/register scripts/eval-generation.ts limit=6 c=3  # smoke run
```
**Labeling** (add candidates): `eval-export-worksheet.ts` → hand-label the `eval/worksheets/<userId>.jsonl`
(set `"?"` → great/ok/bad) → `eval-load-labels.ts <file>` → `eval-tag-labels.ts`.

**Environment gotchas:**
- **Full `qwen3` is unusable on this laptop** (too slow / 500s). Always `qwen3:0.6b` locally.
- After a `schema.prisma` change: hand-write the migration SQL + `npx prisma migrate deploy` (never
  `migrate dev`), then `npx prisma generate` — which **fails with EPERM if the backend dev server is
  running** (stop it first, port 4000).
- The AI service on :8000 gets orphaned across sessions — `curl localhost:8000/api/v1/health` first.
- AI-service **prompt `.txt` files are `lru_cache`d** — restart the service after editing one.
- LF→CRLF git warnings on Windows are harmless.

## 8. Key files
- **Retrieval/matching:** `src/modules/matching/application/use-cases/recompute-user-matches.use-case.ts`
  (`retrieveRankedJobs` = the single retrieval query both prod and the harness use; `execute` writes
  `recommendations`). Scorers: `src/modules/matching/domain/scoring/*`.
- **Eval harnesses:** `src/modules/matching/evaluation/` — `metrics.ts` (Recall/MRR/nDCG +
  `spearman`/`pearson`/`rankWithTies`), `retrieval-eval.service.ts`, `generation-eval.service.ts`,
  `eval-set.loader.ts`, `job-slices.ts`. Scripts: `scripts/eval-*.ts`. Docs: `eval/README.md`.
- **AI client:** `src/infra/ai/ai.client.ts` + `ai.types.ts` — `embed/parseResume/scoreResume/
  generateCoverLetter/generateInterview/rerank/matchReason`.
- **AI service:** `app/routers|services|schemas|prompts/*`. `/match/reason` + `/rerank` are the
  newest — mirror their pattern for anything new.
- **Prisma:** `prisma/schema.prisma` — `MatchLabel` (eval ground truth), `Recommendation`,
  `Job`/`Profile` with `embedding vector(1024)` + `Job.searchTsv tsvector`.
- **Docs:** `docs/RAG_PHASE_C_HANDOFF.md`, `docs/RAG_PHASE_D_HANDOFF.md` (task handoffs),
  `jobfits-ai-service/docs/jobfits-rag-plan.md` (plan of record).

## 9. What's open (all optional; none blocks "done")
- **Phase D** — needs the GPU box: Step 0 = re-run the generation harness on full `qwen3` (decides
  if `/match/reason` is rescuable), then vLLM serving + Redis cache + cost/latency table + the
  feedback loop (👍/👎 → `match_labels` `source=FEEDBACK`).
- **Cheap, high-value, no GPU:** label more candidates (n=3 → more); add real `seniority`/`category`
  columns on `Job` + language detection; get **Khmer jobs** into the corpus (the project's most
  interesting research angle).
- **C4:** LLM-judge / Ragas to close the verbatim-faithfulness blind spot (the Python eval belongs here).
- **Ship the reranker** to real users (a cost decision) / try a proper cross-encoder (BGE-reranker-v2).
- **Stale doc:** `docs/PROJECT_PHASES.md` still shows B in progress / C not started.

## 10. Git state
Both repos on `main`, **committed, NOT pushed**. Latest commit `e349f25` (Phase D handoff).
Tests green: **backend 156/156 jest + `tsc` clean; AI service 32/32 pytest**. Run both before any commit.

---

*One sentence to keep: **retrieval is the quality-and-cost lever; the eval harness is the credibility;
the honest negative on generation is the proof you measured instead of guessed.***
