# Evaluation (RAG plan Phases A & C)

Two harnesses over **one** ground truth (`match_labels`), measured separately because they
fail differently:

| Harness | Question | Script |
|---|---|---|
| **Retrieval** (Phase A) | Did we surface the right jobs? | `scripts/eval-retrieval.ts` |
| **Generation** (Phase C) | Is the model's *reasoning* about a pair trustworthy? | `scripts/eval-generation.ts` |

## Retrieval evaluation (Phase A)

The measuring stick for **retrieval quality** — Recall@10 / MRR@10 / nDCG@10 against
hand-labeled candidate–job pairs, sliced by category / seniority / language.

It reuses the **real production retrieval query**
(`RecomputeUserMatchesUseCase.retrieveRankedJobs`) so the harness can never drift from
what ships. This is Phase A only — no retrieval/LLM changes here, just measurement.

## Files

- `match-labels.jsonl` — the eval set (**source of truth**, hand-edited). One JSON object
  per line. Not committed with real data by default; `match-labels.example.jsonl` shows the
  format.
- `worksheets/<userId>.{md,jsonl}` — generated labeling aids (content-only).
- `reports/<timestamp>.md` — persisted eval reports (one per run, for before/after comparison).

## Label format (one per line)

```jsonc
{"userId":"…","jobId":"…","label":"great","category":"software-eng","seniority":"senior","language":"en","reason":"why"}
```

- `label`: `great` | `ok` | `bad` (case-insensitive). Graded as **GREAT=2, OK=1, BAD=0**.
- `category`, `seniority`, `language`: **hand-set slice tags**. Free text; suggested values:
  category = a job family (`software-eng`, `data`, `design`…), seniority = `intern|entry|mid|senior|lead`,
  language = `en|km`. These are a **Phase-A stopgap** — Phase B adds real queryable columns.
- `reason`, `source` (`human`|`feedback`, default `human`) optional. Blank lines and
  `//` / `#` comments are ignored.

## Workflow

```bash
# 1. Generate a content-only worksheet (candidate + shuffled job summaries, NO scores).
npx ts-node -r tsconfig-paths/register scripts/eval-export-worksheet.ts [userId]

# 2. Label by hand: copy the worksheet's <userId>.jsonl lines into eval/match-labels.jsonl,
#    set "label" to great|ok|bad, add slice tags, delete lines you don't want.

# 3. Load labels into the match_labels table (idempotent).
npx ts-node -r tsconfig-paths/register scripts/eval-load-labels.ts

# 4. Run the evaluation (default k=10). Prints to stdout AND writes eval/reports/<ts>.md.
npx ts-node -r tsconfig-paths/register scripts/eval-retrieval.ts 10
```

## Reading the retrieval report

- **`n`** next to each slice = labeled candidates contributing to it. **Small `n` = too
  sparse to trust** — invest labels there before believing the number.
- **Relevant set = hand-labeled GREAT/OK per candidate** (partial labels; unlabeled
  retrieved items count as non-relevant). A candidate with only BAD labels in a slice isn't
  measurable there (nothing to retrieve) and is excluded from that slice's average.

---

## Generation evaluation (Phase C)

Calls the AI service's `POST /match/reason` for every labeled pair and measures two things
the retrieval metrics cannot see:

- **Calibration** — Spearman ρ between the LLM's `fitScore` and the human grade
  (GREAT=2/OK=1/BAD=0). Answers *"is the model's judgement ordered like a human's?"* — the
  number that decides whether a fitScore may ever be shown to a user.
- **Faithfulness** — the share of `evidenceFromCv` quotes that actually occur in the CV text
  the model was given. Catches invented skills and experience.

Also reported: requirement groundedness (is the cited requirement really in the JD?), the
verdict × grade confusion table, sample ungrounded quotes, and indicative latency.

```bash
# Needs the AI service up (see docs/RAG_PHASE_C_HANDOFF.md §2).
npx ts-node -r tsconfig-paths/register scripts/eval-generation.ts            # prompt v1, all pairs
npx ts-node -r tsconfig-paths/register scripts/eval-generation.ts v=v2       # a different prompt version
npx ts-node -r tsconfig-paths/register scripts/eval-generation.ts limit=6 c=3  # smoke run
```

Writes `reports/generation-<version>-<timestamp>.md` plus a `.json` of the per-pair rows, so
two prompt versions can be diffed pair-by-pair and not only in aggregate.

### Reading the generation report

- **ρ is capped below 1 by ties.** Grades take 3 values, so even a perfectly ordered set of
  fitScores scores ~0.95, not 1.0. Compare versions against each other, not against 1.0.
- **ρ = 0 can mean "undefined"** (a constant series has no variance) — always read it with `n`.
- **Faithfulness is verbatim-only.** It checks that a quote *exists* in the CV, not that it
  *supports* the requirement it was attached to. A real quote pinned to the wrong requirement
  still passes, so treat the number as an upper bound on trustworthiness.
- **Degraded rows are excluded.** `degraded: true` = the AI service's deterministic fallback
  fired (LLM failed twice); it claims no evidence and is not model judgement. A high degraded
  count invalidates the run — check the AI service before trusting anything else.

### Prompt versions

`v=<version>` maps to `match_reason_<version>.txt` in the AI service. Versions are added, never
edited in place, so an old report stays reproducible. Changing a prompt without re-running this
harness defeats the point of having it.
