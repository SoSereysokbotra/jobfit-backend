# JobFits — Resume Builder API

**Audience:** whoever builds the builder UI.
**Status:** backend Phases 1, 3, 4, 5 complete. **Phase 2 was never run** — there is
no `GET /resume-builder/templates` endpoint yet (see
`RESUME_BUILDER_KNOWN_GAPS.md`).
**Base URL:** every path is relative to the global `/api/v1` prefix (`src/main.ts`).
**Interactive:** `/api/docs` (Swagger UI) · `/api/docs-json` (raw OpenAPI).

**Auth:** every endpoint below requires a Bearer JWT and is **self-scoped** — the
user comes from the token, never from the path. There is no `:userId` parameter.

---

## 1. The model in one paragraph

A **ResumeDocument** is a structured résumé you compose in-app, distinct from the
existing upload-a-file `Resume`. It picks one of **our** templates, carries
presentation settings (colour/spacing/margin/font), a snapshotted contact header,
and six content sections. **Exporting** renders it to PDF, stores the file, and
creates a normal `Resume` row — so a built résumé flows into ATS scoring and the
"select résumé when applying" picker with no special-casing.

---

## 2. Documents

### `POST /resume-builder/documents` → 201

```jsonc
{
  "title": "Frontend Engineer — Google",   // required
  "templateId": "…",                        // required, must be an ACTIVE template
  "colorScheme": "navy",                    // optional, preset KEY (not hex)
  "lineSpacing": "DEFAULT",                 // SINGLE | DEFAULT | WIDE
  "margin": "NORMAL",                       // NARROW | NORMAL | WIDE
  "fontFamily": null                        // optional
}
```

Defaults when omitted: `colorScheme: "default"`, `lineSpacing: DEFAULT`,
`margin: NORMAL`. Colour presets are `default | navy | forest | burgundy | slate`
— **preset keys, not hex values**; anything else is a 400.

**The contact header is snapshotted server-side, not supplied by you.** At creation
the document copies `fullName` (Profile first+last), `email` (User), `phone`,
`location` (Profile city/state/country, joined, skipping blanks), `linkedinUrl` and
`portfolioUrl`. A user with **no profile still gets a valid document** with a null
header rather than an error.

After creation those fields **belong to the document**: `PATCH` may edit them, and
they are never re-read from the profile. Editing them does not write back to the
profile, and later profile edits do not change an existing document.

`templateId` must reference an **active** template — unknown or retired ids are a
**400**. You select from our templates; you never supply one.

Returns `ResumeDocumentListItemDto` (settings + header, no sections).

### `GET /resume-builder/documents` → 200

Array of `ResumeDocumentListItemDto`, most recently updated first, yours only.
Settings only — use `GET /:id` for content.

### `GET /resume-builder/documents/:id` → 200

`ResumeDocumentDetailDto` — settings, header **and all six sections** in one
response, so the editor loads everything in a single call. Sections come back
sorted by `order`. `summary` is a plain string (`""` when never set).

### `PATCH /resume-builder/documents/:id` → 200

Partial update of title, `templateId` (must be active), presentation settings,
`status` (`DRAFT | FINALIZED`), and any header field. Omitted fields are untouched.

### `DELETE /resume-builder/documents/:id` → 204

Soft delete (`deletedAt`). **An already-exported `Resume` is deliberately NOT
deleted** — you may already have attached it to submitted applications.

### `POST /resume-builder/documents/:id/duplicate` → 201

Deep-copies settings, header and every content row as `"{title} (Copy)"`, with
`status` reset to `DRAFT` and **no export link** (a copy has never been exported).

> ### 404, never 403
> Every id-scoped route returns **404 for a document you don't own**, identical to
> one that doesn't exist. A 403 would confirm the id exists. This matches the
> `resume` module; the `application` module's 403 is the outlier.

---

## 3. Content sections — bulk replace

```
PUT /resume-builder/documents/:id/summary          → 204
PUT /resume-builder/documents/:id/experience       → 204
PUT /resume-builder/documents/:id/education        → 204
PUT /resume-builder/documents/:id/skills           → 204
PUT /resume-builder/documents/:id/certifications   → 204
PUT /resume-builder/documents/:id/projects         → 204
```

**These REPLACE, they do not merge.** The array you send becomes the entire
section, and `order` is taken from the array index.

- Sending a **shorter array really deletes** the extra rows.
- Sending `{ "items": [] }` **clears** the section.
- Drag-to-reorder is just a reordered array — no per-row patching.
- Each is wrapped in a transaction, so a failure cannot half-update a section.
- The parent document's `updatedAt` is touched, so content-only edits move it in
  the list ordering.

`summary` is 1:1 with the document, so its "replace" is an overwrite:
`{ "content": "…" }`, and `""` clears it. Max 100 items per array section.

```jsonc
// PUT …/experience
{ "items": [
  { "company": "Acme", "title": "Senior Engineer", "location": "Remote",
    "startDate": "2020-01-01T00:00:00.000Z", "endDate": null,
    "isCurrentJob": true, "description": "Led the platform team.",
    "technologies": ["TypeScript", "Postgres"] }
]}

// PUT …/education    degreeLevel is the shared DegreeLevel enum
{ "items": [
  { "institution": "MIT", "degreeLevel": "BACHELOR", "fieldOfStudy": "Computer Science",
    "startDate": "2012-09-01T00:00:00.000Z", "endDate": "2016-06-01T00:00:00.000Z",
    "gpa": 3.8 }
]}

// PUT …/skills
{ "items": [ { "name": "TypeScript", "proficiencyLevel": "EXPERT" } ] }

// PUT …/certifications
{ "items": [
  { "name": "AWS Solutions Architect", "issuer": "Amazon",
    "issueDate": "2022-03-01T00:00:00.000Z", "expirationDate": null,
    "credentialId": "ABC-123" }
]}

// PUT …/projects      manual entry only — nothing to import from
{ "items": [
  { "name": "Portfolio", "description": "Static site generator.",
    "technologies": ["Astro"], "url": "https://ada.dev" }
]}
```

---

## 4. Import from profile

### `POST /resume-builder/documents/:id/import-from-profile` → 200

```jsonc
{ "sections": ["summary", "experience", "education", "skills", "certifications"] }
```

Returns the full `ResumeDocumentDetailDto`, so the editor re-renders without a
second call.

**A one-time copy, never a live link.** Each named section is replaced with a
snapshot of the profile *as it is right now*; afterwards the document owns those
rows. Editing them never writes back to the profile, and later profile edits do not
reach into an already-imported document — a résumé tailored for one application has
to be able to diverge from the master profile.

| Rule | Behaviour |
|---|---|
| Sections you don't name | left untouched |
| Section with no profile data | imports as **empty — that is success, not an error** |
| Soft-deleted profile rows | excluded |
| Template / settings / header | **never touched** — content only |
| `"projects"` | **rejected with a 400** naming the accepted values |

`"projects"` is not importable because **there is no `Project` model** — that
section is manual-entry. Rejecting rather than silently ignoring it matters: a
silent drop would look like the import worked and left projects mysteriously empty.

**Summary** reads `Profile.bio`, falling back to `Profile.headline` when bio is
null or blank. Both empty yields an empty summary — success, not an error.

**Field mapping is not 1:1** with the profile models. Education uses
`startDate`/`endDate` (there is no graduation date) and `degreeLevel`/`fieldOfStudy`;
certifications use `issuer`/`issueDate`; skills join `UserSkill → Skill` for the
display name. **Experience `location` is left empty on import** — the profile
`Experience` model has no location column — for the user to fill in.

---

## 5. Export

### `POST /resume-builder/documents/:id/export` → 201

```jsonc
{ "format": "pdf" }   // optional; "pdf" is the ONLY accepted value
```

```jsonc
{
  "resumeId": "…",
  "downloadUrl": "https://…signed…",
  "fileName": "frontend-engineer-google.pdf",
  "fileSize": 24680
}
```

**PDF only.** `"docx"` is **rejected at validation (400)**, not accepted-then-501 —
the API should not advertise a format it cannot produce. DOCX is deferred, not
cancelled.

**The download URL is signed and time-limited.** The `resumes` bucket is private, so
the public URL is useless; treat `Resume.fileUrl` as a storage pointer, not a
fetchable link.

### What export does, in order

1. **Renders first** — PDF bytes *and* a plain-text rendering, from one content
   pass. If rendering fails **nothing is saved**: no file, no `Resume` row, no
   changed link.
2. Uploads to the private `resumes` bucket at `{userId}/{resumeId}/{slug}.pdf`.
3. **Supersedes the previous export**: if this document was exported before, that
   `Resume` is **soft-deleted** so your picker shows one current file per document.
   Soft, never hard — `Application.resume` is `onDelete: SetNull`, so a hard delete
   would silently strip the résumé off applications already submitted with it.
4. Creates a `Resume` row: `fileName`, `fileUrl`, `fileSize`, `fileType: "PDF"`
   (all four required), `parsingStatus: SUCCESS`.
5. Writes `ParsedResumeData` **directly** — **no parsing job is enqueued**. The
   document is already structured; re-parsing the PDF we just generated would cost
   an AI call, require Redis, and could only degrade data we authored. `parsedBy`
   is `"resume-builder"` so a row can be traced to its origin.
6. Sets the document's `exportedResumeId`.

> **Why `rawText` matters.** `ResumeScorerService` reads `ParsedResumeData.rawText`
> for five of its sub-scores plus the AI scorer call. Export writes a plain-text
> rendering into it deliberately — structured fields alone would score a
> well-formed résumé near **zero** on ATS formatting/keywords/length.

### After export

The résumé is indistinguishable from an uploaded one: it appears in
`GET /resumes`, attaches when applying, and can be scored via
`GET /resumes/:id/scores` or `POST /resumes/:id/score`.

`atsScore`/`qualityScore` start **null** and populate when a scoring endpoint is
called — **the same as uploads**; nothing auto-scores in this codebase (verified:
the only scorer call sites are the four `resume` controller routes).

---

## 6. Worked example — full lifecycle

### Step 1 — create the document

```http
POST /api/v1/resume-builder/documents
Authorization: Bearer <token>
```
```jsonc
{ "title": "Frontend Engineer — Google", "templateId": "tpl-classic-ats", "colorScheme": "navy" }
```
**201** — note the header arrived by itself:
```jsonc
{
  "id": "doc-1", "userId": "u1", "title": "Frontend Engineer — Google",
  "templateId": "tpl-classic-ats", "colorScheme": "navy",
  "lineSpacing": "DEFAULT", "margin": "NORMAL", "fontFamily": null,
  "status": "DRAFT", "exportedResumeId": null,
  "fullName": "Ada Lovelace", "email": "ada@example.com",
  "phone": "+855 12 345 678", "location": "Phnom Penh, Cambodia",
  "linkedinUrl": "https://linkedin.com/in/ada", "portfolioUrl": null,
  "createdAt": "…", "updatedAt": "…"
}
```

### Step 2 — adjust presentation

```http
PATCH /api/v1/resume-builder/documents/doc-1
```
```jsonc
{ "lineSpacing": "WIDE", "margin": "NARROW" }
```

### Step 3 — prefill from the profile

```http
POST /api/v1/resume-builder/documents/doc-1/import-from-profile
```
```jsonc
{ "sections": ["summary", "experience", "education", "skills"] }
```
**200** — full document back, sections populated. Three profile jobs became three
rows; their `location` is empty (nothing to import from); certifications were not
requested so that section stays empty.

### Step 4 — tailor for this application

Only the experience section changes; everything else is untouched:

```http
PUT /api/v1/resume-builder/documents/doc-1/experience
```
```jsonc
{ "items": [
  { "company": "Acme", "title": "Senior Engineer", "location": "Remote",
    "startDate": "2020-01-01T00:00:00.000Z", "isCurrentJob": true,
    "description": "Led the platform team; shipped the billing rewrite.",
    "technologies": ["TypeScript", "Postgres"] }
]}
```
**204.** Two of the three imported rows are now **gone** — this is a replace. The
user's actual profile experience is untouched.

### Step 5 — add projects by hand

```http
PUT /api/v1/resume-builder/documents/doc-1/projects
```
```jsonc
{ "items": [ { "name": "Portfolio", "description": "Static site generator.",
               "technologies": ["Astro"], "url": "https://ada.dev" } ] }
```

### Step 6 — export

```http
POST /api/v1/resume-builder/documents/doc-1/export
```
```jsonc
{ "format": "pdf" }
```
**201**
```jsonc
{
  "resumeId": "res-9",
  "downloadUrl": "https://<project>.supabase.co/storage/v1/object/sign/resumes/u1/res-9/frontend-engineer-google.pdf?token=…",
  "fileName": "frontend-engineer-google.pdf",
  "fileSize": 24680
}
```

### Step 7 — the resulting Resume row

```http
GET /api/v1/resumes
```
```jsonc
[{
  "id": "res-9", "userId": "u1",
  "fileName": "frontend-engineer-google.pdf",
  "fileUrl": "u1/res-9/frontend-engineer-google.pdf",   // storage pointer, not a link
  "fileSize": 24680, "fileType": "PDF",
  "title": "Frontend Engineer — Google",
  "isDefault": false,                 // export never promotes to default
  "parsingStatus": "SUCCESS",         // filed as already parsed
  "atsScore": null, "qualityScore": null,   // populate on demand, same as uploads
  "createdAt": "…", "updatedAt": "…"
}]
```

`GET /api/v1/resume-builder/documents/doc-1` now shows
`"exportedResumeId": "res-9"`. Scoring it works immediately:

```http
POST /api/v1/resumes/res-9/score
```

### Step 8 — edit and re-export

Change something, export again. The new call returns a **different** `resumeId`,
`res-9` is **soft-deleted**, and the document points at the new one — so the
picker still shows exactly one current file for this document, while any
application already submitted with `res-9` keeps its attachment.

---

## Cross-references

- `RESUME_BUILDER_KNOWN_GAPS.md` — what is **not** done
- `RESUME_BUILDER_DATA_MODEL.md` — schema and the Phase 0 findings behind it
- `RESUME_BUILDER_BACKEND_PLAN.md` — the phase plan and settled decisions
