# Resume Builder — Known Gaps

**Purpose:** everything Phases 1–5 did **not** deliver, so nothing here is mistaken
for done.
**Date:** 2026-08-12 · **Scope covered:** backend only.

> **The headline:** the backend can create, edit, prefill and export a résumé to
> PDF. **There is no builder UI**, and **Phase 2 was skipped** — the templates
> endpoint the picker needs does not exist yet.

---

## 1. Skipped outright

### 1.1 Phase 2 — `GET /resume-builder/templates` was never built ⚠️

Work went Phase 0 → 1 → 3 → 4 → 5. Phase 2 was never run, so **there is no
endpoint for listing templates**. `src/modules/resume-builder/` was scaffolded in
Phase 3 as a prerequisite, but it has no templates controller.

Consequence: a client can create a document only if it already knows a valid
`templateId`. Templates are reachable today solely through the internal
active-template check on create/update. **The template picker cannot be built until
this exists.** It is purely additive to the module: read-only,
`@Public()`, filterable by `atsOnly` and `category`, returning active templates.

---

## 2. Backend scope deliberately deferred (2026-08-12 decisions)

### 2.1 DOCX export — decision 6

MVP is **PDF-only**. `format: "docx"` is rejected at validation (400), not
accepted-then-501, so the API never advertises what it cannot produce.

To add it: a **second renderer** (the `docx` library is the realistic option) behind
the same endpoint, plus widening `EXPORT_FORMATS`. That is two independent
renderers to keep in visual sync — roughly double the template work — which is why
it was cut. `Resume.fileType` already permits `"DOCX"`, so no migration is needed.

### 2.2 Projects import from profile — decision 4

`"projects"` is not an importable section: **there is no `Project` model** anywhere
in the schema. The builder's project section is manual-entry.

The parked approach is reading an uploaded résumé's `ParsedResumeData.projects` —
but that column is an **untyped JSON string** produced by the AI parser, so it needs
a **shape contract** before anything can consume it, and it makes import depend on
the user having uploaded *and* successfully parsed a résumé first.

### 2.3 Admin template management — template-ownership constraint

Templates are **seed-only**. They enter the system through `prisma/seed.ts` and
nothing else: there is no create/update/delete/upload route, and `layoutConfig` is
not settable through any user-facing DTO. This is deliberate — templates are designs
we author and control, not user content.

If management is ever needed it belongs under `/admin/*` behind `@Roles('ADMIN')`,
matching the existing admin controllers. Explicitly out of scope for Phases 1–6.

### 2.4 ATS / quality scoring of builder résumés — **verified, not a gap**

The brief asked to confirm whether the existing scoring path picks these up. It
does. Recorded here so nobody re-investigates:

- Export writes `ParsedResumeData` **including `rawText`**, which is what
  `ResumeScorerService` needs — it hard-fails without a parsed row, and reads
  `rawText` for five sub-scores plus the AI scorer call.
- `GET /resumes/:id/ats-score`, `/quality-score`, `/scores` and
  `POST /resumes/:id/score` therefore work on a builder résumé exactly as on an
  upload.
- `atsScore`/`qualityScore` start **null** and populate when one of those endpoints
  is called. **Nothing auto-scores in this codebase** — verified: the only scorer
  call sites are those four `resume` controller routes, and the parse pipeline does
  not trigger scoring. So this is **identical behaviour to uploads**, not a
  builder-specific gap.

What *is* untested: whether the heuristics score our rendered layout *well*. The
renderer targets them deliberately (real bullet glyphs, one bullet per line, no runs
of 3+ blank lines, ~1500–6000 characters), but no one has exported a real résumé and
looked at the number. **Worth doing once before launch.**

---

## 3. Frontend — nothing is built

All of it remains to do:

| Gap | Notes |
|---|---|
| **Builder UI** | No template picker, no section editors, no settings controls. |
| **Live preview** | The backend renders only on export; there is no preview endpoint and no client-side renderer. Deciding how preview works (server round-trip vs. a client re-implementation of the layout) is an open design question — a client-side one risks drifting from the PDF. |
| **Drag-to-reorder** | Backend is ready: every section PUT takes `order` from array index, so reordering is a reordered array. Nothing renders it. |
| **Template thumbnails** | Seeded with placeholder paths (`/templates/classic-ats.png` etc.). **No images exist**, and the three templates have no visual design beyond heading style, bullet glyph and accent usage. |
| **Conflict/refresh handling** | Sections are bulk-replace with no optimistic-concurrency check, so two tabs editing one document will silently clobber each other (last write wins). Unlike the profile endpoints, there is no `expectedUpdatedAt` here. |

---

## 4. Smaller backend caveats

- **`layoutConfig` shape is provisional.** I invented
  `{ sections: [...], rules: { columns, headingStyle, bullet, accent } }` in the
  Phase 1 seed and the Phase 5 renderer now reads it. It is a `Json` column, so
  changing it costs a re-seed, not a migration. A malformed config falls back to the
  default section order rather than rendering a blank page.
- **Colour presets are keys, not values.** `default | navy | forest | burgundy |
  slate` are validated in the DTO; the hex behind each lives in the renderer and is
  still an open content decision. Changing them needs no migration.
- **All three seeded templates are single-column** and marked `isAtsFriendly`.
  Multi-column layouts are exactly what ATS parsers mangle, so "visual variant"
  currently means heading style, bullet glyph and accent — not layout.
- **Export is synchronous.** Rendering happens in the request. Fine at MVP volume
  (pdfkit is fast, no browser), but a long document on a busy instance ties up the
  request. If it ever matters, this is the piece to move to a queue.
- **No pagination on `GET /documents`.** A user with hundreds of drafts gets them
  all. Acceptable for now; the list is settings-only.
- **`pnpm add` needs `-w`.** `pnpm-workspace.yaml` declares `packages: ['.']`, so
  the repo is a workspace root and plain `pnpm add` refuses.

---

## 5. Test and tooling caveats

- **`pnpm test` is green: 47 suites, 539 tests.** All Phase 1–5 work passes together.
- **`src/infra/ai/ai.client.spec.ts` is flaky under full-suite load.** It failed once
  at ~48s and passed 8/8 in isolation and on re-run — a timing-sensitive
  retry/timeout spec starved by 47 parallel suites. Pre-existing, unrelated to this
  feature.
- **`pnpm test:e2e` fails, and not because of this feature.** The specs in `test/`
  call unprefixed URLs (`/auth/register`) while `main.ts` sets a global `api/v1`
  prefix, and `test/app.e2e-spec.ts` is the untouched Nest scaffold expecting
  "Hello World!" at `/`. **Do not read a red `test:e2e` as a Resume Builder
  regression.**
- **No end-to-end coverage of the builder.** All tests are unit/integration against
  in-memory Prisma stand-ins. The PDF renderer is exercised for real (pdfkit runs and
  the bytes are asserted to be a valid PDF), but **nothing exports against a real
  database or real Supabase Storage.**
- **Nobody has looked at a generated PDF.** Byte-level correctness is tested; visual
  correctness is not, and is not practical to unit test. **Export one and open it
  before launch.**
- **`prisma migrate dev` remains unusable** in this repo — no migration creates the
  `offers` table, so the shadow database fails at `20260809090000_offer_messages`
  (P3006/P1014). Migrations must be hand-written and applied with `migrate deploy`.
  Related: `prisma migrate diff` reports **pre-existing drift** (a `match_reports`
  table, the `jobs_searchTsv_idx` index and others exist in the database but are not
  modelled). Its output must never be applied verbatim — the Phase 1 migration was
  filtered by hand for exactly this reason. **This drift still needs its own
  reconciliation.**

---

## 6. Suggested order for what's next

1. **Phase 2 — the templates endpoint** (§1.1). Small, additive, and it blocks the
   template picker.
2. **Export one real résumé and read it** — check the PDF looks right and note what
   the ATS scorer gives it (§2.4).
3. **Template thumbnails + visual design** — placeholders today.
4. **Frontend builder UI**, with live preview last, once the preview approach is
   decided.
5. **Schema drift reconciliation** (§5) — unrelated to this feature but it blocks
   safe use of Prisma's own tooling.

---

## Cross-references

- `RESUME_BUILDER_API.md` — the endpoint contract
- `RESUME_BUILDER_DATA_MODEL.md` — schema + the Phase 0 compatibility findings
- `RESUME_BUILDER_BACKEND_PLAN.md` — the phase plan and settled decisions
