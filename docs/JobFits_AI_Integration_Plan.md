# JobFits — AI Model Integration Plan

**Status:** Draft plan (ready to execute phase by phase)
**Scope:** How the NestJS backend (this repo) integrates the AI capabilities served by
`jobfits-ai-service` (FastAPI + Ollama running **Qwen 3** for generation and **BGE-M3** for
embeddings).
**Source of truth:** the built code, per [ARCHITECTURE_ALIGNMENT.md](./ARCHITECTURE_ALIGNMENT.md).
Where older design docs conflict, the code and this plan win.

---

## 0. TL;DR — the shape of the work

The AI features the platform advertises (resume parsing, resume scoring, job matching,
cover letters, interview coaching) **already exist in the backend as rule-based heuristics
or empty stubs.** The AI work is mostly:

1. Build **one** thing that does not exist yet: a typed HTTP client from the backend to the
   FastAPI AI service (`AiModule`).
2. **Swap the internals** of each existing heuristic for a call to that client — keeping the
   heuristic as a fallback so the product never hard-fails when the GPU box is down.
3. Add the two **net-new** generation features (cover letter, interview coaching).

The backend **never** calls Ollama directly. It only ever calls
`jobfits-ai-service` over HTTPS; the AI service calls Ollama on `localhost:11434`.

```
Frontend ──HTTPS──▶ Backend (this repo) ──HTTPS──▶ AI Service (FastAPI) ──localhost──▶ Ollama
                        │                                                              (Qwen 3,
                        └── stores results in Postgres                                  BGE-M3)
```

---

## 1. Current state — the 4 AI touchpoints

| # | Feature | Backend location today | State |
|---|---|---|---|
| A | Resume parsing (PDF/DOCX → structured fields) | `src/modules/resume/application/services/resume-parser.service.ts` | Regex + section-header heuristics, runs async via BullMQ. Clean seam for a Qwen call. |
| B | Resume scoring (ATS + quality, 0–100) | `src/modules/resume/application/services/resume-scorer.service.ts` | Keyword/formatting heuristics; comment already says "a real scorer would use NLP". |
| C | Job matching (skills 40 / exp 25 / loc 15 / salary 10 / other 10) | `src/modules/matching/domain/scoring/*` + `compute-match-score.use-case.ts` | **Scorer files are empty one-line stubs; the use-case is a `TODO`.** Where BGE-M3 embeddings belong. |
| D | Cover letters / interview coaching | not built (Prompt 11 "Advanced Features") | Greenfield — pure Qwen generation. |

**There is no AI-service HTTP client anywhere in the backend yet.** That is the foundation
piece and must be built first.

---

## 2. Conventions this plan follows (from ARCHITECTURE_ALIGNMENT.md)

- **Auth:** self-managed JWT. `JwtAuthGuard` + `RolesGuard` are global (secure-by-default).
  Open routes with `@Public()`; restrict with `@Roles('EMPLOYER'|'ADMIN'|'JOB_SEEKER')`.
  `@CurrentUser()` yields `AuthenticatedUser = { id, email, role }`.
- **DDD convention:** new AI code uses the **newer** convention — `@common/abstracts/*`,
  `@shared/kernel/*`, `@common/constants/*`. When *extending* the `resume`/`matching`/`job`
  modules, match that module's existing convention.
- **Aliases:** `@common/*`, `@core/*`, `@shared/*`, `@shared-kernel/*`, `@modules/*`,
  `@infra/*`, `@events/*`, `@config/*` (no leading slash).
- **Global modules:** `PrismaModule` and `EventBusModule` are `@Global` — `PrismaService`
  and `DomainEventBus` inject anywhere.
- **Prisma:** after any `schema.prisma` change run `prisma generate` **before** `tsc`.
  pnpm is invoked as `corepack pnpm`. Verify with `node_modules/typescript/bin/tsc --noEmit`.

---

## 3. The AI-service API contract (design it now — service isn't built)

Because `jobfits-ai-service` does not exist yet, we design the contract **backend-first** so
both repos can be built against the same spec. All endpoints are JSON over HTTPS, versioned
under `/api/v1`. All are idempotent server-side and safe to retry.

### 3.1 `POST /api/v1/resume/parse`
Extracts structured data from raw resume text using Qwen 3.
```jsonc
// request
{ "text": "<raw resume text>", "fileType": "PDF" | "DOCX" }
// response
{
  "fullName": "Jane Doe",
  "email": "jane@x.com",
  "phone": "+855...",
  "location": "Phnom Penh, KH",
  "summary": "…",
  "skills": ["TypeScript", "NestJS", "PostgreSQL"],
  "experiences": [
    { "company": "Acme", "title": "Backend Dev", "startDate": "2022-01",
      "endDate": null, "highlights": ["…"] }
  ],
  "educations": [
    { "institution": "RUPP", "degree": "BSc CS", "fieldOfStudy": "…",
      "graduationYear": 2024 }
  ]
}
```
> Backend keeps text extraction (pdf-parse / mammoth). The AI service only takes **text** —
> it does not deal with files/storage. Keeps the AI service stateless and GPU-focused.

### 3.2 `POST /api/v1/resume/score`
```jsonc
// request
{ "text": "<raw resume text>", "targetRole": "Backend Engineer" }  // targetRole optional
// response
{
  "atsScore": 82, "qualityScore": 76,
  "breakdown": { "formatting": 80, "keywords": 74, "completeness": 90, "…": 0 },
  "suggestions": ["Add measurable outcomes to your Acme role", "…"]  // premium only
}
```

### 3.3 `POST /api/v1/embed`
BGE-M3 embeddings. Used for semantic matching. **1024-dimensional** vectors.
```jsonc
// request
{ "inputs": ["senior typescript engineer", "react, node, aws"] }
// response
{ "model": "bge-m3", "dim": 1024, "embeddings": [[0.01, ...], [0.02, ...]] }
```

### 3.4 `POST /api/v1/generate/cover-letter`
```jsonc
// request
{ "resumeSummary": "…", "jobTitle": "…", "companyName": "…",
  "jobDescription": "…", "tone": "professional" }
// response
{ "coverLetter": "Dear Hiring Manager, …" }
```

### 3.5 `POST /api/v1/generate/interview`
```jsonc
// request
{ "jobTitle": "…", "jobDescription": "…", "level": "SENIOR",
  "kind": "questions" | "feedback", "answer": "…" }  // answer only when kind=feedback
// response (kind=questions)
{ "questions": [ { "question": "…", "category": "behavioral", "guidance": "…" } ] }
```

### 3.6 Cross-cutting
- **Health:** `GET /api/v1/health` → `{ "status": "ok", "modelsLoaded": ["qwen3", "bge-m3"] }`.
- **Errors:** non-2xx → `{ "error": { "code": "MODEL_TIMEOUT", "message": "…" } }`.
- **Auth between services:** shared secret header `X-AI-Service-Key` (env on both sides).
- **Timeouts:** generation can be slow. Backend default timeout **60s** for generate/parse,
  **10s** for embed/health.

---

## 4. Embeddings storage decision → **pgvector** (recommended)

For semantic matching we must store BGE-M3 vectors for **jobs** and for a **user's profile/
resume**, then rank by cosine similarity.

**Decision: use `pgvector` in the existing Postgres.** Rationale:
- The app is a modular monolith already on Postgres — no new infra to operate.
- Prisma supports `pgvector` via `Unsupported("vector(1024)")` + raw SQL for similarity, or
  the `pgvector`/`prisma` community patterns.
- Precompute once (on job publish, on profile/resume change) instead of embedding on every
  match run — matching becomes a fast indexed query, not N GPU calls.

Alternatives considered: *compute-on-the-fly* (simplest but slow, repeats GPU work every run —
rejected for the nightly batch); a *dedicated vector DB* like Qdrant (overkill for current
scale, adds an service to deploy).

Schema sketch (added in Phase 3):
```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE jobs     ADD COLUMN embedding vector(1024);
ALTER TABLE profiles ADD COLUMN embedding vector(1024);  -- or a resume_embeddings table
CREATE INDEX ON jobs     USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON profiles USING hnsw (embedding vector_cosine_ops);
```

---

## 5. Phased implementation

Ordered so each phase is shippable and unblocks the next. **Nothing works until Phase 0.**

### Phase 0 — `AiModule`: the HTTP client (foundation, do first)
**Goal:** one typed, resilient client the whole backend uses to reach the AI service.

- Add `@nestjs/axios` (`HttpService`) if not present.
- `src/infra/ai/ai.module.ts` (`@Global` so any module can inject it).
- `src/infra/ai/ai.client.ts` — methods mirroring §3: `parseResume`, `scoreResume`,
  `embed`, `generateCoverLetter`, `generateInterview`, `health`.
- `src/config/ai.config.ts` — `AI_SERVICE_URL`, `AI_SERVICE_KEY`, timeouts. Add to `.env`
  and `.env.example`.
- **Resilience:** per-call timeout, 1 retry on 5xx/timeout, and a typed `AiServiceError`.
  Every caller must be able to **fall back** to the existing heuristic (never hard-fail).
- Wire `AiModule` into `app.module.ts`.
- **Verify:** unit-test the client against a mocked HTTP server; hit `/health` from a
  throwaway script.

**Deliverable:** backend can call the AI service (even if the service is a stub returning
canned JSON at this stage).

### Phase 1 — Resume parsing via Qwen (touchpoint A)
- Backend keeps `extractText()` (pdf-parse / mammoth).
- In `resume-parser.service.ts`, replace `extractStructuredData()` with
  `aiClient.parseResume(text, fileType)`.
- On `AiServiceError` → fall back to the current regex extractor; still mark `SUCCESS` but
  flag `parsedBy: "heuristic"` so we can tell them apart.
- Keep the BullMQ async flow and `ResumeParsedEvent` unchanged.
- **Verify:** upload a real PDF, confirm structured fields + event fire; kill the AI service
  and confirm graceful fallback.

### Phase 2 — Resume scoring via AI (touchpoint B)
- Add `aiClient.scoreResume()` behind `ResumeScorerService`; keep heuristic sub-scores as the
  fallback path.
- Gate AI `suggestions` behind subscription tier (PREMIUM/PROFESSIONAL) — the ER/roles model
  already has tiers.
- **Verify:** score a parsed resume with AI up vs. down; confirm scores persist to
  `Resume.atsScore` / `qualityScore`.

### Phase 3 — Semantic job matching (touchpoint C) — biggest lift
1. **Storage:** add `pgvector` extension + `embedding vector(1024)` columns (§4), migrate,
   `prisma generate`.
2. **Populate embeddings:**
   - On **job publish/update** → embed the job (title + description + skills) and store.
     Hook the existing `JobPublishedEvent` listener in the matching module.
   - On **profile/resume change** → embed the candidate text and store.
3. **Implement the empty scorers** in `matching/domain/scoring/`:
   - `skills-scorer` → cosine similarity of skill/role embeddings (semantic, not exact string
     overlap).
   - `experience-scorer`, `location-scorer`, salary/other → keep deterministic rules (no GPU
     needed).
   - `weighted-match.calculator` → combine 40/25/15/10/10.
4. **Finish `ComputeMatchScoreUseCase`** and the nightly batch (`recompute-user-matches`) to
   write `recommendations` rows with the sub-scores + `reasonExplanation` (Qwen can generate
   the human-readable explanation).
- **Verify:** seed jobs + a profile, run the batch, inspect `recommendations` scores and
  explanations for sanity.

### Phase 4 — Generation features (touchpoint D)
- **Cover letter:** `POST /applications/:id/cover-letter` (or under resume) → build prompt
  from resume summary + job → `aiClient.generateCoverLetter()`. Tier-gated.
- **Interview coaching:** endpoints for tailored questions and answer feedback →
  `aiClient.generateInterview()`. Maps to the `interview_questions` / `interview_tips` ER
  tables for any static content.
- **Verify:** generate a cover letter end-to-end for a real application row.

---

## 6. Config / env additions

```
AI_SERVICE_URL=http://localhost:8000      # prod: https://ai.jobfits.com
AI_SERVICE_KEY=<shared secret>            # sent as X-AI-Service-Key
AI_TIMEOUT_MS_GENERATE=60000
AI_TIMEOUT_MS_EMBED=10000
```

---

## 7. Cross-cutting concerns

- **Resilience is mandatory:** every AI call has a heuristic fallback or a queued retry. The
  GPU box (RunPod) is the least reliable dependency; the product must degrade, not die.
- **Cost/latency:** generation is slow — always async (BullMQ) or clearly "loading" in the UI.
  Cache embeddings (that's the whole point of pgvector). Never embed the same job twice.
- **Tiering:** AI extras (optimization suggestions, cover letters, interview coaching) are
  premium — enforce on the backend, not just the UI.
- **Observability:** log every AI call's latency + outcome; expose the AI `/health` through a
  backend health check.
- **Security:** the AI service is the only piece that reaches Ollama; keep Ollama private.
  Authenticate backend→AI with the shared key. Never forward end-user PII beyond what parsing
  needs.

---

## 8. Open questions to resolve before/while building

1. **AI-service contract sign-off** — §3 is a proposal; confirm field names with whoever
   builds `jobfits-ai-service` (or we own both).
2. **BGE-M3 dimension** — assumed **1024**; confirm from the model card before the migration.
3. **Where candidate embeddings live** — on `profiles` (one per user) vs. a
   `resume_embeddings` table (one per resume version). Recommend per-resume if matching should
   reflect the *selected* resume.
4. **Explanation generation** — use Qwen for `reasonExplanation`, or template it from the
   sub-scores? (Qwen is nicer but adds a GPU call per recommendation.)

---

## 9. Suggested first step

Execute **Phase 0** (the `AiModule` client) against the contract in §3, with the AI service
mocked. That unblocks every other phase and lets `jobfits-ai-service` be built in parallel
against the same spec.
