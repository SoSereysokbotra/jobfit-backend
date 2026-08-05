# Generation baseline — prompt v1 (RAG plan Phase C)

The first measured answer to *"is the LLM's reasoning about a (candidate, job) pair
trustworthy?"* Raw run: `generation-v1-2026-08-05T01-07-42-228Z.md` (+ `.json` rows).

- Model: **qwen3:0.6b** via Ollama (laptop). Prompt version **v1**.
- Set: **150 labeled pairs / 3 candidates**, the same `match_labels` ground truth the
  retrieval eval uses. 0 degraded, 0 errors.

## Headline

| Metric | v1 |
|---|---|
| **Calibration** — Spearman ρ (pooled) | **0.137** |
| Spearman ρ (mean per candidate) | 0.148 |
| **Faithfulness** (micro, verbatim quotes) | **5.9%** — 808 quotes checked |
| Faithfulness (macro, per pair) | 6.5% |
| Requirement groundedness (micro) | 87.7% |
| Latency | mean 36.7s · p50 32.8s · p99 98.3s |

| human grade | n | mean fitScore |
|---|---|---|
| BAD | 111 | 0.734 |
| OK | 13 | 0.922 |
| GREAT | 26 | 0.815 |

| human grade | possible | strong | weak |
|---|---|---|---|
| BAD | 4 | 88 | 19 |
| OK | 0 | 13 | 0 |
| GREAT | 0 | 23 | 3 |

## Verdict: v1 generation is NOT shippable

Three findings that corroborate each other:

1. **The fitScore carries almost no human signal.** ρ ≈ 0.14 is near zero. The per-grade
   means show why: BAD averages 0.734 vs GREAT 0.815 — barely separated — and OK (0.922)
   scores *highest*, so the ordering is not even monotonic. **No fitScore from this
   configuration may be shown to a user.**

2. **The model says "strong" to nearly everything.** 88 of 111 BAD-graded jobs were called
   `strong`. That is an absent discrimination ability, not a calibration offset.

3. **Faithfulness 5.9% against requirement groundedness 87.7% localizes the bug.** Both
   output fields are being filled from the *job description*: cited requirements match the
   JD 88% of the time (correct), while "CV evidence" matches the CV only 5.9% of the time.
   The sample quotes confirm it — `Clear and active Psychiatrist License (MD/DO)` and
   `Knowledge of TMS` are JD requirements presented as the candidate's own experience.

Finding 3 is a *prompt* defect and is what **v2** targets (explicitly delimited CV vs JOB
sections + a wrong/right example). Findings 1 and 2 are more likely *model-capacity* limits
that a prompt cannot fix — see the next-step note below.

## Caveats (do not quote the numbers without these)

- **n = 3 candidates / 150 labels, one 51-job English corpus.** Directionally useful,
  statistically thin. More labels beats more prompt tuning as the next investment.
- **Class imbalance:** 111 BAD vs 26 GREAT vs 13 OK. ρ on this shape is sensitive to the
  small positive classes.
- **Ties cap ρ below 1.** Grades take 3 values, so a perfectly ordered set of fitScores
  scores ≈0.95. Compare versions to each other, never to 1.0.
- **Faithfulness is verbatim-only.** It checks a quote *exists* in the CV, not that it
  *supports* the requirement it was attached to. Both v1 and v2 were observed pinning a
  real CV quote about *AWS ECS* to a *Kubernetes* requirement and passing. Treat the number
  as an **upper bound** on trustworthiness; closing the gap needs an LLM-judge (Ragas).
- Latency is a laptop/qwen3:0.6b figure at concurrency 4, inflated by the retry path.
  Indicative only — not a Phase D serving number.

## Next

- **C3:** re-measure with prompt v2 and keep it only if faithfulness actually moves.
- If calibration stays ≈0.14 across prompt versions, the conclusion is that **qwen3:0.6b
  cannot produce a user-facing fitScore at all**, which makes it a model-size question for
  the GPU box rather than a prompting question.
