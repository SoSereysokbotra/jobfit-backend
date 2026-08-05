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

## C3 — v1 vs v2 (re-measured on the same 150 pairs)

Raw run: `generation-v2-2026-08-05T01-28-53-820Z.md`. v2 delimits the CV and JOB sections
explicitly and adds an off-domain wrong/right example.

| Metric | v1 | v2 | |
|---|---|---|---|
| Spearman ρ (pooled) | 0.137 | **−0.065** | ⬇ regressed below zero |
| Spearman ρ (per candidate) | 0.148 | −0.071 | ⬇ |
| Faithfulness (micro) | 5.9% | **16.9%** | ⬆ but confounded — see below |
| Evidence quotes claimed | 808 (148 pairs) | 166 (67 pairs) | 5× fewer claims |
| Requirement groundedness | 87.7% | 89.2% | flat |
| Errors / degraded | 0 / 0 | 1 / 0 | |

| mean fitScore | BAD | OK | GREAT |
|---|---|---|---|
| v1 | 0.734 | 0.922 | 0.815 |
| v2 | **0.199** | 0.146 | **0.150** |

### Verdict: keep v2 as the default prompt version, but neither version is usable

- **Calibration got worse, not better.** ρ went 0.137 → −0.065. v2 now scores BAD-graded
  jobs (0.199) *higher* than GREAT (0.150) — the ordering is mildly inverted. The delimiter
  fix addressed which document gets quoted; it had no reason to help discrimination, and
  it didn't.
- **The faithfulness gain is largely "say less".** 82 of 150 pairs produced **zero** matched
  requirements under v2 (vs 2 under v1). Per-claim accuracy rose while the model mostly
  stopped making claims. 16.9% of 166 claims is not 3× better than 5.9% of 808 — it is a
  different, more evasive behaviour.
- **My own prompt example leaked, 28 times.** The v2 wrong/right example was moved to an
  unrelated domain (pastry chef) precisely to make copying obvious. The model copied it
  anyway: `Ran the morning bake at a 200-cover hotel kitchen for three years` appears as
  claimed CV evidence in 28 of 138 ungrounded quotes — **20% of v2's faithfulness failures
  are the prompt's fault, not the model's.**
- **A new evasion appeared:** 5 quotes are the literal string `No evidence provided`. The
  model satisfies "no quote means it is a gap" by writing a placeholder into the evidence
  field instead of moving the item to `gaps`.

v2 is kept as default on the strength of the faithfulness and verdict-distribution movement
(BAD→`weak` went 19/111 → 76/110), but **`/match/reason` must not be wired into any
user-facing path at either version.**

## Next

1. **v3 (cheap, clearly indicated):** delete the verbatim few-shot example — this model
   copies examples regardless of domain — and reject `No evidence provided`-style
   placeholders at the schema level rather than by instruction. Expect faithfulness to rise
   on the same claim volume; expect calibration to stay broken.
2. **The real blocker is model capacity, not prompting.** Two prompt versions moved
   calibration from 0.137 to −0.065 — i.e. randomly, around zero. The next honest
   experiment is the **same harness against full qwen3 on the GPU box**, not a v4 prompt.
   `qwen3:0.6b` should be treated as unable to produce a user-facing fitScore.
3. **C4 (LLM-judge / Ragas)** remains needed for the verbatim-faithfulness blind spot.
