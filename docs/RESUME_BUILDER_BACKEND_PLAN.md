# JobFits — Resume Builder: Backend Plan

> **Reviewed against the real codebase on 2026-08-11.** This plan was
> originally written without repo access. Every assumption below has now been
> checked against `schema.prisma`, `package.json` and `src/`, and corrected
> where it was wrong. Corrections are marked **✅ VERIFIED** (assumption held)
> or **❌ CORRECTED** (assumption was wrong — text updated).
>
> **All six open decisions were settled on 2026-08-12** and are now folded into
> the phase text below. They are marked **✅ DECIDED** where they used to say
> DECISION NEEDED. See the decisions index at the foot of this doc.

---

## 🔒 Constraint: templates are ours, not the user's

`ResumeTemplate` rows represent designs **we build, control and seed in-house**.
They are not sourced from a third-party marketplace, and **users cannot create,
upload, customise or delete them**. A user only ever *selects* an existing
template and adjusts the presentation knobs on their own document
(`colorScheme`, `lineSpacing`, `margin`, `fontFamily` on `ResumeDocument`).

Concretely, for every phase below:

- The **only** user-facing template route is `GET /resume-builder/templates`
  (read-only, list/filter). There is **no** POST/PATCH/DELETE on templates, and
  no upload endpoint, for regular users. Do not add one.
- `layoutConfig` is authored by us and seeded — it is **not** user-writable, and
  it must never be settable through any user-facing DTO.
- Template creation/management is an **internal/admin concern**. Templates enter
  the system through `prisma/seed.ts` (Phase 1). If a management API is ever
  needed it belongs under `/admin/*` behind `@Roles('ADMIN')`, matching the
  existing admin controllers — **explicitly out of scope for Phases 1–6.**
- "Custom template" in any future frontend copy means *your own colour/spacing
  choices on our template*, never *a template you supplied*.

**Scope:** Backend only. This is a new feature — a from-scratch, in-app 
resume builder (template picker, line spacing/margins/color controls, 
structured content editing) distinct from the existing "upload a resume 
file" flow (FR-RESUME-001). Frontend (the actual builder UI, live 
preview, drag-to-reorder) is out of scope until this is done and 
reviewed.

**All routes below are relative to the global `/api/v1` prefix** (set in
`src/main.ts`), e.g. `GET /api/v1/resume-builder/templates`.

**Reference:** the reference screenshot shows a template picker with 
line-spacing options (1.0/1.15/1.5), margin options (0.5"/0.75"/1.0"), 
color swatches, and a set of ATS-friendly template thumbnails, with a 
live preview panel on the right.

---

## How this fits into what already exists

The current `Resume` model (per schema.prisma) represents an **uploaded 
file** — PDF/DOCX that gets parsed. The Resume Builder is a different 
thing: a **structured document the user builds inside JobFits**, which 
gets *rendered* into a PDF at the end. These should be related but 
separate:

- A builder-created resume, once exported, should be able to become a 
  regular `Resume` row (so it flows into the existing ATS analysis / 
  optimization / "select resume when applying" features without 
  duplicating that logic)
- Builder documents should be able to **prefill** from the user's 
  existing profile data so the user isn't retyping everything, but each 
  builder document keeps its **own copy** of that content — because a resume 
  tailored for one job application should be editable independently of 
  the user's master profile (this mirrors how FR-RESUME-003 "Resume 
  Optimization" already assumes per-job tailoring)

### ❌ CORRECTED — what the real `Resume` model actually looks like

There is **no `source` field** on `Resume` and no "source" concept anywhere in
the schema. The real model is:

```
Resume: id, userId, fileName*, fileUrl*, fileSize*, fileType* ("PDF"|"DOCX"),
        title?, isDefault, parsingStatus (enum, default PENDING), parsingError?,
        atsScore?, qualityScore?, version, parsedData (1:1 ParsedResumeData),
        applications[], createdAt, updatedAt, deletedAt
```
`*` = **required**. Consequences for Phase 5:

- An exported builder document can only become a `Resume` row **after** a real
  file exists — `fileName`, `fileUrl`, `fileSize` and `fileType` are all
  non-nullable. Upload first, then insert the row.
- `fileType` is a plain string constrained to `"PDF" | "DOCX"`, so a DOCX
  export is representable.
- **`parsingStatus` defaults to `PENDING`.** The upload flow enqueues a BullMQ
  `resume-parsing` job that runs the file back through the AI parser. Left
  alone, an exported resume would be *re-parsed into structured data we already
  have* — wasteful, circular, and it requires Redis to be running.

> **✅ DECIDED (2026-08-12) — exported resumes are NOT re-parsed.**
> Export writes the `Resume` row with `parsingStatus = SUCCESS` and populates
> `ParsedResumeData` **directly** from the builder content. The document is
> already structured; round-tripping it through the AI parser would cost money,
> require Redis, and can only *degrade* data we authored. Export must **not**
> enqueue a `resume-parsing` job. See Phase 5 for the exact mapping.

### ❌ CORRECTED — profile content hangs off `User`, not `Profile`

`Experience`, `Education`, `Certification` and `UserSkill` all FK to **`User`**
(`userId`), not to `Profile`. `Profile` is a separate 1:1-with-`User` record
holding name/contact/bio/preferences. Wherever this plan said "Profile data",
read "the user's profile-related records". Phase 4's import reads them by
`userId`.

### ❌ CORRECTED — the builder document has nowhere to put the résumé header

A résumé needs a header: name, email, phone, location, links. The proposed
`ResumeDocument` has **none of these**, and no child table covers it. The
existing `ParsedResumeData` model confirms they're needed — it stores
`fullName`, `email`, `phone`, `location`. `Profile` holds
`firstName`/`lastName`/`phone`/`city`/`state`/`country` and `User` holds
`email`.

> **✅ DECIDED (2026-08-12) — header fields are SNAPSHOTTED onto the document.**
> `ResumeDocument` gains `fullName`, `email`, `phone`, `location`,
> `linkedinUrl` and `portfolioUrl`. They are prefilled from Profile/User when
> the document is created, then **owned by the document** and independently
> editable — consistent with the "each document keeps its own copy" principle
> above, and it lets a user tailor the header per application. The header is
> **not** re-read from Profile at export time. These fields are part of the
> Phase 1 migration.
>
> Prefill sources at creation: `fullName` = `Profile.firstName + ' ' +
> Profile.lastName`; `email` = `User.email`; `phone` = `Profile.phone`;
> `location` = `Profile.city`/`state`/`country` joined; `linkedinUrl` /
> `portfolioUrl` = the matching `Profile` columns. All nullable — a user with no
> profile still gets a usable document with an empty header to fill in.

---

## Proposed data model (for Phase 1 to formalize)

```
ResumeTemplate
  id, name, category (e.g. "ats-friendly" | "modern" | "creative"),
  thumbnailUrl, isAtsFriendly (bool), layoutConfig (json — defines 
  section order/styling rules the renderer reads), isActive (bool),
  createdAt, updatedAt

ResumeDocument
  id, userId (FK), title (e.g. "Frontend Engineer — Google"),
  templateId (FK to ResumeTemplate), colorScheme (string, hex or preset
  key), lineSpacing (enum: SINGLE | DEFAULT | WIDE, maps to 1.0/1.15/1.5),
  margin (enum: NARROW | NORMAL | WIDE, maps to 0.5/0.75/1.0"),
  fontFamily (string, optional override),
  status (enum: DRAFT | FINALIZED),
  sourceResumeId (FK to Resume, nullable — set once exported/linked back),
  -- Résumé header, snapshotted at creation, then owned by the document.
  -- All nullable; see the header decision above.
  fullName, email, phone, location, linkedinUrl, portfolioUrl,
  createdAt, updatedAt, deletedAt

ResumeDocumentSummary
  id, resumeDocumentId (FK, 1:1), content (text)

ResumeDocumentExperience
  id, resumeDocumentId (FK), order (int), company, title, location,
  startDate, endDate, isCurrentJob, description,
  technologies (String[]), createdAt, updatedAt

ResumeDocumentEducation
  id, resumeDocumentId (FK), order (int), institution, degreeLevel,
  fieldOfStudy, startDate, endDate, gpa, description,
  createdAt, updatedAt

ResumeDocumentSkill
  id, resumeDocumentId (FK), order (int), name, proficiencyLevel (optional)

ResumeDocumentCertification
  id, resumeDocumentId (FK), order (int), name, issuer, issueDate,
  expirationDate, credentialId (optional), credentialUrl (optional)

ResumeDocumentProject
  id, resumeDocumentId (FK), order (int), name, description,
  technologies (String[]), url
```

All child tables cascade-delete with their parent `ResumeDocument`. Every 
child table has an `order` field so the frontend can support drag-to-
reorder without needing a separate ordering service.

### ❌ CORRECTED — field names now mirror the real models

The original draft invented names that don't exist. Actual source models:

| Draft field | Reality | Note |
|---|---|---|
| Experience `technologies` (json) | `String[]` | Postgres array, not Json — matches `Experience.technologies` |
| Experience `location` | **does not exist** on `Experience` | Kept on the builder table (a résumé line needs it) but it **cannot be imported** — nothing to import from |
| Education `degree` | `degreeLevel` (`DegreeLevel` enum) | |
| Education `field` | `fieldOfStudy` | |
| Education `graduationDate` | `startDate` + `endDate?` | There is no single graduation date |
| Education `honors` | **does not exist** | Dropped — no source, and nothing else in the app uses it |
| Certification `organization` | `issuer` | |
| Certification `issuedDate` | `issueDate` | |
| Skill `proficiency` | `UserSkill.proficiencyLevel` (String: BEGINNER/INTERMEDIATE/ADVANCED/EXPERT) | |
| Skill `name` | lives on **`Skill.name`**, reached via `UserSkill.skillId` | Import must join `UserSkill → Skill` |

**Enums:** `degreeLevel` should reuse the existing `DegreeLevel` enum rather than
a new string. Whether experience should also carry `JobLevel`/`EmploymentType`
is a judgement call — they're on `Experience` but rarely printed on a résumé, so
they're omitted above.

**Soft delete:** every user-owned model in this schema (`Resume`, `Experience`,
`Education`, `Certification`, `UserSkill`, `Profile`) carries `deletedAt`.
`ResumeDocument` follows that. The **child tables deliberately do not** — they
are owned by the document and cascade with it, so a tombstone would be dead
weight. Flagging the divergence so it reads as intentional.

### ❌ CORRECTED — there is no `Project` model

`ResumeDocumentProject` is fine as a **builder-only** section, but there is
**no `Project` model anywhere in `schema.prisma`** to import from. The only
project data in the system is `ParsedResumeData.projects`, a **JSON string**
extracted from an *uploaded* résumé. See Phase 4 for the consequences.

---

## Proposed API surface (for Phase 3 to formalize)

```
# Templates  (READ-ONLY for users — see the template-ownership constraint.
#             No POST/PATCH/DELETE, no upload. Seeded by us; any future
#             management API is admin-only and out of scope for Phases 1-6.)
GET    /resume-builder/templates              @Public(). list, filterable by 
                                                ?atsOnly=true&category=

# Documents
POST   /resume-builder/documents               create a new draft
GET    /resume-builder/documents               list user's own documents
GET    /resume-builder/documents/:id            get one, full content
PATCH  /resume-builder/documents/:id            update settings 
                                                 (template, spacing, 
                                                 margin, color, title)
DELETE /resume-builder/documents/:id            soft delete
POST   /resume-builder/documents/:id/duplicate  clone as a new draft

# Content sections (each supports bulk-replace for simplicity, since the 
# frontend editor will likely send the full section on save rather than 
# diffing individual fields)
PUT    /resume-builder/documents/:id/summary
PUT    /resume-builder/documents/:id/experience
PUT    /resume-builder/documents/:id/education
PUT    /resume-builder/documents/:id/skills
PUT    /resume-builder/documents/:id/certifications
PUT    /resume-builder/documents/:id/projects

# Profile import
POST   /resume-builder/documents/:id/import-from-profile
       body: { sections: ["summary","experience","education","skills",
                          "certifications"] }
       prefills the specified sections from the user's live profile data.
       "projects" is NOT accepted for MVP — no Project model exists.
       See decision 4.

# Export
POST   /resume-builder/documents/:id/export
       body: { format: "pdf" }        # PDF-only for MVP — see decision 6.
       renders the document, stores the file, and returns a signed download
       URL (also creates/links a Resume row per the "fits into what exists" 
       note above)
```

### ❌ CORRECTED — auth is secure-by-default

`JwtAuthGuard` is registered globally as an `APP_GUARD` in `app.module.ts`, so
**every route requires a JWT unless explicitly marked `@Public()`**. The
templates endpoint therefore needs an explicit `@Public()` decorator — it will
not be open just by omitting a guard.

> **✅ DECIDED (2026-08-12) — `GET /resume-builder/templates` is `@Public()`.**
> It carries no user content, so it follows the same pattern as `GET /jobs`,
> `GET /jobs/:id` and `GET /skills/:skillId/learning-resources`. It must carry
> an explicit `@Public()` decorator to bypass the global guard.
> Being public makes it read-only in the strongest sense: see the template-
> ownership constraint at the top — there is no user-facing write route of any
> kind on templates.

### ❌ CORRECTED — the export download URL

`StorageService.upload()` returns `getPublicUrl(...)`, but **`resumes` is a
private bucket** — that URL will not resolve for a caller. Export must call
`storage.getSignedUrl('resumes', path, expiresInSeconds)` separately to produce
a working download link. (The existing upload flow stores the public URL in
`Resume.fileUrl` regardless; treat `fileUrl` as a storage pointer, not a
fetchable link.)

---

## Phases

Work through these in order. Each has a ready-to-paste Claude Code 
prompt. Don't start Phase N+1 until Phase N is reviewed and merged.

---

### Phase 0 — Confirm the data model (no code changes)

> **STATUS: effectively done.** The 2026-08-11 review answered items 1–3 inline
> above (real `Resume` shape, real profile-model field names, no `Project`
> model, missing header fields), and the 2026-08-12 decisions settled everything
> that was still open. The only thing left is transcribing the agreed schema —
> including the snapshotted header columns — into
> `docs/RESUME_BUILDER_DATA_MODEL.md` as ready-to-paste Prisma syntax. Run the
> prompt below only for that; it should not re-derive what is already recorded
> here, and it must not reopen the settled decisions.

**Why first:** the schema above is a proposal, not gospel — worth a real 
codebase check before committing to it, especially the relationship to 
the existing `Resume` model.

```
I'm planning a new "Resume Builder" feature for jobfit-backend — a 
from-scratch, in-app resume creation tool (template picker, line 
spacing/margin/color controls, structured content sections), distinct 
from the existing upload-a-file resume flow. Before any code changes, 
review and confirm/adjust a proposed data model. Do NOT modify 
schema.prisma or write any code in this phase.

1. Review the current Resume model in schema.prisma and the resume 
   module's structure (src/modules/resume/). Confirm whether treating a 
   builder-created resume as eventually producing a normal Resume row 
   (via a sourceResumeId link, once exported) is compatible with how 
   ATS scoring, resume parsing, and "select resume when applying" 
   currently work — flag anything that would break or need adjustment.

2. Review the existing profile-related models and confirm field names/
   types so the builder's own content tables mirror them consistently 
   rather than drifting into different naming. NOTE (verified 2026-08-11): 
   these are Experience, Education, Certification and UserSkill (joined to 
   the shared-kernel Skill catalogue) — all FK'd to User, not Profile. 
   There is NO Project model; do not look for one.

3. Propose the following data model, adjusting anything that conflicts 
   with what you find in steps 1-2:

   ResumeTemplate: id, name, category, thumbnailUrl, isAtsFriendly, 
   layoutConfig (json), isActive, createdAt, updatedAt

   ResumeDocument: id, userId (FK), title, templateId (FK), colorScheme, 
   lineSpacing (enum SINGLE/DEFAULT/WIDE), margin (enum NARROW/NORMAL/
   WIDE), fontFamily (nullable), status (enum DRAFT/FINALIZED), 
   sourceResumeId (FK to Resume, nullable), createdAt, updatedAt, 
   deletedAt

   Child tables (ResumeDocumentSummary, ResumeDocumentExperience, 
   ResumeDocumentEducation, ResumeDocumentSkill, 
   ResumeDocumentCertification, ResumeDocumentProject) each FK'd to 
   ResumeDocument with cascade delete, each with an `order` int field 
   except Summary (which is 1:1, just a text field).

4. Write your findings and the final proposed schema (as Prisma model 
   syntax, ready to paste into schema.prisma in Phase 1) to 
   docs/RESUME_BUILDER_DATA_MODEL.md. Include a short note on how export 
   will link back to the Resume model, and flag any open questions for 
   me to decide before Phase 1.

Show me the file content when done. Do not modify schema.prisma.
```

---

### Phase 1 — Schema & Migration

> **❌ CORRECTED — `pnpm prisma migrate dev` DOES NOT WORK in this repo.**
> It fails before generating anything:
> ```
> Error: P3006
> Migration `20260809090000_offer_messages` failed to apply cleanly to the
> shadow database. Error code: P1014
> The underlying table for model `offers` does not exist.
> ```
> `migrate dev` replays every migration into a throwaway shadow database, and
> **no migration ever creates the `offers` table** (it was created out-of-band).
> This blocks *any* schema change, not just this feature. The working pattern —
> and this repo's actual convention, every existing migration is hand-authored
> with explanatory comments — is:
> 1. Edit `schema.prisma`
> 2. Hand-write `prisma/migrations/<YYYYMMDDHHMMSS>_resume_builder/migration.sql`
> 3. `pnpm prisma migrate deploy` (no shadow DB)
> 4. `pnpm prisma generate`
> 5. `pnpm prisma migrate status` → expect "Database schema is up to date!"

```
Implement the Resume Builder data model in jobfit-backend, per 
docs/RESUME_BUILDER_DATA_MODEL.md from Phase 0 (read it first — use the 
finalized schema from that doc, not the draft in this prompt, if they 
differ).

1. Add the ResumeTemplate, ResumeDocument, and the six child content 
   tables to schema.prisma, following the existing style/conventions 
   already used elsewhere in the file (naming, @@map usage, index 
   patterns).

   ResumeDocument MUST include the snapshotted résumé header columns 
   (decision 1): fullName, email, phone, location, linkedinUrl, 
   portfolioUrl — all nullable String. These are owned by the document, 
   prefilled from Profile/User at creation, and never re-read from Profile 
   afterwards.

   ResumeTemplate is INTERNAL reference data (see the template-ownership 
   constraint at the top): it has no userId, no ownership column, and 
   nothing about it is user-writable. layoutConfig is authored by us.

2. Add appropriate indexes: ResumeDocument on userId, each child table 
   on resumeDocumentId, ResumeTemplate on isActive+category for the 
   template-listing query.

3. Do NOT run `pnpm prisma migrate dev` — it is broken in this repo (see the 
   note above). Instead hand-write the migration SQL under 
   prisma/migrations/<timestamp>_resume_builder/migration.sql, matching the 
   commented style of the existing migrations, then run 
   `pnpm prisma migrate deploy` and `pnpm prisma generate`. Confirm 
   `pnpm prisma migrate status` reports no drift and `pnpm run start:dev` 
   boots clean with zero TypeScript errors referencing the new models.

4. Add to prisma/seed.ts (existing pattern: `prisma.<model>.upsert` keyed on 
   a stable id or unique field, so re-seeding is idempotent — see the skill/ 
   industry/company/job blocks) 3 starter ResumeTemplate rows matching 
   the reference screenshot: one plain single-column ATS-friendly 
   template as the default, and two visual variants — mark all three 
   isAtsFriendly: true for now since ATS-safety is the priority for 
   MVP. Give each a placeholder thumbnailUrl for now.

   The seed is the ONLY way templates enter the system. Do not add any 
   endpoint, script or admin route for creating templates in this phase — 
   see the template-ownership constraint at the top of this doc.

5. Run `pnpm db:seed` (script is `ts-node prisma/seed.ts`) and confirm the 
   3 templates exist in the database.

Show me `git diff` before I approve committing. Do not push.
```

---

### Phase 2 — Templates Module (read-only)

> **✅ VERIFIED (with a correction).** The layered structure is real: `job` has
> `presentation/ application/ domain/ infrastructure/`, and 12 of 20 modules
> follow it (`admin`, `application`, `auth`, `employer`, `ingestion`, `job`,
> `learning`, `matching`, `resume`, `saved-job`, `sync`, `user`). The other 8
> are flat single-file modules (`company`, `notification`, `offer`, `payment`,
> `generation`, `alerting`, `health`, `metrics`) — so "the standard structure"
> is a majority convention, not universal.
> Two corrections: **there is no `docs/architecture`** (the file is
> `docs/ARCHITECTURE_ALIGNMENT.md`), and **mirror `resume`, not `job`** — it is
> the closest sibling. Note the two differ on DTO placement: `job` uses
> `presentation/dto/`, `resume` uses `application/dtos/`. Follow `resume`.

```
Build the read-only templates API for the Resume Builder feature in 
jobfit-backend, following the layered module structure used by the 
`resume` module (src/modules/resume/): presentation/controllers, 
application/services, application/dtos, domain/entities, 
infrastructure/repositories. Mirror `resume` rather than `job` — it is the 
closest sibling and it puts DTOs under application/dtos.

1. Create src/modules/resume-builder/ with that structure. Register it in 
   app.module.ts.

2. Implement GET /resume-builder/templates:
   - Query params: atsOnly (boolean, optional), category (string, 
     optional)
   - Returns active templates only (isActive: true)
   - Mark it @Public() (decision 3). JwtAuthGuard is a global APP_GUARD, so 
     without that decorator the route would require a JWT. Follow the same 
     pattern as GET /jobs in job.controller.ts.

   This module is READ-ONLY for users. Do NOT add create/update/delete/
   upload routes for templates, and do NOT expose layoutConfig as a 
   writable field anywhere — see the template-ownership constraint at the 
   top of this doc. Templates come from the Phase 1 seed. If we later need 
   template management it goes under /admin/* behind @Roles('ADMIN'), and 
   that is out of scope here.

3. Add a response DTO (ResumeTemplateResponseDto) under application/dtos, 
   following the existing convention: a plain class with @ApiProperty/
   @ApiPropertyOptional on each field and a constructor that maps from the 
   domain entity (see ExperienceResponseDto / ApplicationResponseDto).

4. Write tests as `*.spec.ts` colocated in src/ (that is what `pnpm test` 
   runs — rootDir is src/, testRegex `.*\.spec\.ts$`). There is no 
   DB-backed integration harness: follow the established pattern of 
   instantiating the service directly with a hand-rolled in-memory Prisma 
   stand-in cast via `as unknown as PrismaService` (see 
   src/modules/sync/sync.service.spec.ts or alerting.service.spec.ts). 
   Cover: returns seeded templates, atsOnly filter works, category filter 
   works, inactive templates are excluded, and the route is reachable 
   without a JWT (assert @Public() metadata is present on the handler).

5. Add Swagger documentation matching the style of existing endpoints: 
   @ApiTags on the controller, @ApiOperation({ summary, description }) per 
   route, @ApiBearerAuth() when authenticated, @ApiOkResponse({ type }) for 
   the response DTO.

6. Confirm `pnpm run start:dev` boots clean and `pnpm test` passes.

Show me `git diff` before I approve committing. Do not push.
```

---

### Phase 3 — Document CRUD & Content Sections

```
Build the core Resume Builder document CRUD and content-section 
endpoints in jobfit-backend, in the resume-builder module created in 
Phase 2.

1. Implement:
   POST   /resume-builder/documents
   GET    /resume-builder/documents
   GET    /resume-builder/documents/:id
   PATCH  /resume-builder/documents/:id
   DELETE /resume-builder/documents/:id  (soft delete via deletedAt)
   POST   /resume-builder/documents/:id/duplicate

   All routes authenticated. A user may only access their own documents 
   — return 404 (not 403, to avoid leaking existence) if a user requests 
   a document they don't own. Write an explicit test for this.
   NOTE (verified 2026-08-11): the codebase is inconsistent here — 
   ResumeService returns 404 for a resume the caller doesn't own 
   (resume.service.ts), while ApplicationController and the 
   experience/education controllers throw 403 ForbiddenException. 404 is 
   the right choice for builder documents and matches the `resume` module 
   we're mirroring; the divergence from `application` is deliberate.

2. POST /resume-builder/documents should require at minimum a `title` 
   and `templateId`, defaulting lineSpacing/margin/colorScheme to 
   sensible defaults (DEFAULT spacing, NORMAL margin, first available 
   preset color) if not provided.

   It must also SNAPSHOT the résumé header onto the new document 
   (decision 1): fullName from Profile.firstName + ' ' + Profile.lastName, 
   email from User.email, phone from Profile.phone, location from 
   Profile.city/state/country, linkedinUrl and portfolioUrl from the 
   matching Profile columns. A user with no Profile row must still get a 
   valid document — leave the header fields null rather than failing. 
   After creation these fields belong to the document: PATCH may edit them, 
   and they are never re-read from Profile. Write a test that editing the 
   document header does not touch Profile, and that editing Profile 
   afterwards does not change an existing document.

   templateId must reference an existing ACTIVE template; reject unknown or 
   inactive ids. Users select from our templates — they never supply one.

3. Duplicate should deep-copy the document AND all its child content 
   rows (summary, experience, education, etc.) as a new ResumeDocument 
   with status reset to DRAFT and a title like "{original title} (Copy)".

4. Implement the six content-section endpoints as bulk-replace PUTs:
   PUT /resume-builder/documents/:id/summary
   PUT /resume-builder/documents/:id/experience
   PUT /resume-builder/documents/:id/education
   PUT /resume-builder/documents/:id/skills
   PUT /resume-builder/documents/:id/certifications
   PUT /resume-builder/documents/:id/projects

   Each PUT (except summary) accepts an array and should: delete all 
   existing rows for that section on that document, then insert the new 
   array in the given order, setting the `order` field from array index. 
   Wrap each in a Prisma transaction so a partial failure doesn't leave 
   the section half-updated.

5. GET /resume-builder/documents/:id should return the full nested 
   document — settings plus all six sections — in one response, so the 
   frontend editor can load everything in a single call.

6. Write integration tests covering: create, list (only returns caller's 
   own documents), get, patch settings, delete, duplicate (confirms deep 
   copy including content), each section PUT (confirms replace semantics 
   — putting a shorter array actually removes the extra old rows, not 
   just appends).

7. Confirm `pnpm run start:dev` boots clean and `pnpm test` passes.

Show me `git diff` before I approve committing. Do not push.
```

---

### Phase 4 — Import From Profile

> **❌ CORRECTED — two assumptions in this phase were wrong.**
>
> **1. "projects" cannot be imported.** There is no `Project` model in
> `schema.prisma`. The only project data in the system is
> `ParsedResumeData.projects` — a **JSON string** attached to an *uploaded*
> résumé, produced by the AI parser. So `"projects"` must be removed from the
> importable list (the builder section itself stays; it is just manual-entry).
>
> **2. "summary has no equivalent to copy from" is false.** `Profile` has both
> `bio` (free text) and `headline` (e.g. "Senior Software Engineer at Google").
> Either is a reasonable summary source, so summary *can* be importable.
>
> **✅ DECIDED (2026-08-12) — projects import is DEFERRED, not cancelled.**
> `"projects"` is not an accepted section for MVP: there is no `Project` model
> to read from, so users type projects manually into the builder's project
> section. The idea is **parked, not deleted** — the natural future
> implementation is importing from a chosen uploaded résumé's
> `ParsedResumeData.projects` JSON, which needs a shape contract for that
> untyped string and assumes the user has uploaded and successfully parsed a
> résumé first. Record it in `docs/RESUME_BUILDER_KNOWN_GAPS.md` in Phase 6 as
> a deferred enhancement so it is not mistaken for a dropped requirement.
>
> **✅ DECIDED (2026-08-12) — summary imports from `Profile.bio`, falling back
> to `Profile.headline`.** If `bio` is null or blank, use `headline`. If both
> are empty, the summary section is left empty — that is a success, not an
> error.

```
Add the "import from profile" feature to the Resume Builder in 
jobfit-backend, letting a user prefill a document's sections from their 
existing profile data instead of retyping everything.

1. Implement POST /resume-builder/documents/:id/import-from-profile
   body: { sections: string[] }  
   Valid values: "summary", "experience", "education", "skills", 
   "certifications". 
   "projects" is NOT importable for MVP — there is no Project model 
   (decision 4). Reject it with a clear validation error naming the 
   accepted values, rather than silently ignoring it.

2. For each requested section, read the user's live data from the 
   corresponding table — Experience, Education, Certification and 
   UserSkill, all keyed by userId (they FK to User, not Profile). For 
   skills you must join UserSkill -> Skill to get the display name; 
   UserSkill itself only holds skillId, proficiencyLevel, 
   yearsOfExperience and endorsementCount. Filter out soft-deleted rows 
   (deletedAt: null) — every one of these models uses soft delete. 
   Copy into the matching ResumeDocument child table, replacing whatever 
   was there before (same replace semantics as the Phase 3 PUT endpoints 
   — reuse that logic rather than duplicating it).

   Field mapping is NOT 1:1 — see the corrected table in the data-model 
   section above. In particular: Education has startDate/endDate (no 
   graduationDate) and degreeLevel/fieldOfStudy (not degree/field); 
   Certification has issuer/issueDate (not organization/issuedDate); 
   Experience has no location field, so the document's location column 
   is left empty on import for the user to fill in.

   "summary" is a special case (decision 5): it reads Profile.bio, falling 
   back to Profile.headline when bio is null or blank. If both are empty, 
   write an empty summary — that is success, not an error. Summary is 1:1 
   with the document, so "replace" here means overwrite the single row.

   Note this endpoint imports CONTENT only. It never changes the document's 
   template or presentation settings, and it does not touch the snapshotted 
   header fields from Phase 3 — those were set at creation and are the 
   user's to edit.

3. This is explicitly a one-time copy, not a live link — after import, 
   editing the ResumeDocument's experience should NOT affect the user's 
   actual Profile experience, and vice versa. Write a test confirming 
   this isolation.

4. Write tests (`*.spec.ts` under src/, in-memory Prisma stand-in — see the 
   Phase 2 note): importing "experience" when the user has 3 profile 
   experiences results in 3 matching rows on the document; importing when 
   the user has zero profile data for a section results in an empty 
   section, not an error; soft-deleted profile rows are NOT imported; 
   requesting "projects" is rejected with a validation error; summary 
   falls back to headline when bio is blank and yields an empty summary 
   when both are empty; a user cannot trigger import on a document they 
   don't own.

5. Confirm `pnpm run start:dev` boots clean and `pnpm test` passes.

Show me `git diff` before I approve committing. Do not push.
```

---

### Phase 5 — Export Pipeline (PDF/DOCX rendering)

**Why this is its own phase:** rendering is the riskiest, most novel part 
of this feature (new dependency, new failure modes) — isolate it so a 
rendering bug doesn't block everything else.

> **✅ INVESTIGATION DONE (2026-08-11) — nothing exists to reuse.**
>
> **No PDF/DOCX *generation* library is installed.** Checked `package.json`
> for puppeteer, playwright, pdfkit, pdf-lib, jspdf, docx, html-pdf, handlebars,
> ejs, pug, exceljs, officegen — **none present**.
>
> What *is* installed points the other way — both are **extract/read**
> libraries used by the résumé *parser*:
> - `mammoth` ^1.12.0 — DOCX → plain text (`resume-parser.service.ts:152`)
> - `pdfjs-dist` 3.11.174 — PDF → text (`pdf-reading-order.ts`)
>
> (Note: `pdf-parse` is referenced in a historical comment but is **no longer a
> dependency** — it was replaced by `pdfjs-dist`. Nothing imports it.)
>
> **There is also no ATS report export code.** A repo-wide search for
> `generatePdf|createPdf|toPdf|exportReport|renderPdf|buildDocx` returns
> nothing. The "ATS report export" mentioned in the SRS is not implemented, so
> there is no precedent to follow.
>
> **Conclusion: Phase 5 introduces the first document-generation dependency in
> this codebase.** Step 1 below is therefore a genuine proposal-and-approve
> step, not a search. Sketch of the trade-offs to present:
> - **Puppeteer/Chromium (HTML→PDF)** — best typographic fidelity, template
>   layouts authored as HTML/CSS (a natural fit for `layoutConfig`), one engine
>   for every template. Cost: ~300MB Chromium download, meaningful memory per
>   render, and it needs a Docker base image with the right shared libs —
>   check `Dockerfile` before committing to it. Does **not** produce DOCX.
> - **pdfkit / pdf-lib (programmatic PDF)** — tiny, no browser, fast. Cost: you
>   hand-code every layout; CSS-like control is absent.
> - **`docx` library** — the realistic way to emit real .docx. Separate
>   rendering path from the PDF one, i.e. **two renderers to keep in sync**.
>
> **✅ DECIDED (2026-08-12) — MVP is PDF-ONLY. DOCX is a labelled future
> enhancement, not a cancelled one.** Supporting both means two independent
> renderers and roughly double the template work, and ATS parsers handle PDF
> fine. So:
> - The export DTO's `format` accepts **only `"pdf"`** for MVP. Do not accept
>   `"docx"` and return 501 — reject it at validation with the list of
>   supported formats, so the API never advertises something it cannot do.
> - `Resume.fileType` still permits `"DOCX"` (the column is shared with the
>   upload flow) — that is fine and needs no change.
> - **Future — DOCX export:** add a second renderer behind the same endpoint
>   (the `docx` library is the realistic option) and widen the `format` enum.
>   Record this in `docs/RESUME_BUILDER_KNOWN_GAPS.md` in Phase 6 so it stays
>   visible as deferred scope rather than looking like an oversight.
>
> Because MVP is PDF-only, evaluate PDF engines only: Puppeteer vs
> pdfkit/pdf-lib. The `docx` library is not needed yet.

```
Implement resume export (PDF generation) for the Resume Builder in 
jobfit-backend. MVP is PDF-ONLY — DOCX is deferred (decision 6).

1. ALREADY INVESTIGATED — see the box above: no generation library exists, 
   and there is no ATS report export to reuse. Do NOT re-search. Propose a 
   PDF library with trade-offs (Puppeteer vs pdfkit/pdf-lib; check the 
   Dockerfile if proposing Puppeteer) and get my approval BEFORE installing 
   anything. Do not install a DOCX library — it is not in MVP scope.

2. Implement POST /resume-builder/documents/:id/export
   body: { format: "pdf" }   // only value accepted for MVP; reject anything 
                             // else at validation, do not 501
   
   - Load the full document (settings + all sections)
   - Render it according to its ResumeTemplate's layoutConfig, applying 
     the document's lineSpacing/margin/colorScheme/fontFamily settings
   - Upload to Supabase Storage via the shared StorageService (verified 
     2026-08-11): `storage.upload('resumes', path, buffer, contentType)`. 
     The bucket literal is 'resumes' (typed StorageBucket union; config 
     default in supabase.config.ts, override SUPABASE_BUCKET_RESUMES). 
     Follow the deterministic path convention in resume.service.ts 
     (storagePath(userId, resumeId, fileName)) so the file can be found 
     again for deletion.
   - Create a new Resume row pointing at the generated file. There is NO 
     `source` field on Resume — do not invent one. You MUST supply 
     fileName, fileUrl, fileSize and fileType ("PDF" for MVP); all four 
     are required.
   - Set parsingStatus = SUCCESS and write ParsedResumeData DIRECTLY from 
     the builder content (decision 2). Do NOT enqueue a 'resume-parsing' 
     job — the document is already structured, so re-parsing the PDF we 
     just generated would cost an AI call, require Redis, and can only 
     degrade the data. Map: fullName/email/phone/location from the 
     document's snapshotted header; summary from the summary section; 
     experiences/educations/skills/certifications from the child tables, 
     JSON.stringify'd (those ParsedResumeData columns are JSON STRINGS, 
     not Json columns — check the model). Leave `projects` null for MVP. 
     Set parsedBy to something that identifies the builder (e.g. 
     "resume-builder") rather than "ai"/"heuristic", so a parsed row can 
     be traced to its origin.
   - Set the ResumeDocument's sourceResumeId to link back to it.
   - Return the new Resume's id and a download URL obtained from 
     `storage.getSignedUrl('resumes', path)`. Do NOT return the value 
     `storage.upload()` returns — that is a PUBLIC url and the resumes 
     bucket is private, so it will not resolve.

3. Handle rendering failure gracefully — if rendering throws, return a 
   clear error, do not create a partial/broken Resume row.

4. Write tests (`*.spec.ts` under src/, in-memory Prisma stand-in — see the 
   Phase 2 note): export produces a valid file (check non-zero byte size / 
   correct mime type at minimum, full visual correctness isn't practical to 
   unit test), a Resume row is correctly created and linked, ParsedResumeData 
   is written directly with parsingStatus SUCCESS and NO parsing job is 
   enqueued (assert the queue is never called — decision 2), format "docx" 
   is rejected at validation (decision 6), and exporting a document with 
   empty sections doesn't crash (should render gracefully, e.g. skip empty 
   sections rather than showing blank headers).

5. Confirm `pnpm run start:dev` boots clean and `pnpm test` passes.

Show me `git diff` before I approve committing. Do not push.
```

---

### Phase 6 — Documentation & Final Verification

```
Finalize documentation and do an end-to-end check of the Resume Builder 
backend work from Phases 1-5.

1. Write docs/RESUME_BUILDER_API.md covering every endpoint built: 
   request/response shapes, auth requirements, the section-replace 
   semantics, the import-from-profile isolation behavior, and the 
   export/Resume-linking behavior — include one worked example showing 
   the full lifecycle: create document → set template/settings → fill 
   sections → import from profile → export → resulting Resume row.

2. Confirm every new endpoint appears correctly in Swagger/OpenAPI. It is 
   mounted at /api/docs (UI) with the raw spec at /api/docs-json — fetch 
   the JSON and assert the paths and $ref'd DTO schemas are present rather 
   than eyeballing the UI.

3. Run `pnpm test` and confirm everything from Phases 1-5 passes together.
   NOTE (verified 2026-08-11): `pnpm test:e2e` currently FAILS for reasons 
   unrelated to this feature — the specs in test/ call unprefixed URLs 
   (e.g. /auth/register) while main.ts sets a global api/v1 prefix, and 
   test/app.e2e-spec.ts is the untouched Nest scaffold expecting 
   "Hello World!" at /. Do not treat a red test:e2e as a Resume Builder 
   regression, and do not try to fix it as part of this feature.

4. Write a short docs/RESUME_BUILDER_KNOWN_GAPS.md listing anything 
   deferred, so nothing gets assumed done that isn't. It MUST include the 
   backend scope deliberately deferred by the 2026-08-12 decisions, not 
   just frontend items:
   - DOCX export (decision 6) — MVP is PDF-only; needs a second renderer 
     and a widened format enum.
   - Projects import from profile (decision 4) — no Project model exists; 
     the parked approach is reading an uploaded résumé's 
     ParsedResumeData.projects JSON, which needs a shape contract.
   - Admin template management (template-ownership constraint) — templates 
     are seed-only for now; any management API belongs under /admin/* 
     behind @Roles('ADMIN').
   - ATS/quality scoring of builder-generated resumes — the export writes 
     atsScore/qualityScore as null; confirm whether the existing scoring 
     path picks them up.
   Plus the frontend items: live preview rendering, drag-to-reorder UI, 
   template thumbnail generation/design.

Show me the final docs before I review. Do not push anything without my 
explicit confirmation.
```

---

## After Phase 6

Once backend Phases 0-6 are reviewed and merged, the next step is the 
frontend builder UI (template picker, live preview, section editors, 
drag-to-reorder) — that's a separate plan, out of scope here per backend-
first instruction.

---

## ✅ Decisions — index (all settled 2026-08-12)

Six product decisions were surfaced by the 2026-08-11 codebase review and
settled on 2026-08-12. **All are now folded into the phase text above** — this
table is the summary, the phases are the source of truth.

| # | Decision | Settled as | Applied in |
|---|---|---|---|
| 1 | Header fields on `ResumeDocument` | **Snapshot** — `fullName`, `email`, `phone`, `location`, `linkedinUrl`, `portfolioUrl` are columns on the document, prefilled at creation, never re-read from Profile | Data model, Phase 1 step 1, Phase 3 step 2 |
| 2 | Re-parse exported resumes? | **No** — write `ParsedResumeData` directly with `parsingStatus = SUCCESS`; never enqueue a parsing job | Phase 5 step 2, Phase 5 step 4 |
| 3 | Is `GET /resume-builder/templates` public? | **Yes, `@Public()`** — matches `GET /jobs` | API surface, Phase 2 steps 2 & 4 |
| 4 | Projects import | **Deferred, not cancelled** — not importable for MVP; parked approach recorded in known-gaps | Phase 4 header, steps 1 & 4, Phase 6 step 4 |
| 5 | Summary import source | **`Profile.bio`, falling back to `Profile.headline`**; empty is success | Phase 4 header, step 2, step 4 |
| 6 | Is DOCX export in MVP scope? | **No — PDF-only.** DOCX is a labelled future enhancement; `format` rejects anything but `"pdf"` at validation | Phase 5 header, steps 1, 2, 4; Phase 6 step 4 |

Nothing is left blocking. The deferred items (4 and 6) plus admin template
management are carried forward into `docs/RESUME_BUILDER_KNOWN_GAPS.md` in
Phase 6 so they stay visible as scope, not as oversights.

---

## Review log

**2026-08-11 — plan checked against the codebase.** Corrected: the `Resume`
model has no `source` field and four required file columns; profile content FKs
to `User` not `Profile`; there is no `Project` model; `Profile` *does* have a
summary-equivalent (`bio`/`headline`); child-table field names now mirror the
real `Experience`/`Education`/`Certification`/`UserSkill` columns; the document
had nowhere to store the résumé header; `prisma migrate dev` is broken in this
repo; auth is secure-by-default so `@Public()` must be explicit; no PDF/DOCX
generation library exists anywhere; `storage.upload()` returns a public URL that
won't resolve for the private `resumes` bucket; `pnpm test:e2e` is already red
for unrelated reasons. Verified as-written: the layered module structure, the
soft-delete convention, cascade-delete children, and the 404-on-not-owned choice.

**2026-08-12 — all six open decisions settled and folded into the phases.**
Snapshot header fields (1); no re-parse on export (2); public templates
endpoint (3); projects import deferred (4); summary from `bio` → `headline`
(5); PDF-only MVP with DOCX deferred (6). Also added the **template-ownership
constraint**: `ResumeTemplate` rows are in-house designs, seeded by us, with no
user-facing create/upload/customise route anywhere — any future management API
is admin-only and out of scope for Phases 1–6. Phase 6's known-gaps deliverable
now explicitly carries the deferred backend scope so it is not mistaken for
completed work.
