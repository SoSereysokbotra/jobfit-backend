# Resume Builder — Data Model (Phase 0 output)

**Status:** confirmed against the codebase on 2026-08-12, with all five open
questions settled the same day (§5). Ready for Phase 1. No code or schema was
changed in this phase.
**Feeds:** Phase 1 (schema & migration) of `RESUME_BUILDER_BACKEND_PLAN.md`.
**Companion:** the plan doc holds the settled decisions; this doc holds the
ready-to-paste Prisma.

---

## 1. Compatibility with the existing Resume pipeline

Traced `ResumeScorerService`, `ResumeService`, `ApplicationService`,
`ApplicationScreeningService` and the `Resume`/`Application` relations.

### ✅ Linking an exported document to a `Resume` row works

Nothing in the existing pipeline cares *how* a `Resume` row came to exist. There
is no `source` column and no branching on origin. Once the row exists with its
four required file columns, every downstream feature treats it like any other
résumé.

### ❌ BLOCKER — scoring requires `ParsedResumeData`, **including `rawText`**

`ResumeScorerService.load()` hard-fails when no `ParsedResumeData` row exists:

```ts
if (!parsed) throw new BadRequestException('Resume has not been parsed yet');
```

That already argues for writing `ParsedResumeData` at export (decision 2 in the
plan). But the more important detail is **which fields the scorer reads**, because
writing only the structured fields quietly produces terrible scores:

| Sub-score | Reads | If `rawText` is null |
|---|---|---|
| `scoreFormatting` | `rawText` — bullets, ≥10 non-blank lines, no 3+ blank runs | **0** |
| `scoreKeywords` | `rawText` vs 12 common keywords | **0** |
| `scoreLength` | `rawText.length` (1500–6000 chars ideal) | **0** |
| `scoreGrammar` | `rawText` — double spaces, typos, lone "i" | 100 (vacuous) |
| `scoreKeywordsQuality` | `rawText` action verbs + skills count | partial |
| AI path (`aiClient.scoreResume(text)`) | `parsed.rawText ?? ''` | sends **empty string** |
| `scoreParsability` | `fullName`, `email`, `phone`, `experiences`, `skills` | fine if written |
| `scoreContactInfo` | `email`, `phone`, `location` | fine if written |
| `scoreContent` / `scoreCompleteness` | `experiences`, `educations`, `skills`, `summary`, contact fields | fine if written |

**Consequence if ignored:** a résumé built on our own "ATS-friendly" template
would score near zero on ATS formatting/keywords/length — the single most
embarrassing possible bug for this feature.

> **➡️ REQUIRED ADJUSTMENT TO PHASE 5.** Export must render the document to
> **plain text** as well as PDF, and store that text in
> `ParsedResumeData.rawText`. The PDF renderer should emit both from the same
> content pass. Target the scorer's own heuristics: real bullet characters,
> one line per bullet, no runs of 3+ blank lines, and ~1500–6000 characters.

Also note `hasItems()` parses those columns as JSON: `experiences`, `educations`,
`skills` and `certifications` are **JSON strings**, not Json columns, and must
deserialize to **non-empty arrays** to score.

### ✅ "Select résumé when applying" needs no changes

`ApplicationService.submitApplication` passes `dto.resumeId` straight to the
repository — no existence, ownership or parsing-status check. `Resume` listing
filters on `deletedAt: null` only, **not** `parsingStatus`. So an exported
résumé appears in the picker immediately and attaches without special handling.

> ⚠️ **Unrelated pre-existing gap, flagged not fixed:** because `resumeId` is
> unvalidated, a user can currently attach *another user's* `resumeId` to their
> application. That is a real IDOR in the existing apply flow, independent of
> this feature. Worth its own ticket.

### ✅ AI screening is unaffected

`ApplicationScreeningService` never reads the résumé — it scores the user's
profile/embeddings against the job. Attaching a builder résumé changes nothing.

### Other observations

- `Application.resume` is `onDelete: SetNull`; `ParsedResumeData` cascades from
  `Resume`. Deleting an exported résumé nulls the application's link — same as
  today for uploads.
- `parsedBy` is a nullable String (`"ai"` / `"heuristic"` today). Using
  `"resume-builder"` needs no migration, but check any consumer that switches on
  it before relying on the value.
- `Resume.isDefault` is untouched by export; exporting does not promote the new
  résumé to default. Confirm that is the intent (see open questions).

---

## 2. Field-name confirmation for the child tables

Verified against the real models. All FK to **`User`**, not `Profile`, and all
use `deletedAt` soft delete.

| Source model | Fields the builder mirrors |
|---|---|
| `Experience` | `company`, `title`, `description?`, `isCurrentJob`, `startDate`, `endDate?`, `technologies String[]` — plus `jobLevel`/`employmentType`/`industry`, which a résumé line does not print. **No `location` column.** |
| `Education` | `institution`, `degreeLevel DegreeLevel`, `fieldOfStudy`, `description?`, `startDate`, `endDate?`, `gpa Float?` — **no `graduationDate`, no `honors`** |
| `Certification` | `name`, `issuer`, `credentialId?`, `credentialUrl?`, `issueDate`, `expirationDate?` |
| `UserSkill` → `Skill` | `UserSkill` holds `skillId`, `proficiencyLevel String`, `yearsOfExperience Float?`, `endorsementCount`; the display **name lives on `Skill.name`** |

**There is no `Project` model.** `ResumeDocumentProject` below is a builder-only
section with no import path (decision 4).

The builder's tables deliberately store **denormalized plain values** (e.g. a
skill `name` string, not a `skillId` FK). A document is a point-in-time snapshot
that must stay editable and must not shift when the catalogue or the user's
profile changes.

---

## 3. Final proposed schema

Ready to paste into `schema.prisma` in Phase 1. Follows the file's existing
conventions: UPPERCASE enum members, `@@map` to snake_case plurals, `@id
@default(uuid())`.

```prisma
// ── Resume Builder ────────────────────────────────────────────────────────────
// An in-app, structured résumé the user composes from our templates, distinct
// from the uploaded-file `Resume`. Exporting one renders a PDF, stores it, and
// creates a normal `Resume` row so the document flows into ATS scoring and the
// "select résumé when applying" picker.

enum ResumeLineSpacing {
  SINGLE // 1.0
  DEFAULT // 1.15
  WIDE // 1.5
}

enum ResumeMargin {
  NARROW // 0.5"
  NORMAL // 0.75"
  WIDE // 1.0"
}

enum ResumeDocumentStatus {
  DRAFT
  FINALIZED
}

/// A résumé design WE author and seed. Internal reference data: no owner column,
/// nothing here is user-writable, and there is no user-facing create/update route.
/// `layoutConfig` is authored by us and read by the renderer.
model ResumeTemplate {
  id           String  @id @default(uuid())
  name         String  @unique
  category     String // "ats-friendly" | "modern" | "creative"
  thumbnailUrl String?
  isAtsFriendly Boolean @default(true)
  layoutConfig Json // section order + styling rules the renderer reads
  isActive     Boolean @default(true)

  documents ResumeDocument[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([isActive, category])
  @@map("resume_templates")
}

model ResumeDocument {
  id     String @id @default(uuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  title      String
  templateId String
  template   ResumeTemplate @relation(fields: [templateId], references: [id], onDelete: Restrict)

  // Presentation controls (the reference screenshot's knobs).
  /// A PRESET KEY from a known set (e.g. "default" | "navy" | "forest"), NOT a
  /// free-form hex value. The DTO validates membership; the schema deliberately
  /// stores a plain String so the preset list can grow or its hex values change
  /// without a migration. See §5-E.
  colorScheme String            @default("default")
  lineSpacing ResumeLineSpacing @default(DEFAULT)
  margin      ResumeMargin      @default(NORMAL)
  fontFamily  String?

  status ResumeDocumentStatus @default(DRAFT)

  // ── Résumé header ─────────────────────────────────────────────────────────
  // SNAPSHOTTED from Profile/User at creation, then owned by the document and
  // independently editable — a résumé tailored for one application must be able
  // to differ from the master profile. Never re-read from Profile afterwards.
  fullName     String?
  email        String?
  phone        String?
  location     String?
  linkedinUrl  String?
  portfolioUrl String?

  /// The `Resume` row produced by the MOST RECENT export, if any — a single FK,
  /// not a history. Re-exporting soft-deletes the previously linked `Resume` and
  /// repoints this, so the user's résumé picker only ever shows one current file
  /// per document (§4, §5-A).
  ///
  /// SetNull, NOT Cascade, and the direction matters: deleting the `Resume`
  /// leaves the document intact and merely unlinked. Deleting the DOCUMENT does
  /// NOT touch the exported `Resume` — see §5-D. There is no cascade in either
  /// direction between a document and its exported résumé.
  exportedResumeId String?
  exportedResume   Resume? @relation("ResumeBuilderExport", fields: [exportedResumeId], references: [id], onDelete: SetNull)

  summary        ResumeDocumentSummary?
  experiences    ResumeDocumentExperience[]
  educations     ResumeDocumentEducation[]
  skills         ResumeDocumentSkill[]
  certifications ResumeDocumentCertification[]
  projects       ResumeDocumentProject[]

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([userId])
  @@index([templateId])
  @@map("resume_documents")
}

/// 1:1 with the document. A single block of text, so no `order`.
model ResumeDocumentSummary {
  id               String         @id @default(uuid())
  resumeDocumentId String         @unique
  resumeDocument   ResumeDocument @relation(fields: [resumeDocumentId], references: [id], onDelete: Cascade)

  content String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("resume_document_summaries")
}

model ResumeDocumentExperience {
  id               String         @id @default(uuid())
  resumeDocumentId String
  resumeDocument   ResumeDocument @relation(fields: [resumeDocumentId], references: [id], onDelete: Cascade)

  order Int

  company String
  title   String
  /// Not importable — `Experience` has no location column. User-entered.
  location     String?
  startDate    DateTime
  endDate      DateTime?
  isCurrentJob Boolean   @default(false)
  description  String?
  technologies String[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([resumeDocumentId, order])
  @@map("resume_document_experiences")
}

model ResumeDocumentEducation {
  id               String         @id @default(uuid())
  resumeDocumentId String
  resumeDocument   ResumeDocument @relation(fields: [resumeDocumentId], references: [id], onDelete: Cascade)

  order Int

  institution  String
  degreeLevel  DegreeLevel
  fieldOfStudy String
  startDate    DateTime
  endDate      DateTime?
  gpa          Float?
  description  String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([resumeDocumentId, order])
  @@map("resume_document_educations")
}

/// Denormalized on purpose: the display name is copied, not FK'd to `Skill`, so
/// the document is a stable snapshot and stays editable off-catalogue.
model ResumeDocumentSkill {
  id               String         @id @default(uuid())
  resumeDocumentId String
  resumeDocument   ResumeDocument @relation(fields: [resumeDocumentId], references: [id], onDelete: Cascade)

  order Int

  name             String
  proficiencyLevel String? // BEGINNER | INTERMEDIATE | ADVANCED | EXPERT

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([resumeDocumentId, order])
  @@map("resume_document_skills")
}

model ResumeDocumentCertification {
  id               String         @id @default(uuid())
  resumeDocumentId String
  resumeDocument   ResumeDocument @relation(fields: [resumeDocumentId], references: [id], onDelete: Cascade)

  order Int

  name           String
  issuer         String
  issueDate      DateTime
  expirationDate DateTime?
  credentialId   String?
  credentialUrl  String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([resumeDocumentId, order])
  @@map("resume_document_certifications")
}

/// Builder-only: there is no `Project` model to import from (decision 4).
model ResumeDocumentProject {
  id               String         @id @default(uuid())
  resumeDocumentId String
  resumeDocument   ResumeDocument @relation(fields: [resumeDocumentId], references: [id], onDelete: Cascade)

  order Int

  name         String
  description  String?
  technologies String[]
  url          String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([resumeDocumentId, order])
  @@map("resume_document_projects")
}
```

### Back-relations required on EXISTING models

Prisma will not compile without these. Phase 1 must add them (two lines; no
column changes, so the migration only creates the new tables):

```prisma
// in model User
resumeDocuments ResumeDocument[]

// in model Resume
builderDocuments ResumeDocument[] @relation("ResumeBuilderExport")
```

### Notes on choices

- **`exportedResumeId` — settled name (§5-B).** The original plan called it
  `sourceResumeId`, which reads backwards: the `Resume` is the *output* of the
  document, not its source. `exportedResumeId` is now the name to use everywhere.
  ⚠️ `RESUME_BUILDER_BACKEND_PLAN.md` still says `sourceResumeId` in 4 places —
  that doc was out of scope for this edit and needs the same rename before
  Phase 1 is run, or the two docs will disagree.
- **`template` uses `onDelete: Restrict`** so retiring a template cannot orphan
  documents. Retire by setting `isActive = false`; the row stays for existing
  documents to reference.
- **`exportedResume` uses `onDelete: SetNull`**, mirroring `Application.resume` —
  deleting the résumé leaves the document intact and simply unlinked.
- **Children have no `deletedAt`.** They are owned by the document and cascade
  with it; a tombstone would be dead weight. `ResumeDocument` itself keeps
  `deletedAt`, matching every other user-owned model.
- **`@@index([resumeDocumentId, order])`** rather than on `resumeDocumentId`
  alone — every read of a section is "this document's rows, in order".
- **`DegreeLevel` is reused** rather than a new enum, so builder education stays
  comparable with profile education.
- **`ResumeTemplate.name` is `@unique`** so the Phase 1 seed can upsert by name
  idempotently, matching the `Skill`/`Industry` seed pattern.

---

## 4. How export links back to `Resume`

0. **If the document already has an `exportedResumeId`, soft-delete that `Resume`
   first** (set `deletedAt`) — see §5-A. Do this *before* creating the new row so
   the user's picker never briefly shows two files for one document. Soft, not
   hard: `Application.resume` is `onDelete: SetNull`, and hard-deleting would
   silently strip the résumé off applications the user already submitted with it.
1. Render the document → PDF bytes **and** a plain-text rendering.
2. `storage.upload('resumes', storagePath(userId, resumeId, fileName), pdf, 'application/pdf')`.
3. Create the `Resume` row: `fileName`, `fileUrl`, `fileSize`, `fileType: "PDF"`
   (all four required), `parsingStatus: SUCCESS`.
   **Do not touch `isDefault`** — export never promotes the new résumé to
   default; that stays an explicit user action (§5-C).
4. Create `ParsedResumeData` **directly** — no `resume-parsing` job:
   - `fullName`/`email`/`phone`/`location` ← the document's snapshotted header
   - `summary` ← the summary section
   - `experiences`/`educations`/`skills`/`certifications` ← `JSON.stringify` of
     the child rows (these columns are JSON **strings**)
   - `projects` ← null for MVP
   - `rawText` ← **the plain-text rendering** (see §1 — this is what makes
     scoring work)
   - `parsedBy: "resume-builder"`
5. Set `ResumeDocument.exportedResumeId` to the new résumé's id.
6. Return the résumé id plus `storage.getSignedUrl('resumes', path)` — not the
   value `upload()` returns, which is a public URL against a private bucket.

From that point the résumé is indistinguishable from an uploaded one: it lists,
scores, and attaches to applications with no special-casing.

### ➡️ Required additions to Phase 5's prompt

When Phase 5 is written, its export step must explicitly include:

- **"Soft-delete the prior linked `Resume` before creating the new one"** — if
  `exportedResumeId` is set, mark that résumé `deletedAt` first, then create and
  relink. Without this, every re-export leaves another stale résumé in the
  user's picker. Add a test: exporting the same document twice leaves exactly
  one non-deleted `Resume` linked to it, and the older one is soft-deleted
  rather than hard-deleted.
- **"Do not set `isDefault`"** — with a test asserting the flag is untouched.

### Document deletion is NOT a cascade

Deleting a `ResumeDocument` (soft delete, `deletedAt`) **does not delete, soft-
delete, or unlink its exported `Resume`.** The two are independent after export:
the document is the editable draft, the résumé is a file the user may already
have attached to submitted applications. Removing it because they tidied up a
draft would retroactively strip evidence from those applications.

The only linkage is the FK direction already described: deleting the *résumé*
nulls `exportedResumeId` (SetNull); deleting the *document* does nothing to the
résumé. Do not add a cascade, and do not "clean up" the exported file on
document deletion.

---

## 5. Settled questions (decided 2026-08-12)

All five were resolved before Phase 1. Nothing here is open; this section records
*what was decided and why*, and the schema above already reflects it.

### A. Re-export overwrites — single FK, previous résumé soft-deleted ✅

`exportedResumeId` stays a **single FK**, not a 1:many history. On re-export the
previously linked `Resume` is **soft-deleted** (`deletedAt`) and the FK is
repointed at the new one, so a user's picker only ever shows one current file per
document. No `resumeDocumentId` column is added to `Resume`, so **no change to
the existing model** and the migration only creates new tables.

Soft, never hard: `Application.resume` is `onDelete: SetNull`, so hard-deleting a
superseded résumé would silently strip it off applications the user already
submitted. Soft-deleting preserves that history while hiding the stale file.

**Phase 5 impact — its prompt must say "soft-delete the prior linked `Resume`
before creating the new one".** See the flagged additions at the end of §4.

### B. Name is `exportedResumeId` ✅

Renamed from `sourceResumeId` for direction accuracy — the `Resume` is the
document's *output*. Used consistently throughout this doc.
⚠️ The plan doc still uses the old name in 4 places and needs the same rename.

### C. Export does NOT set `isDefault` ✅

Export leaves `Resume.isDefault` untouched; promoting a résumé to default stays
an explicit user action via the existing `PATCH /resumes/:id/set-default`. Auto-
defaulting would let a background action silently change which résumé gets
attached elsewhere.

### D. Deleting a document does NOT delete its exported résumé ✅

They are independent after export. No cascade in that direction, and no
"cleanup" of the stored file on document deletion. Stated explicitly in §4 and in
the schema comment on `exportedResumeId` so it cannot be mistaken for an
oversight. (The reverse still holds: deleting the résumé nulls the FK.)

### E. `colorScheme` is a preset key, validated in the DTO ✅

Stored as a plain `String` and constrained to **one of a known set** by the
DTO — not free-form hex. This keeps templates ATS-safe and previews predictable,
and it means the column never needs a migration when the palette changes.

> **Small content decision, not urgent, no schema impact:** the actual preset
> list and their hex values still need choosing (e.g. `default`, `navy`,
> `forest`, `burgundy`). The API contract only requires "one of a known set of
> strings", so the values can be decided at any point — including after Phase 1
> — without touching the schema or a migration. An enum was deliberately *not*
> used for exactly this reason.

**Nothing blocks Phase 1.** The migration creates new tables only, plus the two
back-relation lines on `User` and `Resume`.

---

## Appendix — method

Traced `resume-scorer.service.ts` (every sub-score and its inputs),
`resume.service.ts` (upload/storage path, soft delete), `resume.repository.ts`
(list filters), `application.service.ts` (`resumeId` handling),
`application-screening.service.ts` (no résumé dependency), and the
`Resume`/`ParsedResumeData`/`Application` relations in `schema.prisma`.
No files were modified in this phase.
