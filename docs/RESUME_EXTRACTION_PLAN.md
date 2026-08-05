# Résumé Extraction Fix — Phased Plan

> **Goal:** the résumé parser currently produces near-useless structured data on real CVs.
> This plan fixes the cause, then *measures* how much of the remaining gap is the model —
> instead of guessing. Same discipline as the RAG eval phases: no claim without a number.

**Owner:** So Sereysokbotra · **Started:** 2026-08-05 · **Repo:** `jobfit-backend`

---

## 0. The problem, stated precisely

`POST /resumes` → BullMQ worker → two stages:

| Stage | What | Tech | AI? |
|---|---|---|---|
| ① | PDF/DOCX → plain text | `pdf-parse` / `mammoth` | no |
| ② | text → structured JSON | AI service → Ollama `qwen3:0.6b` | yes |

**Stage ① is the defect.** `pdf-parse` emits text in the PDF content-stream order, not
reading order. On the reference CV (`CV_So_Sereysokbotra_Software_Engineer.pdf`) the model
receives 53 lines in which:

- the job title (line 52) appears **four lines below its own bullets** (48–51);
- three education date ranges are **pooled together** (43–45), detached from their degrees;
- the third SKILLS column — *Hardware + Software · Technical Skills · Telecommunication* —
  is **stranded between two high schools** (41, 42, 46);
- two of three TECHNICAL PROJECTS appear **after** ADDITIONAL INFORMATION (29–35);
- NPIC and Hun Sen Champouvorn sit **29 lines below** the `EDUCATION` header (37, 40).

Everything the model got wrong follows from that. Position data exists in the PDF;
`pdf-parse` discards it.

### Ground truth for the reference CV (scoring key)

| Field | Correct value |
|---|---|
| `fullName` | SO SEREYSOKBOTRA |
| `email` | soviseth869@gmail.com |
| `phone` | +855 61705511 |
| `educations` | **3** — KIT / B.SwE / 2025–Present · NPIC / TVET Cert L3 / 2021–2024 · Hun Sen Champouvorn / Technical HS Diploma / 2021–2024 |
| `experiences` | **1** — Electrical Engineering Intern, Nov 2023 – Dec 2023. **`company` = null is CORRECT** — the CV never names the employer |
| `skills` | **9** — Effective Time Management · Creative Problem-Solving · Programming · Communication · Critical Thinking · Teamwork · Hardware + Software · Technical Skills · Telecommunication |

**Baseline (2026-08-05, `qwen3:0.6b`, scrambled text):** `fullName` null · 1 education
(KIT's name merged with NPIC's degree) · 1 experience with `title` **and** `company` null,
holding *project* descriptions · 6 of 9 skills.

> **Correction:** an initial hand-count called this "0/6". The automated scorer
> (`scripts/score-resume-parse.ts`) scores it **2/6** — the hand-count failed to credit
> `email` and `phone`, which the old pipeline did get right. 2/6 is the number to compare
> against; the 0/6 was wrong.

### Known gap, explicitly out of scope

`ParseResumeResponse` has **no `projects` field**. The three technical projects carry all of
this candidate's real technical signal (Arduino, PID control, robotics, sensors, computer
vision) and currently have nowhere to go — they get mangled into `experiences`. Fixing that
is a schema change across the AI service + backend + frontend. **Tracked, not done here.**

---

## Phases

Each phase ends with: tests green → commit → push → report → **wait for acceptance**.

### Phase 0 — Baseline recorded, parser made AI-only ✅
- Record the baseline above (raw text + structured output) so the fix is measurable.
- Remove the silent heuristic fallback: structuring is AI-only, an AI failure now marks the
  résumé `FAILED` instead of writing a low-fidelity regex approximation that downstream
  consumers cannot distinguish from a real parse.
- **Done when:** `npx tsc --noEmit` clean, `npx jest` green.

### Phase 1 — Reading-order PDF extractor ✅
- Add `pdfjs-dist`. Replace the PDF branch of `ResumeParserService.extractText()`.
- Algorithm: for each page take `textContent.items[]` (each carries `transform[4]`=x,
  `transform[5]`=y) → group into visual rows by `y` within a tolerance → sort rows top→bottom
  → sort within row left→right by `x` → join.
- Keep the method signature identical: `extractText(buffer, fileType) → Promise<string>`.
  Nothing else in the pipeline changes.
- DOCX/`mammoth` untouched.
- **Risk:** `pdfjs-dist` ships ESM and needs the legacy build under CommonJS NestJS. If
  interop fights back, fall back to `unpdf` (same positional data, friendlier packaging).
- **Guard against overfitting:** keep the row/column rules simple and general. Do not tune
  thresholds to make one CV look right.
- **Done when:** the extractor runs on the reference CV and returns text.

### Phase 2 — Verify extraction (no model involved) ✅
- Re-extract the reference CV and diff the new text against the page's true reading order.
- **Done when** all five defects listed in §0 are gone from the *text*:
  1. job title precedes its bullets
  2. each education date range sits with its degree
  3. all 9 skills present and contiguous
  4. all 3 educations under `EDUCATION`
  5. name above e-mail
- This phase proves the fix **without** the model as a confound. If the text is still wrong,
  no amount of model work will help.

### Phase 3 — Tests and typecheck ✅
- Update `resume-parser.service.spec.ts` (it currently mocks `pdf-parse`).
- Add a unit test for the row-grouping/sorting helper using synthetic positioned items —
  cheap, deterministic, no PDF bytes.
- **Done when:** `npx tsc --noEmit` clean and `npx jest` green (156+ tests).

### Phase 4 — End-to-end ✅
- Scored through the real AI service via `scripts/score-resume-parse.ts` (same
  `/resume/parse` endpoint, prompt and contract the worker uses).
- ⚠️ **Not yet re-uploaded through the browser UI.** The backend is running the new code, so
  a fresh upload will use it — worth doing once as a smoke check of the full HTTP + BullMQ
  path, which this harness bypasses.

### Phase 5 — The 2×2 (how much is left is the model?) ✅
Four parses of the reference CV, scored against the §0 key:

| | `qwen3:0.6b` | full `qwen3` (8B) |
|---|---|---|
| **scrambled text** (baseline) | 0/6 — recorded | isolates *model capacity* |
| **reading-order text** | isolates *input quality* | best case achievable locally |

Both models are already pulled locally. Full `qwen3` is slow on this laptop, but this is
2 runs on 1 document, not 150 eval pairs.

- **Deliverable:** a filled table + one paragraph saying where the quality is actually lost.
  That is what decides whether the GPU box is worth pursuing **for parsing** — a decision
  currently being made on a hypothesis with no measurement behind it.

---

## Follow-ups

- ~~**Fake confidence badge.**~~ ✅ Done in Phase 6. Was `parsedBy === "ai" ? 92 : 75`, a
  hardcoded constant that read "92% confidence" over a 2/6 parse. Now shows
  "AI-parsed" / "Basic parse".
- ~~**`projects` field**~~ ✅ Done in Phase 6.
- **Hallucinated `company`** — the open defect. Full `qwen3` invents
  "leading publicly listed engineering and construction contractor" as an employer name from
  a sentence that only *describes* one. `null` is correct. Same class as the Phase C
  `/match/reason` faithfulness failures; worth a v3 prompt rule ("a company name is a proper
  noun; if the text only describes the employer, return null") **measured, not assumed**.
- **Feed projects into matching.** The technical signal now *exists* in the parse, but
  nothing downstream reads it yet — `Profile` embeddings and the scorers still see skills
  only. This is where the parse fix converts into match quality, and it is untested.
- **Scorer fallback.** `resume-scorer.service.ts` still degrades ATS/quality scoring to a
  heuristic on `AiServiceError`. Same silent-degradation problem the parser shed in Phase 0.
- **n = 1 CV.** Every number in this document comes from a single résumé. It is enough to
  prove the extractor bug and the schema gap, and **not** enough to claim a general quality
  level. Score a handful more CVs before trusting these figures as representative.

---

## Log

| Date | Phase | Result |
|---|---|---|
| 2026-08-05 | 0 | Baseline recorded (0/6). Heuristic fallback removed; parser is AI-only. tsc clean, jest 156/156. |
| 2026-08-05 | 1 | `pdfjs-dist@3.11.174` (last CJS-friendly line) + `pdf-reading-order.ts`. `pdf-parse` removed. |
| 2026-08-05 | 2 | **All 5 criteria met** on the reference CV — see below. |
| 2026-08-05 | 3 | `scripts/extract-pdf-text.ts` + 11 unit tests. tsc clean, jest **167/167**. |
| 2026-08-05 | 4–5 | `scripts/score-resume-parse.ts` + the full 2×2. **2/6 → 4/6** on the shipped model; skills **6/9 → 9/9**. See below. |
| 2026-08-05 | 6 | `projects` added across all three repos + prompt v2. Full `qwen3` **6/7**; experience entries **4 → 1**; projects **3/3** with technologies. |

### Phase 2 result — extraction verified

`npx ts-node -r tsconfig-paths/register scripts/extract-pdf-text.ts <cv.pdf>`
turns the 53 scrambled lines into 39 lines in true reading order:

| # | Criterion | Before | After |
|---|---|---|---|
| 1 | Job title precedes its bullets | title 4 lines below | ✅ line 18, bullets 19–22 |
| 2 | Education dates sit with their degree | pooled at 43–45 | ✅ lines 7, 10, 14 |
| 3 | All 9 skills present and contiguous | 6, one column stranded | ✅ lines 33–35, 3×3 grid |
| 4 | All 3 educations under `EDUCATION` | 1 | ✅ lines 7–16 |
| 5 | Name above e-mail | e-mail first | ✅ lines 1–2 |

**Known remaining imperfection:** the *Ball Balancing System* date `(2023 – 2024)` still
lands one line above its title (lines 28–29) — that date is typeset on a slightly higher
baseline than the heading. The two lines are adjacent, so the pairing is still recoverable.
**Deliberately not tuned away:** widening the row tolerance to absorb it would risk merging
genuinely distinct rows on other templates, and §Phase 1 forbids fitting the thresholds to
one document.

### Phases 4 + 5 result — the 2×2

Scored by `scripts/score-resume-parse.ts` against the §0 key. Same CV, same prompt, same
AI service; only the text source and `GENERATION_MODEL` vary.

| | `qwen3:0.6b` | full `qwen3` (8.2B) |
|---|---|---|
| **scrambled text** (old `pdf-parse`) | **2/6** — seconds | **4/6** — 761 s |
| **reading-order text** (new) | **4/6** — seconds | **5/6** — 504 s |

Both levers are worth roughly the same on this document (+2 and +1). The interesting result
is not the totals — it is **which errors each lever can and cannot fix.**

**① Skills cannot be recovered by any model size.** Both scrambled cells return 6 skills and
miss *Hardware + Software* and *Technical Skills*, regardless of model. Those items were
physically relocated out of the SKILLS block by the broken extractor, so no amount of model
capacity reconstructs them — the information is not in the input. Only the reading-order fix
reaches **9/9**. **This is the load-bearing finding:** it is a class of error that a bigger
model provably cannot buy its way out of.

**② The big model partially compensates for bad input, at ~13 minutes a résumé.** Full
`qwen3` on scrambled text recovers `fullName` and even nails the experience entry (1/1,
correct title, `company: null`). That is real capability — but it costs 761 s and still
cannot reach the skills.

**③ The experience metric is confounded by the missing `projects` field.** Full `qwen3`
scored *worse* on the better input (4 entries vs 1) because clean text made the three
technical projects legible and it had nowhere to put them (§0). Both readings are defensible
model behaviour against a schema that cannot represent the document. Treat this row as
measuring the schema, not the model, until `projects` exists.

**④ Cost decides deployment.** 504–761 s per résumé against a UI promising "~30 seconds".
Full `qwen3` is not shippable for parsing on this hardware at any quality level.

**Conclusion:** ship **reading-order text + `qwen3:0.6b`** (4/6, seconds). The next-best
lever is the **`projects` schema fix**, not a model upgrade — it is cheap, it unblocks the
one metric that is currently unmeasurable, and it plausibly takes both models to 5–6/6.

### Phase 6 — the `projects` schema fix ✅

`ParseResponse` gained `projects[{name, description, startDate, endDate, technologies}]`,
persisted in a new nullable column and rendered in the UI. The parse prompt is now
versioned: `resume_parse_v1.txt` is the old one **unchanged** (so the measurements above
stay reproducible) and **v2** is the default, adding projects plus explicit rules that a
project is not a job, a job is not a project, and *being a student is not employment*.

Scored on a **7-criterion** scale — the 6 above plus "3 projects with their technologies".
Not directly comparable to the 6-criterion totals; compare per-criterion.

| Config | Score | Time |
|---|---|---|
| reading-order + `qwen3:0.6b` + v2 | **4/7** | 16 s |
| reading-order + full `qwen3` + v2 | **6/7** | 312 s |

**The prediction held.** Full `qwen3` went from **4 experience entries → 1** (the correct
count, correct title) and now returns **3/3 projects with `[Arduino, sensors, servo motor]`**.
The technical signal that used to be destroyed outright now reaches the parsed profile.
`qwen3:0.6b` gets 2/3 projects with `[Arduino, PID Control, servo motor]` — imperfect, but
what was structurally impossible is now merely incomplete.

**Honest accounting — one defect was traded for another, not eliminated.** On the original
6 criteria neither model's score moved (0.6b 4/6, full `qwen3` 5/6). What changed is *which*
experience defect remains:

| | experience defect, v1 | experience defect, v2 |
|---|---|---|
| full `qwen3` | 4 entries for a 1-job CV, `company: null` | 1 entry, correct title, but `company` **hallucinated** as "leading publicly listed engineering and construction contractor" |

The CV *describes* the employer without naming it, so `null` is the only correct answer.
Giving projects somewhere to live fixed the count and exposed a separate faithfulness bug
that the count problem had been masking. **Do not read 6/7 as "one more prompt away from
perfect."** The remaining failure is a model inventing a proper noun out of a description —
the same class of defect Phase C found in `/match/reason`.

**Cost:** 312 s for full `qwen3` (vs 504 s and 761 s earlier — run-to-run variance on this
laptop is large, which is itself a reason not to trust single-run latency figures). Still
not shippable. **`qwen3:0.6b` + reading-order + v2 returns in ~16 s and is the shipped
configuration.**

### Notes for whoever runs this next

- **This repo uses `pnpm`, not `npm`** (`pnpm-lock.yaml` + `pnpm-workspace.yaml`, and a
  symlinked `node_modules`). `npm install` crashes with
  `Cannot read properties of null (reading 'matches')` — that is npm's arborist choking on
  pnpm's symlink layout, not a broken package. Use `pnpm add`.
- **`pdfjs-dist` is pinned to `3.11.174`** on purpose. v4+ is ESM-only and this project is
  `module: commonjs`, which would force `eval`-based dynamic import. v3 ships a real CJS
  build at `pdfjs-dist/legacy/build/pdf.js`.
- `canvas` is an optional pdfjs peer whose native build is skipped. It is only needed for
  rendering pages to images; text extraction does not use it.
