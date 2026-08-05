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
holding *project* descriptions · 6 of 9 skills. **Score: 0/6 fields correct.**

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

### Phase 1 — Reading-order PDF extractor
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

### Phase 2 — Verify extraction (no model involved)
- Re-extract the reference CV and diff the new text against the page's true reading order.
- **Done when** all five defects listed in §0 are gone from the *text*:
  1. job title precedes its bullets
  2. each education date range sits with its degree
  3. all 9 skills present and contiguous
  4. all 3 educations under `EDUCATION`
  5. name above e-mail
- This phase proves the fix **without** the model as a confound. If the text is still wrong,
  no amount of model work will help.

### Phase 3 — Tests and typecheck
- Update `resume-parser.service.spec.ts` (it currently mocks `pdf-parse`).
- Add a unit test for the row-grouping/sorting helper using synthetic positioned items —
  cheap, deterministic, no PDF bytes.
- **Done when:** `npx tsc --noEmit` clean and `npx jest` green (156+ tests).

### Phase 4 — End-to-end
- Restart backend, re-upload the reference CV through the real UI.
- Capture the new structured output and score it against the §0 key.
- **Done when:** a scored before/after sits in this file.

### Phase 5 — The 2×2 (how much is left is the model?)
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

## Follow-ups (not in this plan)

- **Fake confidence badge.** The frontend shows `parsedBy === "ai" ? 92 : 75` — a hardcoded
  constant, not a measured confidence. It read "92% confidence" over a parse with 0/6 fields
  correct. Since the parser is now AI-only it is permanently 92%. Show `parsedBy` instead.
- **`projects` field** — see §0.
- **Scorer fallback.** `resume-scorer.service.ts` still degrades ATS/quality scoring to a
  heuristic on `AiServiceError`. Same silent-degradation problem, not yet addressed.
- **Skills from projects.** Even with perfect extraction this CV yields only soft skills;
  the technical signal lives in PROJECTS.

---

## Log

| Date | Phase | Result |
|---|---|---|
| 2026-08-05 | 0 | Baseline recorded (0/6). Heuristic fallback removed; parser is AI-only. tsc clean, jest 156/156. |
