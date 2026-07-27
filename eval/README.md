# Retrieval evaluation (RAG plan Phase A)

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

## Reading the report

- **`n`** next to each slice = labeled candidates contributing to it. **Small `n` = too
  sparse to trust** — invest labels there before believing the number.
- **Relevant set = hand-labeled GREAT/OK per candidate** (partial labels; unlabeled
  retrieved items count as non-relevant). A candidate with only BAD labels in a slice isn't
  measurable there (nothing to retrieve) and is excluded from that slice's average.
