# JobFit — Legal Decision Framework

**Prepared for:** JobFit Management / Leadership Review  
**Prepared by:** Engineering  
**Date:** 10 September 2026  
**Status:** Decision document — **not** a formal legal opinion. Requires review by qualified legal counsel before public deployment.

---

> ## ⚖️ THIS FILE IS CANONICAL — consolidated 14 September 2026
>
> A second, longer draft existed at `docs/JOBFIT_LEGAL_DECISION_FRAMEWORK.md` (30 decisions).
> **It is superseded and must not be drafted from.** Two reasons, both verified against code:
>
> 1. **It states a formula the platform does not run.** It describes damping as
>    `P < 0.65 ⟹ (P/0.65)²` produced by a `TwoDimensionalScoringService`. No such service
>    exists in `src/`, and the real gate is `C = R × (0.30 + 0.70 × P/100)` in
>    `compositeScore()` (`src/modules/matching/domain/scoring/weighted-match.calculator.ts`).
>    This file states it correctly. Publishing the other one would misdescribe the product
>    in a document whose entire purpose is to describe the product accurately.
> 2. **Its options do not include what the platform actually does.** Its D6 offers
>    "air-gapped", "cloud with consent", and "fully hosted" — but not the hybrid
>    Ollama-for-PII / DeepSeek-for-public-text split that is running in production and that
>    management selected here as D2 Option A.
>
> **The letters do not map between the two files.** `docs/` D6 Option A means "never send
> data outside"; this file's D2 Option A means "keep the hybrid split and disclose it".
> They are opposite postures under the same label. Eight decisions ticked in that draft have
> been carried into this file — see **Group F** and the Decision Summary Table.

---

## How to use this document

This document exists to convert **16 open legal, regulatory, and architectural questions into recorded management decisions**, establishing the factual and policy foundation for drafting JobFit's production legal agreements.

- **Section 1** establishes the **factual basis**. Every statement is verified directly against the active codebases (`jobfit-backend`, `jobfit-frontend`, `jobfits-ai-service`, and `jobfit-extension`), not against stale documentation or roadmaps.
- **Section 2** specifies the **proposed structure of the four core legal documents** required for the platform.
- **Section 3** is the **management decision sheet**. Leadership fills in the `Management Decision` line for each item.
- **Section 4** details the **engineering action items** required to support and enforce these decisions prior to public launch.

### Two decisions block everything else and must be settled first:

| Priority   | Decision                                                     | Why it blocks                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔴 **1st** | **D1 — AI Matching & ATS Legal Characterization**            | Determines whether JobFit is legally classified as an Automated Employment Decision Tool (AEDT) under emerging regulations (e.g., EU AI Act High-Risk systems, NYC Local Law 144) or strictly as a personal productivity / candidate advisory tool. Dictates the liability structure, disclaimer phrasing, and audit obligations. |
| 🔴 **2nd** | **D3 — Governing Privacy Standard & Cross-Border Framework** | Determines whether the platform adheres to a GDPR-aligned standard or a local baseline, governing how user resumes, embeddings, and telemetry are stored, transferred (e.g., DeepSeek, Supabase Tokyo, Cloud Run), and permanently deleted.                                                                                       |

Once D1 and D3 are resolved, the remaining 14 decisions can be evaluated in parallel.

---

# 1. Architectural & Legal Summary

## 1.1 The Multi-Party Platform Model

JobFit is a **two-sided career navigation and recruitment matching platform** with an auxiliary browser extension and automated job ingestion pipelines. Four distinct parties interact with the system:

```
                      ┌───────────────────────────────────────────────────────────┐
                      │                 PLATFORM OPERATOR (JobFit)                │
                      │  • Operates API (Cloud Run Tokyo) & Database (Supabase)   │
                      │  • Owns matching algorithms, vector embeddings & scorers  │
                      │  • Runs local AI inference (Ollama) & proxies to DeepSeek │
                      └─────────────┬───────────────────────────────┬─────────────┘
                                    │                               │
        Subscription Fee / Tools    │                               │  Employer Verification,
        ($0 – $49/month SaaS)       │                               │  Job Listings, Applicant
        ATS Scoring, Cover Letters  │                               │  Review, Offer Messages
                                    ▼                               ▼
     ┌─────────────────────────────────────────┐     ┌─────────────────────────────────────────┐
     │          JOB SEEKER (Candidate)         │     │           EMPLOYER (Recruiter)          │
     │  • Uploads resumes (PDF/DOCX)           │     │  • Verified via EmployerRequest review  │
     │  • Builds profile, skills, salary prefs │     │  • Posts internal jobs (INTERNAL)       │
     │  • Receives algorithmic match scores    │◄────┤  • Reviews applicants, notes & stages   │
     │  • Applies to internal/external jobs    │     │  • Extends formal offers & negotiates   │
     └────────────────────▲────────────────────┘     └─────────────────────────────────────────┘
                          │
                          │ Passive score lookup / Active clipping ("Save Job", "Full Report")
                          │
     ┌────────────────────┴────────────────────────────────────────────────────────────────────┐
     │                         EXTERNAL ECOSYSTEM & AGGREGATED BOARDS                          │
     │  • Direct Ingestion: TheMuse (API), BongThom (RSS), JobNet.com.kh (Schema JSON-LD)      │
     │  • Browser Extension (MV3): LinkedIn, Indeed, Khmer24, BongThom, JobNet                │
     │  • Candidates redirected off-platform for EXTERNAL job applications                     │
     └─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Party Definitions as Implemented in Code

| Party                            | Code Representation                                       | Operational Reality                                                                                                                                                                                                                                                 |
| -------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Platform Operator**            | `UserRole.ADMIN`; `src/modules/admin/`                    | Operates backend services, reviews employer onboarding requests, manages system health, triggers user locks/unlocks, and executes GDPR soft-deletes.                                                                                                                |
| **Job Seeker**                   | `UserRole.JOB_SEEKER`; `Profile`, `Resume`, `Application` | Submits personal career data, uploaded resumes, salary expectations, and job applications. Uses recommendation feed and Chrome extension.                                                                                                                           |
| **Employer**                     | `UserRole.EMPLOYER`; `EmployerProfile`, `Company`, `Job`  | **Gated Access:** Must submit an `EmployerRequest` that an Admin reviews and approves before account creation. Manages company profiles, posts internal jobs, reviews applicants, and issues offers.                                                                |
| **External Board / Third Party** | `Job.sourceType = EXTERNAL`; `SavedExternalJob`           | Job boards whose listings are either ingested server-side (TheMuse, BongThom, JobNet) or read client-side via the Chrome extension (LinkedIn, Indeed). Applications for external listings are not processed internally; candidates are redirected to external URLs. |

> ⚠️ **The `User` table is shared.** All platform actors exist in the same `users` table distinguished by the `role` enum (`JOB_SEEKER`, `EMPLOYER`, `ADMIN`). While a user cannot simultaneously be an employer and a job seeker on the same account (routes enforce strict `@Roles()` checks), account lifecycles, authentication tokens, and soft-delete mechanisms operate over this unified model.

---

## 1.2 Key Technical Facts (Verified in Code)

### A. Artificial Intelligence, Scoring & Data Boundaries

| Technical Dimension                      | Implementation in Code                                                                                                                                                                                                                                                                                                 | Ground Truth / Source Reference                                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Dual AI Topology**                     | Split between local inference and hosted LLMs.                                                                                                                                                                                                                                                                         | `jobfits-ai-service/app/services/chat_router.py`                                                         |
| **Local / Dedicated Inference (Ollama)** | Model: `qwen3` / `qwen3:4b` (generation, parsing, scoring) and `bge-m3` (1024-dimension embeddings). Run locally or via containerized RunPod serverless worker.                                                                                                                                                        | `jobfits-ai-service/runpod-worker/Dockerfile`<br>`app/config.py`                                         |
| **Hosted Third-Party LLM (DeepSeek)**    | `ChatRouter` selectively routes tasks if `DEEPSEEK_API_KEY` is set. Tasks allowlisted by default: **`interview,job_requirements`**. Routed to `api.deepseek.com` (`deepseek-v4-flash`).                                                                                                                                | `app/config.py:35`                                                                                       |
| **Strict Structural AI Boundary**        | **User resumes, raw CV text, candidate names, emails, profiles, and embeddings NEVER touch DeepSeek.** `ResumeService`, `EmbedService`, and `MatchingEmbeddingService` are wired directly to `OllamaClient` and do not receive a `ChatRouter`.                                                                         | `docs/EXTENSION_PRIVACY_FACTS.md:116-121`                                                                |
| **What DeepSeek Actually Receives**      | When a user requests a "Full Report" on an external job or triggers interview prep, the **job posting title and body** (public employer text) are sent to DeepSeek to extract requirement phrases. Candidate PII is excluded.                                                                                          | `src/modules/match-report/application/match-report.service.ts`                                           |
| **Two-Dimensional Matching Formula**     | Matching is explicitly decoupled into: <br>1. **Role Fit ($R$, 0–100%)**: Skills (60%) + Experience (40%).<br>2. **Preference Fit ($P$, 0–100%)**: Work arrangement/remote (35%), employment type (25%), job level (20%), salary (20%).<br>3. **Composite Gating ($C$)**: $C = R \times (0.30 + 0.70 \times (P/100))$. | `TWO_DIMENSIONAL_MATCHING_SPEC.md`<br>`src/modules/matching/domain/scoring/weighted-match.calculator.ts` |
| **Transparent Conflict Flags**           | If a job violates explicit user preferences (e.g., candidate prefers REMOTE only, job is ON_SITE in another city), the composite score is demoted to the `WEAK` band (<50%) and explicit warnings are surfaced in `flags.warnings`.                                                                                    | `TWO_DIMENSIONAL_MATCHING_SPEC.md:86-89`                                                                 |
| **Deterministic Heuristic Fallbacks**    | Every AI route degrades gracefully: if AI/Ollama times out or fails, resume parsing falls back to regex/section heuristics, and recommendations fall back to deterministic scoring. The system records `parsedBy: 'ai' or 'heuristic'` in the database.                                                                | `parsed_resume_data.parsedBy`<br>`AI_DEGRADATION_PLAN.md`                                                |

### B. Personal Data, File Storage & Chrome Extension

| Category                          | Specific Data Points Handled                                                                                                                                                                                                                                                                                                                                                | Where Stored / Handled                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Identity & Account**            | Email, full name, bcrypt password hash, avatar URL, verification codes (6-digit), password reset codes.                                                                                                                                                                                                                                                                     | PostgreSQL (`users` table).                                                                                                |
| **Candidate Career Profile**      | Headline, bio, telephone, city/country, target salary, minimum salary, currency, remote preferences, job level preferences, employment types, relocation willingness, notice period.                                                                                                                                                                                        | PostgreSQL (`profiles`, `experiences`, `educations`, `certifications`, `user_skills`).                                     |
| **Uploaded Resumes**              | PDF and DOCX files, maximum 5 MB. Raw text extracted by `pdf-parse` or `mammoth`.                                                                                                                                                                                                                                                                                           | Stored in **Supabase Storage private bucket** (`resumes`). Metadata and parsed JSON in `resumes` and `parsed_resume_data`. |
| **Vector Embeddings**             | 1024-dimensional dense vectors derived from profile text and job descriptions.                                                                                                                                                                                                                                                                                              | PostgreSQL `vector(1024)` column via `pgvector` extension.                                                                 |
| **Application & Pipeline Data**   | Submitted resumes, custom cover letters, application status history, employer notes, interview scheduling notes.                                                                                                                                                                                                                                                            | PostgreSQL (`applications`, `application_timelines`, `application_stage_history`).                                         |
| **Compensation Offers**           | Base salary, bonus, equity, currency, benefits description, negotiation messages (`OfferMessage`).                                                                                                                                                                                                                                                                          | PostgreSQL (`offers`, `offer_messages`).                                                                                   |
| **Chrome Extension Data Capture** | Passive browsing: reads external job ID, title, company, location.<br>Active click "Save Job": reads posting body (up to 20,000 chars) and stores in `saved_external_jobs.description`.<br>Active click "Full Report": reads posting body, sends to backend/DeepSeek, stores extracted requirement phrases in `match_reports.payload` (**raw posting text is NOT stored**). | Local browser DOM → API → `saved_external_jobs` or `match_reports`. No token storage in extension.                         |
| **Offline PWA Storage**           | Local mirror of applications, profile, skills, education, saved jobs, and queued offline mutations (`pendingActions`).                                                                                                                                                                                                                                                      | Client-side IndexedDB via Dexie (`JobFitsOfflineDb`).                                                                      |
| **Cookies & Sessions**            | **Single essential authentication cookie**: `refresh_token` (HTTP-only, Secure in prod, SameSite=none, 30-day lifespan). In-memory JWT access token. Zero advertising, tracking, or marketing cookies.                                                                                                                                                                      | Express `cookie-parser`, `src/common/utils/cookie.util.ts`.                                                                |

### C. Third Parties and Processors in the Live Data Path

| Processor                             | Data Received                                                                                      | Purpose                                                                            | Location / Legal Seat            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------- |
| **Google Cloud Platform (Cloud Run)** | All application HTTP traffic, server logs, environment secrets.                                    | Hosts `jobfit-backend` API container; Cloud Logging, Cloud Trace, Error Reporting. | Tokyo, Japan (`asia-northeast1`) |
| **Supabase (AWS Infrastructure)**     | Entire PostgreSQL database (including vector embeddings) and uploaded resume files.                | Primary relational store + private S3 file storage.                                | Tokyo, Japan (`ap-northeast-1`)  |
| **RunPod / GPU Host**                 | Text payloads for parsing, scoring, and embedding generation.                                      | Hosts Ollama container running `qwen3` and `bge-m3`.                               | US / Cloud GPU datacenter        |
| **DeepSeek (`api.deepseek.com`)**     | Public job posting descriptions and job titles. (**No candidate PII**).                            | Extracts job requirement keywords for "Full Report" and interview prep questions.  | China / International API        |
| **Slack**                             | Critical server 5xx error alerts, error fingerprints, request paths, user IDs (when errors occur). | Operational alerting for engineering team.                                         | US                               |
| **Healthchecks.io**                   | Dead-man's-switch periodic heartbeat pings (`/health/heartbeat`).                                  | Service availability monitoring.                                                   | EU                               |
| **TheMuse API**                       | Ingested public job postings.                                                                      | External job listing catalog.                                                      | US                               |
| **BongThom / JobNet.com.kh**          | Public job listings read via RSS / Schema.org JSON-LD.                                             | Cambodian regional job aggregation.                                                | Cambodia                         |

---

## 1.3 Where Our Published UI & Documentation Currently Contradict Our Code

Before drafting legal policies, management must acknowledge existing discrepancies between user-facing marketing/UI claims and the underlying codebase:

| Published / UI Feature                        | Reality in Code                                                                                                  | Legal & Compliance Exposure                                                                                                                                                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Marketing Pricing Plans** (`/pricing` page) | Displays Free ($0), Pro ($19/mo), Enterprise ($49/mo).                                                           | In Prisma schema, the enum is `FREE`, `PREMIUM`, `PROFESSIONAL`. The payment API (`payment.api.ts`) is a hardcoded mock; the Stripe adapter returns empty strings. **No live payments or real subscriptions can be billed.** |
| **Footer & Signup Links**                     | Links to `Terms of Service` and `Privacy Policy` in `site-footer.tsx` and `signup/page.tsx` point to `href="#"`. | **No public legal pages exist.** Operating without published terms or privacy policies violates consumer protection standards and Chrome Web Store requirements.                                                             |
| **Terms Acceptance at Registration**          | Signup checkbox validates `agreeToTerms: true` via `RegisterDto`.                                                | **The boolean is discarded immediately.** Neither the acceptance timestamp, terms version, nor IP address is saved to the database. We have no defensible proof of consent.                                                  |
| **Account Deletion**                          | Admin portal offers "GDPR Delete User".                                                                          | **No self-service deletion exists for job seekers.** Furthermore, admin soft-deletion retains the user's original email in `deletedEmail` indefinitely and does not automatically purge resume files from Supabase Storage.  |
| **External Job Application Expectations**     | Job seekers browsing recommendations see external jobs (e.g. from TheMuse, BongThom).                            | Users might expect JobFit to submit their application. In reality, `sourceType: EXTERNAL` jobs refuse internal application and redirect candidates off-platform.                                                             |

---

# 2. Proposed Legal Document Structure

We recommend establishing **four distinct, modular legal documents** rather than a single generic document. Job seekers, employers, and browser extension users have fundamentally different legal relationships with the platform:

```
                                 ┌─────────────────────────────────────────────────────────┐
                                 │                JOBFIT LEGAL ARCHITECTURE                │
                                 └────────────────────────────┬────────────────────────────┘
                                                              │
         ┌─────────────────────────────────┬──────────────────┴────────────────┬─────────────────────────────────┐
         ▼                                 ▼                                   ▼                                 ▼
┌─────────────────────────┐     ┌─────────────────────────┐         ┌─────────────────────────┐     ┌─────────────────────────┐
│   JOB SEEKER TERMS OF   │     │    EMPLOYER TERMS OF    │         │  BROWSER EXTENSION TOS  │     │   COMPREHENSIVE PRIVACY │
│      SERVICE (B2C)      │     │      SERVICE (B2B)      │         │     & ACCEPTABLE USE    │     │       POLICY (SHARED)   │
├─────────────────────────┤     ├─────────────────────────┤         ├─────────────────────────┤     ├─────────────────────────┤
│ • Consumer terms        │     │ • Commercial recruiter  │         │ • Chrome Web Store      │     │ • DeepSeek vs. Ollama   │
│ • Advisory AI disclaimer│     │   terms & vetting       │         │   policy alignment      │     │   structural boundaries │
│ • Resume license grant  │     │ • Non-discrimination    │         │ • Client-side on-demand │     │ • Essential cookies     │
│ • External job redirect │     │ • Candidate data        │         │   clipping rules        │     │ • PWA IndexedDB storage │
│ • Subscription rules    │     │   confidentiality       │         │ • No automated scraping │     │ • Retention & soft-     │
│                         │     │ • Job posting accuracy  │         │ • LinkedIn/board terms  │     │   delete disclosures    │
└─────────────────────────┘     └─────────────────────────┘         └─────────────────────────┘     └─────────────────────────┘
```

## 2.1 Job Seeker Terms of Service (B2C)

- **Target Audience:** Individual candidates and job seekers.
- **Tone:** Plain-language, accessible, transparent.
- **Core Modules:**
  1. **Nature of Services:** Career discovery platform providing algorithmic recommendations, ATS scoring tools, and application workflow management.
  2. **AI & Algorithmic Scoring Disclaimer (Critical):** Explicit statement that match scores, role fit percentages, ATS ratings, and generated materials are **advisory estimations only**. JobFit does not guarantee job placement, interview selection, or employment offers.
  3. **User Content & Resume License:** Candidate retains ownership of uploaded resumes and profiles; grants JobFit a limited, royalty-free license to parse, index, extract text, and compute mathematical embeddings solely to operate the matching service.
  4. **External Jobs & Redirects:** Clarification that JobFit aggregates certain third-party job listings; clicking "Apply" redirects to external third-party sites over which JobFit exercises no control.
  5. **Subscription & Billing Terms:** Free tier vs. paid tiers; cancellation policies; no-refund rules for consumed digital subscription periods.
  6. **Prohibited Conduct:** Prohibition against misrepresenting qualifications, uploading malicious documents, submitting fake credentials, or attempting to game ATS scoring systems.

## 2.2 Employer Terms of Service (B2B)

- **Target Audience:** Hiring managers, corporate recruiters, and business owners.
- **Tone:** Commercial, precise, risk-allocating.
- **Core Modules:**
  1. **Onboarding & Verification:** Requirement to submit verifiable company credentials via `EmployerRequest`; platform reservation of right to reject or revoke access.
  2. **Job Posting Standards:** Obligation to post authentic, active, accurately compensated openings. Explicit prohibition of recruitment fees, commission-only multi-level marketing (MLM), or "ghost jobs."
  3. **Fair Hiring & Equal Opportunity Covenants:** Binding commitment to comply with applicable employment and labor anti-discrimination laws (prohibiting discrimination based on race, gender, age, religion, disability, etc.).
  4. **Confidentiality of Candidate Data:** Agreement that resumes and applicant contact information accessed through JobFit will be used strictly for legitimate hiring evaluation for the specified role and not exported, resold, or added to general marketing databases.
  5. **Direct Employer Relationship:** Affirmation that the employment contract and candidate evaluation process are strictly between the employer and the candidate; JobFit is not an employment agency or party to any hiring agreement.

## 2.3 Browser Extension Terms & Acceptable Use

- **Target Audience:** Users installing the JobFit Chrome Extension from the Chrome Web Store.
- **Tone:** Technical, compliance-focused, concise.
- **Core Modules:**
  1. **Client-Side Assistive Function:** Clarification that the extension acts strictly as a user-directed browsing assistant operating locally in the user's active browser session.
  2. **User-Initiated Extraction:** Clear disclosure that posting text is read only when the user explicitly clicks "Save Job" or "Full Report."
  3. **No Unlawful Scraping:** User warranty not to use the extension for mass automated scraping, commercial redistribution, or violations of host platform terms.
  4. **Third-Party Platform Independence:** Clarification that JobFit is not affiliated with, endorsed by, or sponsored by LinkedIn, Indeed, BongThom, Khmer24, or JobNet.

## 2.4 Comprehensive Privacy Policy

- **Target Audience:** All users, regulatory bodies, and Chrome Web Store reviewers.
- **Tone:** Rigorous, complete, fully aligned with technical reality.
- **Core Modules:**
  1. **Data Controller Identification:** Platform operating entity and designated privacy contact (`soviseth869@gmail.com`).
  2. **Categories of Personal Data Collected:** Mapped directly to the database models (identity, career history, resumes, vector embeddings, offer messages, telemetry).
  3. **AI Processing Architecture & Boundaries:** Transparent disclosure of the structural boundary between local Ollama models (resumes and candidate PII) and DeepSeek (public job descriptions only).
  4. **Cookies & Local Storage:** Affirmation of zero marketing/tracking cookies; disclosure of the essential `refresh_token` session cookie and IndexedDB offline PWA storage.
  5. **Third-Party Sub-processors:** Complete inventory (GCP, Supabase, RunPod, DeepSeek, Slack, Healthchecks.io).
  6. **Data Retention & Soft-Delete Realities:** Candid disclosure that soft-deletion anonymizes active credentials while retaining `deletedEmail` and administrative audit logs for compliance and abuse prevention.
  7. **User Data Rights:** Clear instructions on how users can request data export, profile updates, or complete account erasure.

---

# 3. Management Decision Sheet

> **Instructions:** For each decision, review the engineering context, trade-offs, and recommendation. Select your option and record any specific stipulations on the `Management Decision` line.

---

## Group A — AI Governance & Algorithmic Liability 🔴 _Decide First_

---

### D1. How should JobFit legally characterize its AI match scores and ATS recommendations?

**Context (What the code does today):**  
JobFit computes a Two-Dimensional Match Score: a **Role Fit Score** ($R$, based on skills and years of experience) and a **Preference Fit Score** ($P$, based on location, remote type, job level, and salary). These are combined into an **Overall Composite Score** via a mathematical gating formula:
$$C = R \times \left(0.30 + 0.70 \times \left(\frac{P}{100}\right)\right)$$
If a job violates a hard preference (e.g. On-Site requirement for a Remote-only candidate), $P=0$, which mechanically demotes a 95% technical match down to 28.5% (`WEAK` band). Furthermore, the ATS scoring service evaluates resume formatting and keyword density to assign an ATS compatibility score.

**Why this matters:**  
Jurisdictions worldwide are regulating Automated Employment Decision Tools (AEDTs). Under the **EU AI Act (Annex III, Section 4)**, AI systems used for recruitment, candidate screening, and evaluating candidate suitability are classified as **High-Risk AI Systems**, requiring formal risk management systems, algorithmic bias audits, technical documentation, and human oversight logging. In the US, **NYC Local Law 144** mandates annual independent bias audits for AEDTs used by employers. If JobFit markets itself as an automated candidate filtering tool for employers, it inherits severe compliance burdens.

| Dimension              | Option A — Strictly Candidate-Facing Advisory Tool                                                                                         | Option B — Formal Employer Screening / Assessment Engine                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Legal Posture**      | Software provides personal career recommendations to candidates; scores are subjective algorithmic opinions to assist personal job search. | Platform markets algorithmic filtering directly to employers to screen, rank, and eliminate applicants.                                  |
| **Liability Exposure** | **Low.** Strong disclaimers disavowing employment agency status, hiring decisions, or recruitment outcomes.                                | **High.** Falls directly under High-Risk AI and AEDT regulations; requires bias audits, disparate impact testing, and statutory notices. |
| **ToS Implication**    | Employers agree that JobFit scores are non-binding and that hiring decisions remain 100% human-driven.                                     | Terms must include regulatory notices, bias audit summaries, and candidate opt-out mechanisms.                                           |

> **Engineering Recommendation:** **Option A.** Position JobFit strictly as an informational, advisory matching platform for candidates and a productivity tool for recruiters. Include an explicit waiver in both the Job Seeker and Employer Terms stating that JobFit does not make automated employment decisions, does not eliminate candidates automatically, and requires human evaluation for every application stage.

> **⚠️ Code reality check (verified 2026-09-14).** Pure Option A is **not** what the platform
> does today. Employers already receive match scores — `matchScore: row.screenMatchScore`
> (`src/modules/employer/application/services/employer-application.service.ts:92`) — and the
> applicant list is **sorted by that score**
> (`employer-application.repository.ts:120`, `{ screenMatchScore: { sort: 'desc' } }`).
> Choosing Option A as written would require deleting recruiter-side scoring and sorting.
> The decision below reflects the system as built rather than requiring that removal.

**[X] Management Decision:** **Dual-Sided Advisory with Recruiter Covenants.** Scores remain visible to both candidates and recruiters; the platform is characterised as decision *support*, never an automated employment decision tool. Carried from the superseded 30-decision draft (its D1 Option C), where management ticked this option. Conditions: (a) Employer Terms must contractually prohibit automated rejection without human review; (b) a persistent non-binding advisory notice must render wherever a recruiter sees a score; (c) Candidate Terms must disclaim any guarantee of interview or employment.

---

### D2. How do we govern the AI data boundary: Local Ollama vs. Hosted DeepSeek?

**Context (What the code does today):**  
In `jobfits-ai-service`, tasks are routed via `ChatRouter`. `ResumeService`, `EmbedService`, and `MatchingEmbeddingService` are hardwired to local `OllamaClient` (running `qwen3` and `bge-m3`). User resumes, profiles, and candidate vector embeddings **never leave the internal network**. However, `job_requirements` (job posting body) and `interview` questions default to **DeepSeek** (`api.deepseek.com`, hosted in China) if `DEEPSEEK_API_KEY` is configured.

**Why this matters:**  
Sending data to external AI providers involves cross-border data transfer compliance and third-party terms of service. Disclosing that candidate resumes are processed on local/dedicated models is a major competitive trust advantage, but failing to disclose that job descriptions reach DeepSeek would constitute a material misrepresentation (and was explicitly flagged as a defect in `EXTENSION_PRIVACY_FACTS.md`).

| Dimension        | Option A — Maintain Hybrid Model with Full Disclosure                                                              | Option B — Total Local Isolation (Zero External AI)                                                  | Option C — Expand Third-Party Hosted AI (e.g. OpenAI / DeepSeek for all tasks)                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Architecture** | Ollama for all candidate PII / resumes; DeepSeek for public job descriptions & interview questions.                | Run all tasks (including requirements extraction) exclusively on local Ollama / RunPod.              | Route resumes and cover letters to commercial hosted APIs for higher quality / lower latency.                                          |
| **Pros**         | Fast requirement extraction; keeps candidate PII 100% private; avoids expensive GPU inference for public text.     | Maximum privacy; zero third-party AI disclosures; no data crosses international borders to DeepSeek. | Avoids GPU hosting complexity; higher output quality on complex resume parsing.                                                        |
| **Cons / Risks** | Must disclose DeepSeek by name in Privacy Policy and Extension Store listing; depends on Chinese API availability. | Requires beefier GPU infrastructure (RunPod / local) to handle parsing concurrency without timeouts. | **High Privacy Exposure.** Transmitting candidate resumes and PII to third-party commercial LLMs triggers intense regulatory scrutiny. |

> **Engineering Recommendation:** **Option A for launch, migrating toward Option B.** Disclose the exact structural boundary in the Privacy Policy: candidate resumes and personal profiles are processed strictly on dedicated infrastructure, while public employer job descriptions are routed to DeepSeek for requirement keyword extraction.

**[ ] Management Decision:** Option A

---

## Group B — Privacy, Data Protection & Retention 🔴 _Decide First_

---

### D3. Which governing privacy standard should we write the platform policies to?

**Context (What the code does today):**  
The platform's infrastructure sits in Tokyo, Japan (Google Cloud Run `asia-northeast1` and Supabase AWS `ap-northeast-1`). The development team and primary job corpus operate in Cambodia, with ingested jobs spanning Cambodia and the United States (TheMuse). The browser extension interacts with global platforms (LinkedIn, Indeed). The backend already implements "GDPR soft delete" concepts (`src/modules/admin/infrastructure/repositories/admin-user.repository.ts`).

**Why this matters:**  
Cambodia's Law on E-Commerce (2019) and Consumer Protection Law (2019) establish baseline consumer protections, but do not provide a comprehensive data privacy framework equivalent to GDPR or Singapore's PDPA. However, publishing a weak domestic policy exposes the platform to immediate liability if European or international candidates use the platform or the Chrome Web Store extension.

| Dimension | Option A — Full Voluntary GDPR / PDPA Alignment                                                                               | Option B — Minimum Viable Domestic Cambodian Policy                                                         | Option C — Phased GDPR-Aligned Policy (Middle Ground)                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Scope** | Complete legal bases, Data Subject Request (DSR) workflows, automated purge cron jobs, comprehensive DPA.                     | Basic domestic e-commerce policy covering basic account security and Cambodian contact info.                | Publish a robust GDPR-shaped policy immediately; phase in automated self-service DSR tooling over 2 sprints.               |
| **Pros**  | Maximum institutional trust; required for international candidates, global Chrome extension approval, and future fundraising. | Lowest initial legal drafting cost; no immediate obligation to build complex self-service purge tools.      | Balances international credibility with engineering reality; eliminates deceptive claims while establishing clear roadmap. |
| **Cons**  | Requires immediate engineering commitments for automated deletion pipelines and data portability endpoints.                   | Will require complete rewrite upon international expansion; unacceptable to Google Chrome Web Store review. | Requires discipline to deliver scheduled backend DSR endpoints within stated deadlines.                                    |

> **Engineering Recommendation:** **Option C.** Draft the Privacy Policy to an international GDPR-shaped standard immediately. Accurately disclose current administrative deletion capabilities, and schedule self-service deletion and automated retention purge routines as post-launch engineering deliverables.

**[ ] Management Decision:** Option C

---

### D4. What is our data protection relationship with employers regarding candidate data?

**Context:**  
When a job seeker applies to an internal job (`sourceType: INTERNAL`), the employer receives the candidate's profile, contact details, uploaded resume, and custom cover letter. The employer can view, download, add private notes to, and advance the application.

**Why this matters:**  
If an employer downloads candidate resumes and subsequently leaks them or uses them for unauthorized marketing, candidates may attempt to hold JobFit liable. The legal agreement must clearly define whether the employer acts as an independent controller or a joint controller.

| Dimension            | Option A — Independent Data Controllers                                                                                                | Option B — Joint Data Controllers                                                                                 | Option C — JobFit as Data Processor for Employers                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Legal Definition** | JobFit and the Employer are separate, independent controllers. JobFit controls the platform; Employer controls its own hiring process. | JobFit and Employer jointly determine the purposes and means of processing applicant data.                        | The Employer is the sole controller; JobFit merely processes data on their behalf.                           |
| **Pros**             | **Clean liability separation.** If an employer misuses candidate data after receiving it, the employer bears sole legal liability.     | Reflects deep collaborative data usage.                                                                           | Standard enterprise SaaS posture.                                                                            |
| **Cons**             | Must be clearly communicated to job seekers in the Privacy Policy so they understand employers receive their data directly.            | **Joint and several liability.** A data breach or misuse by an employer could legally impute liability to JobFit. | Inaccurate. JobFit independently processes resumes to generate platform-wide embeddings and recommendations. |

> **Engineering Recommendation:** **Option A.** Establish that JobFit and the Employer are independent data controllers. Include a mandatory **Candidate Data Confidentiality Covenant** in the Employer Terms requiring employers to use applicant data solely for assessing candidates for the specific opening.

**[ ] Management Decision:** Option A — Independent Data Controllers

---

### D5. What data retention and purge schedules should we formally establish?

**Context (What the code does today):**  
Currently, **there are no automated data purge crons in the backend.** Data accumulates indefinitely. When an admin deletes a user, the user's `email` is replaced with a tombstone, but the original address is retained in `deletedEmail`, and resume files in Supabase Storage remain untouched.

**Proposed Retention Schedule:**

| Data Category                                           | Proposed Retention Period                                                        | Technical / Legal Rationale                                                        | Management Choice          |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------- |
| **Active User Account Data**                            | Lifetime of active account + 30 days post-closure request                        | Core service operation.                                                            | [ ] Approve [ ] Amend: ___ |
| **Uploaded Resume Files (Supabase Storage)**            | Duration of account active status; **purged 30 days after account deactivation** | Storage cost management and privacy compliance; prevents orphaned PII files.       | [ ] Approve [ ] Amend: ___ |
| **Parsed Resume Text & Vectors**                        | Linked to resume record; purged upon resume replacement or account deletion      | Vector embeddings derive directly from PII.                                        | [ ] Approve [ ] Amend: ___ |
| **Submitted Job Applications**                          | **2 years post-application closure**, then anonymized                            | Protects employers and candidates in employment discrimination dispute windows.    | [ ] Approve [ ] Amend: ___ |
| **Security & Audit Logs (`SecurityEvent`, `AuditLog`)** | **1 year rolling**                                                               | Necessary for brute-force investigation, security auditing, and forensic analysis. | [ ] Approve [ ] Amend: ___ |
| **External Saved Jobs (`SavedExternalJob`)**            | Until deleted by user, or **1 year of inactivity**                               | User-controlled personal bookmarks.                                                | [ ] Approve [ ] Amend: ___ |
| **Evaluation Ground Truth (`MatchLabel`)**              | Retained indefinitely in de-identified / anonymized form                         | Critical algorithmic training and eval harness regression testing dataset.         | [ ] Approve [ ] Amend: ___ |

> **Engineering Recommendation:** Approve the proposed retention table. Fund a 1-sprint engineering task to implement an automated retention cleanup processor using BullMQ / Redis.

**[X] Management Decision:** **Retention table approved as proposed**, with the staged lifecycle carried from the superseded draft (its D11 Option C): re-engagement notice at 11 months of inactivity → cold archive at 12 months → full anonymisation at 36 months. Engineering to implement `DataRetentionService` plus the Supabase Storage purge worker. _(The original entry on this line read "All approve on you", which recorded approval of the table but left the schedule itself undecided; the staged lifecycle supplies it.)_

---

### D6. What does "Account Deletion" actually execute across the platform?

**Context (What the code does today):**  
Account deletion is implemented in `AdminUserService.deleteAccount` (`admin-user.repository.ts:123-151`). It is a **GDPR soft-delete**:

1. It updates `deletedAt = new Date()`, `isActive = false`, `status = DEACTIVATED`.
2. It renames `email` to a tombstone (`deleted_{id}@deleted.jobfit.local`) so that the unique constraint on `email` is released, allowing the user to re-register in the future.
3. It copies the original email to `deletedEmail` so support can trace past abuse or inquiries.
4. However, it **does not delete uploaded files from Supabase Storage**, and leaves application records intact. There is no self-service deletion endpoint for job seekers.

| Dimension     | Option A — Two-Tier Anonymization & Storage Purge (Recommended)                                                                                           | Option B — Immediate Cascade Hard Delete                                                                                            | Option C — Administrative Support-Ticket Only (Current State)                                        |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Mechanism** | Soft-delete releases active email; scrubs profile text; purges resume files from storage after 30-day grace period; keeps anonymized application history. | `prisma.user.delete({ where: { id } })` cascading to all child records.                                                             | Keep deletion restricted to Admin panel. Users must email support to request manual deletion.        |
| **Pros**      | Complies with right to erasure; preserves employer hiring audit records; protects evaluation datasets (`MatchLabel`).                                     | Absolute clean slate.                                                                                                               | Zero engineering required today.                                                                     |
| **Cons**      | Requires building user-facing `DELETE /users/me` endpoint.                                                                                                | **Destroys historical employer records, financial records, and evaluation datasets.** May violate legal recordkeeping requirements. | **Contradicts international privacy standards.** Frustrates users and invites regulatory complaints. |

> **Engineering Recommendation:** **Option A.** Build a user-facing self-service deletion flow in `(seeker)/settings` that executes the soft-delete, scrubs PII, schedules file deletion from cloud storage after a 30-day recovery grace period, and explains honestly to the candidate that past submitted applications remain visible to employers as anonymized historical records.

**[ ] Management Decision:** Option A

---

### D7. How do we legally capture and prove Terms Acceptance at Registration?

**Context (What the code does today):**  
On `jobfit-frontend/src/app/(auth)/signup/page.tsx`, there is a checkbox: `I agree to the Terms of Service and Privacy Policy`. Submitting the form passes `agreeToTerms: true` to the backend `RegisterDto`. However, the NestJS command handler **never passes `agreeToTerms` to the database**. The `User` table does not store when the user agreed or what version of the terms they accepted.

| Dimension               | Option A — Persist Acceptance Audit Trail                                                                                                                           | Option B — Status Quo (In-Memory Validation Only)                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Implementation**      | Add `termsAcceptedAt DateTime?` and `termsVersion String?` columns to the `User` model; record timestamp, version (`"2026-09-v1"`), and IP address at registration. | Continue validating that `agreeToTerms === true` in the DTO, but discard it after registration succeeds.                                |
| **Legal Defensibility** | **High.** Produces incontrovertible evidentiary proof in a legal dispute that the specific user consented to the specific terms version.                            | **Very Low.** In court or arbitration, the platform cannot prove which version of the terms the user accepted or when consent occurred. |
| **Engineering Effort**  | Very small: 1 Prisma migration + updating `register.command.handler.ts` (approx. 2 hours).                                                                          | Zero effort.                                                                                                                            |

> **Engineering Recommendation:** **Option A.** This is a critical legal vulnerability that is trivial to fix. Add `termsAcceptedAt` and `termsVersion` to the `User` model immediately.

**[ ] Management Decision:** Option A

---

## Group C — Platform Structure, Ingestion & Browser Extension

---

### D8. What is our legal posture regarding external job ingestion (BongThom, JobNet, TheMuse)?

**Context (What the code does today):**  
JobFit ingests public job listings from TheMuse (licensed public API), BongThom (public RSS feed), and JobNet.com.kh (schema.org JSON-LD web extraction). Ingested jobs carry `sourceType: EXTERNAL`. The platform **refuses in-app applications for external jobs**, presenting candidates with a "View on {Source}" button that redirects to the original publisher's URL.

**Why this matters:**  
Aggregating external job listings without explicit bilateral syndication agreements carries copyright and website terms-of-use considerations. In `INGESTION_KH_PLAN.md`, engineering noted that the terms of use for BongThom and JobNet were JavaScript-rendered and unverified at build time.

| Dimension            | Option A — Aggregator / Direct-Referral Model (Recommended)                                                                                | Option B — Full Content Ingestion & Internal Application                                                   | Option C — Strict Whitelist / API-Only Ingestion                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Operational Rule** | Index job metadata; always attribute source; redirect candidates to publisher URL to apply; honour publisher takedown notices immediately. | Parse external jobs, allow candidates to apply on JobFit, and forward resumes to external employer emails. | Ingest only from providers with explicit developer APIs (TheMuse) and deactivate BongThom/JobNet scraping.                              |
| **Legal Defense**    | Standard aggregator posture (similar to Google for Jobs / Indeed). Drives valuable applicant traffic back to the source publisher.         | High risk of copyright infringement and tortious interference claims from external job boards.             | Zero legal risk; eliminates potential scraping disputes with local Cambodian job boards.                                                |
| **Catalog Impact**   | Maintains a rich, active job catalog for Cambodian candidates (~300+ jobs).                                                                | High engineering complexity and severe legal risk.                                                         | **Drastically reduces job corpus.** Shrinks catalog to ~50 US jobs from TheMuse, making the product unviable for local Cambodian users. |

> **Engineering Recommendation:** **Option A.** Maintain the aggregator referral model. Ensure external jobs prominently display the original source logo, include an explicit disclaimer that JobFit is not affiliated with the source, provide a direct link to the original listing, and establish an expedited notice-and-takedown channel for job board publishers.

**[ ] Management Decision:** Option A — Aggregator / Direct-Referral Model (Recommended)

---

### D9. How do we structure browser extension terms to mitigate LinkedIn / Indeed scraping liabilities?

**Context (What the code does today):**  
The Chrome extension (`jobfit-extension`) injects content scripts into `linkedin.com`, `indeed.com`, `jobnet.com.kh`, `khmer24.com`, and `bongthom.com`.

- During casual browsing, it extracts **public identifiers only** (job title, company, job ID) to query `/recommendations/by-job`.
- It reads the posting body **only when the user explicitly clicks "Save Job" or "Full Report"**.
- It never runs background crawlers, does not scrape user connection networks, and does not store session cookies on the extension.

**Why this matters:**  
Major platforms like LinkedIn strictly prohibit automated data scraping in their terms of service (Section 8.2). However, under US legal precedent (_hiQ Labs v. LinkedIn_), user-directed client-side tools that process public webpage data at the explicit instruction of the authenticated user occupy a legally defensible posture, provided they do not bypass authentication paywalls or burden servers.

| Dimension                       | Option A — User-Directed Client-Side Assistant Terms                                                                                                        | Option B — Silent / Generic Terms                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Terms Formulation**           | Terms explicitly define the extension as a private personal productivity tool acting solely under the manual direction of the user on the active tab.       | Standard website terms without addressing browser extension functionality.                              |
| **Chrome Web Store Compliance** | Fully satisfies Google Chrome Web Store Single Purpose and User Data disclosure policies.                                                                   | Risk of extension rejection or delisting during Google Web Store review.                                |
| **Host Platform Stance**        | Clear demarcation: JobFit does not maintain a scraped database of LinkedIn; the candidate is using personal software to view their own match compatibility. | Ambiguity allows third parties to allege that JobFit operates an automated commercial scraping network. |

> **Engineering Recommendation:** **Option A.** Include a dedicated Browser Extension Acceptable Use section in the Terms of Service, clarifying that the extension is a client-side productivity tool operating on-demand at the user's manual instruction.

**[ ] Management Decision:** Option A — User-Directed Client-Side Assistant
---

### D10. What is our policy regarding the storage of external job descriptions?

**Context (What the code does today):**  
The backend handles job descriptions differently across two routes:

1. `POST /saved-jobs/external`: Stored verbatim in `saved_external_jobs.description` (up to 20,000 characters) so the user can review their saved bookmark even if the external posting expires.
2. `POST /match-report`: The job description is used to extract requirement keywords via AI, and the derived report is saved in `match_reports.payload`. **The full posting text is dropped and never stored.**

| Dimension            | Option A — Preserve Current Architectural Split                                                                                            | Option B — Store No External Posting Text (Link Only)                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Mechanism**        | Save Job stores text as a private user bookmark; Full Report stores derived summaries only.                                                | Save Job stores only the external URL, title, and company. No description text is retained.                   |
| **User Experience**  | **High.** Users can review job requirements even after the employer removes or closes the external listing.                                | **Poor.** If an external job is deleted on LinkedIn, the user's saved bookmark becomes an empty, broken link. |
| **Copyright Stance** | Justified under fair use / personal bookmarking exceptions (similar to Pocket or Evernote). Stored privately for the individual user only. | Eliminates any theoretical copyright exposure regarding external job description text.                        |

> **Engineering Recommendation:** **Option A.** Maintain the current architecture. Disclose clearly in the Privacy Policy that saved job descriptions are private personal bookmarks accessible solely by the account holder and are deleted upon user request.

**[ ] Management Decision:** Option A — Preserve Current Architectural Split

---

## Group D — Commercial Terms, Subscriptions & Monetization

---

### D11. How do we reconcile the pricing tier naming and subscription model?

**Context (What the code does today):**  
There is a documented discrepancy in plan nomenclature:

- **Backend Database (`schema.prisma`):** `SubscriptionTier` enum is `FREE`, `PREMIUM`, `PROFESSIONAL`.
- **Frontend Pricing UI (`pricing/page.tsx` & `payment.api.ts`):** Plans are marketed as `Free` ($0), `Pro` ($19/mo), and `Enterprise` ($49/mo).
- **Payment Backend:** `StripeAdapter` is an empty stub. No active billing engine exists in code today.

| Dimension         | Option A — Reconcile Code to Free / Pro / Enterprise ($0 / $19 / $49)                                                | Option B — Reconcile Code to Free / Premium / Professional                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Alignment**     | Update backend database enums and DTOs to match the current frontend marketing design (`FREE`, `PRO`, `ENTERPRISE`). | Update the frontend pricing table and copy to reflect `Free`, `Premium`, `Professional`.                                |
| **Market Impact** | "Pro" and "Enterprise" represent standard SaaS naming conventions familiar to modern job seekers and business teams. | "Premium" and "Professional" better reflect consumer career tiers (as "Enterprise" may imply B2B company-wide tooling). |

> **Engineering Recommendation:** **Option B (or Option A with clear B2C tiering).** For a job seeker platform, `Free`, `Premium`, and `Professional` are more intuitive than `Enterprise`. Regardless of choice, the database enums and frontend UI must be unified before Stripe payment processing goes live.

**[ ] Management Decision:** __________________________________________________

---

### D12. What is our subscription refund and cancellation policy?

**Context (What the code does today):**  
Frontend pricing states "Cancel anytime." The backend has no automated refund processing logic. Downgrading a subscription keeps the existing tier active until the paid period ends without prorated refunds.

| Dimension      | Option A — Standard No-Refund SaaS Policy                                                                         | Option B — 14-Day Money-Back Guarantee                                                             | Option C — Prorated Mid-Cycle Refunds                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Terms Rule** | Subscriptions can be cancelled anytime to prevent future renewals; payments for active cycles are non-refundable. | First-time subscribers may request a full refund within 14 days of initial upgrade via support.    | Prorated refund calculated based on unused days in the billing cycle.                                                  |
| **Pros**       | Simplest accounting; zero financial dispute overhead; industry standard for digital self-service tools.           | Reduces upgrade friction; builds candidate trust; easy to administer manually while volume is low. | Highly user-friendly.                                                                                                  |
| **Cons**       | Candidates who forget to cancel may file payment chargebacks.                                                     | Minimal financial cost if service quality is high.                                                 | High engineering complexity; prone to abuse (e.g. subscribing for 2 days to generate 10 cover letters and cancelling). |

> **Engineering Recommendation:** **Option B.** Adopt a clear 14-day money-back guarantee for first-time subscribers, reverting to Option A (cancellation effective at end of current period, no refunds) for subsequent recurring renewals.

**[ ] Management Decision:** __________________________________________________

---

### D13. How will employer job postings be monetized?

**Context (What the code does today):**  
Employers currently request access via `EmployerRequest`. Once approved by an Admin, employers can post and publish jobs (`JobSourceType.INTERNAL`) for free. There is no billing engine for employers.

| Dimension        | Option A — Free During Beta, Reserve Right to Monetize                                                                                                                  | Option B — Hardcoded Free Platform Guarantee                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Terms Stance** | Employer job postings are free during the initial rollout. Terms explicitly reserve the right to introduce job posting or applicant-sourcing fees upon 60 days' notice. | Terms state that posting jobs on JobFit is permanently free.                                     |
| **Pros**         | Total commercial flexibility; allows building initial employer network while reserving future monetization.                                                             | Strong selling point to attract initial employer listings away from legacy Cambodian job boards. |
| **Cons**         | Employers must be notified in advance when paid features launch.                                                                                                        | Extremely difficult to introduce fees later without contractual backlash.                        |

> **Engineering Recommendation:** **Option A.** State in the Employer Terms that core job posting features are currently provided without charge, while explicitly reserving the right to introduce premium listing tiers, promoted postings, and candidate search fees upon advance written notice.

**[ ] Management Decision:** Option A — Free During Beta, Reserve Right to Monetize

---

## Group E — Employer Vetting, Content Moderation & Jurisdiction

---

### D14. What are our verification standards and anti-scam liability shields for employers?

**Context (What the code does today):**  
The backend includes an employer onboarding workflow: an applicant submits an `EmployerRequest` containing company name, website, corporate email, phone, employee count, and industry. An admin manually reviews the ticket and clicks Approve or Reject (`admin-employer-request.controller.ts:117`).

**Why this matters:**  
Employment scams (fake recruitment checks, identity theft, human trafficking operations disguised as overseas IT jobs) are severe risks in Southeast Asia. If an unvetted employer uses JobFit to harvest candidate phone numbers, addresses, and resumes for fraudulent schemes, JobFit could face criminal scrutiny and immense civil liability.

| Dimension              | Option A — Mandatory Verification & Broad Disclaimers (Recommended)                                                                                                                          | Option B — Unverified Self-Service Registration                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Policy Standard**    | Admin approval required for all employers; verification of corporate email domain and business registration; explicit ToS terms disclaiming platform liability for employer representations. | Remove admin gating; allow anyone with an email address to post jobs immediately. |
| **Safety & Trust**     | **High.** Shields job seekers from fraudulent postings and fake recruitment rings.                                                                                                           | **Extremely Low.** Invites immediate platform abuse by scam syndicates.           |
| **Platform Liability** | Terms state clearly that JobFit conducts administrative identity checks but does not guarantee employer legitimacy, solvency, or workplace safety.                                           | Exposes JobFit to claims of negligence for facilitating fraudulent recruitment.   |

> **Engineering Recommendation:** **Option A.** Keep the administrative approval gate strictly mandatory. Require employers to warrant that they represent legitimate legal entities, and include an explicit disclaimer in the Job Seeker Terms advising candidates never to send money, bank credentials, or sensitive identity documents directly to employers.

**[ ] Management Decision:** Option A — Mandatory Verification & Broad Disclaimers (Recommended)

---

### D15. What specific job categories and recruiter practices are strictly prohibited?

**Context:**  
The platform needs an objective, enforceable Prohibited Listings Policy to support immediate administrative suspension of abusive accounts.

**Proposed Prohibited Job List:**

1. Postings requiring candidates to pay upfront application, training, equipment, or placement fees.
2. Multi-level marketing (MLM), pyramid schemes, or speculative commission-only roles.
3. Postings involving illegal activities, unlicensed gambling, adult entertainment, or human trafficking operations.
4. "Ghost jobs" or postings designed solely to harvest candidate resumes and contact lists without active hiring intent.
5. Discriminatory listings that restrict applicants based on gender, age, marital status, race, or religion (unless an authentic occupational qualification recognized by law exists).
6. Postings with deliberately false, misleading, or deceptive compensation terms.

| Dimension          | Option A — Enumerated List + Immediate Removal Rights                                             | Option B — General Vague Discretion                                        |
| ------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Enforceability** | Clear, objective grounds for account suspension; simplifies admin moderation and dispute defense. | Subjective enforcement; higher friction when suspended employers complain. |

> **Engineering Recommendation:** **Option A.** Adopt the enumerated prohibited listings list directly as an Annex to the Employer Terms of Service.

**[ ] Management Decision:** Option A — Enumerated List + Immediate Removal Rights

---

### D16. What is our governing law, dispute resolution forum, and authoritative language?

**Context:**  
The operating team is based in Phnom Penh, Cambodia. Infrastructure resides in Tokyo, Japan. The user interface currently supports English (with Khmer localization infrastructure in place).

| Dimension                       | Recommendation                                                                               | Operational / Legal Rationale                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Governing Law**               | **Law of the Kingdom of Cambodia**                                                           | Matches company entity, executive location, and core user base. Standard for domestic consumer protection.               |
| **Dispute Forum (Job Seekers)** | **Competent Courts of Phnom Penh, Cambodia**                                                 | Standard local judicial jurisdiction; informal mediation encouraged first. Avoid consumer arbitration clauses.           |
| **Dispute Forum (Employers)**   | **Competent Courts of Phnom Penh**, with optional **NCAC Arbitration** for high-value claims | National Commercial Arbitration Centre (NCAC) provides a professional commercial dispute forum for enterprise contracts. |
| **Authoritative Language**      | **English authoritative; Khmer version provided**                                            | Essential for Cambodian e-commerce compliance. Terms must be accessible to local candidates.                             |

> **Engineering Recommendation:** Adopt Cambodian governing law, designated Phnom Penh jurisdiction, and authorize professional translation of the Job Seeker Terms and Privacy Policy into Khmer.

**[ ] Management Decision:** Depend on you

---

## Group F — Carried Over From the Superseded 30-Decision Draft

The four decisions below have no equivalent elsewhere in this file. Management ticked them in
`docs/JOBFIT_LEGAL_DECISION_FRAMEWORK.md` before that draft was superseded, so they are
recorded here verbatim rather than re-opened. The other four ticks in that draft map onto
existing items: its D1 → **D1** above, its D9 → **D3**, its D11 → **D5**, its D18 → **D8**.

---

### D17. How should AI screening output be labelled so it does not read as a hiring verdict?

**Context (what the code does today):**
The AI service returns `verdict: "strong" | "possible" | "weak"`
(`jobfits-ai-service/app/prompts/match_reason_v2.txt`, typed as `MatchVerdict` in
`src/infra/ai/ai.types.ts:202`). Those words describe a **person's suitability**. Consumed in
`generation-eval.service.ts` only, so the rename is cheap today and expensive later.

> **Engineering Recommendation:** Rename to `coverage: "comprehensive" | "partial" | "sparse"`, which describes how well the document evidences the posting rather than judging the candidate. Mark screening output as an internal heuristic summary.

**[X] Management Decision:** **Option C** — rename `verdict` → `coverage`; Employer MSA §5.1 to state that JobFit supplies document-comparison summaries and makes no employment recommendation.

---

### D18. Who is liable when AI-generated resume or cover letter content is wrong?

**Context (what the code does today):**
Cover letters, resume sections and interview answers are LLM-generated. Nothing in the product
currently warns the user that generated text may be inaccurate before they send it to an employer.

> **Engineering Recommendation:** Place responsibility for verification on the user, and say so at the point of generation rather than only in the Terms.

**[X] Management Decision:** **Option C** — Job Seeker Terms §7.3 to state that generation features are experimental drafting aids and the user is responsible for verifying every statement; a persistent notice to render in the Resume Builder and generation UI; Employer MSA §6.4 to disclaim verification of candidate-submitted material.

---

### D19. How do we disclaim score calibration and small-model limitations?

**Context (what the code does today):**
`match-band.ts` records the measured position honestly: Spearman ρ 0.662 against human grades,
observed range 41–69, grades overlapping in the middle. The two-dimensional composite is
**not** calibrated at all — its 70/50 band thresholds were chosen for ordering, not derived
from a distribution.

> **Engineering Recommendation:** Publish the architecture and state plainly that scores measure document similarity, not competence.

**[X] Management Decision:** **Option C** — publish the mathematical architecture (`C = R × (0.30 + 0.70 × P/100)`, **as implemented**); add score-tooltip helper text stating that ratings reflect semantic overlap and do not predict hiring outcomes; Employer Terms §4.3 to caution that scores are not calibrated aptitude tests and must not be used as statutory cut-offs.

---

### D20. What rights do we assert over evaluation ground-truth data (`MatchLabel`)?

**Context (what the code does today):**
`MatchLabel` carries `onDelete: Cascade` on both `userId` and `jobId`
(`prisma/schema.prisma:1299,1301`). One account deletion therefore **destroys the evaluation
pairs derived from it**, which are the only measurement of whether matching works.

> **Engineering Recommendation:** Commit publicly to never training public generative models on resume text, and decouple `MatchLabel` so deletion does not erase the eval set.

**[X] Management Decision:** **Option C** — Privacy Policy §3.4 to state that JobFit does not sell resume data and does not train public generative models on resume text, while reserving de-identified aggregate telemetry for algorithm evaluation; `MatchLabel` foreign keys to become `ON DELETE SET NULL` or otherwise decoupled.

---

## Decision Summary Table

| #       | Decision Topic                           | Recommended Option                                       | Chosen Management Decision |
| ------- | ---------------------------------------- | -------------------------------------------------------- | -------------------------- |
| **D1** | AI Match Score Legal Characterization 🔴 | **Option A** — Strictly Candidate-Facing Advisory Tool   | **Dual-Sided Advisory** + recruiter covenants |
| **D2** | AI Boundary: Local Ollama vs DeepSeek    | **Option A** — Hybrid Model with Explicit Disclosures    | **Option A** — hybrid, DeepSeek disclosed |
| **D3** | Governing Privacy Standard 🔴            | **Option C** — Phased GDPR-Aligned Policy                | **Option C** |
| **D4** | Employer Data Protection Relationship    | **Option A** — Independent Controllers + Employer DPA    | **Option A** — Independent Controllers |
| **D5** | Data Retention & Purge Schedules         | Adopt Proposed Schedule + 1 Sprint Purge Cron            | **Approved** + staged 11/12/36-month lifecycle |
| **D6** | Scope of "Account Deletion"              | **Option A** — 2-Tier Anonymization & Cloud File Purge   | **Option A** |
| **D7** | Consent Recording at Registration        | **Option A** — Store Timestamp, Version, IP in DB        | **Option A** |
| **D8** | External Job Ingestion Posture           | **Option A** — Aggregator / Direct-Referral Model        | **Option A** + 48h takedown procedure |
| **D9** | Extension Terms & Anti-Scraping          | **Option A** — User-Directed Client-Side Assistant       | **Option A** |
| **D10** | External Job Description Storage         | **Option A** — Save Job = Bookmark; Report = Derived     | **Option A** |
| **D11** | Subscription Tier Reconciliation         | **Option B** — Free / Premium / Professional             | 🔴 **STILL OPEN** |
| **D12** | Subscription Refund Policy               | **Option B** — 14-Day Money-Back Guarantee               | 🔴 **STILL OPEN** |
| **D13** | Employer Monetization Stance             | **Option A** — Free During Beta, Reserve Right to Charge | **Option A** |
| **D14** | Employer Verification & Anti-Scam        | **Option A** — Mandatory Verification + Disclaimers      | **Option A** |
| **D15** | Prohibited Job Listings Policy           | **Option A** — Enumerated Prohibitions in Annex          | **Option A** |
| **D16** | Governing Law, Forum & Language          | Cambodian Law / Phnom Penh / English + Khmer             | 🔴 **STILL OPEN** — governing law is a legal choice, not an engineering one |
| **D17** | AI Screening Output Labelling             | **Option C** — `verdict` → `coverage`                     | **Option C** (carried over) |
| **D18** | AI Generation Accuracy Liability         | **Option C** — user verifies; persistent UI notice        | **Option C** (carried over) |
| **D19** | Score Calibration Disclaimers            | **Option C** — publish architecture as implemented        | **Option C** (carried over) |
| **D20** | Ground-Truth Data & Training Rights      | **Option C** — no public-model training; decouple FK      | **Option C** (carried over) |

---

# 4. Code & UI Action Items

Engineering tasks required to align the platforms with these legal policies. Items marked 🔴 are **launch-blocking** because operating without them creates active legal, regulatory, or store-listing exposure.

## 4.1 Launch-Blocking Engineering Items

| #        | Action Item                                                                                                                                                                                                                                                                                            | Target Location                                                                                            | Rationale / Dependencies                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 🔴 **1** | **Create Public Legal Routes in Web App**<br>Add `/terms` (Job Seeker & Employer Terms) and `/privacy` (Privacy Policy) in `jobfit-frontend`. Replace `href="#"` in `site-footer.tsx` and `signup/page.tsx`.                                                                                           | `src/app/(marketing)/terms/page.tsx`<br>`src/app/(marketing)/privacy/page.tsx`<br>`site-footer.tsx:98-103` | Operating a public web application without accessible terms and privacy disclosures violates consumer protection and store guidelines. |
| 🔴 **2** | **Persist Terms Acceptance Audit Trail**<br>Add `termsAcceptedAt DateTime?` and `termsVersion String?` columns to `User` in `prisma/schema.prisma`. Update `register.command.handler.ts` to record timestamp, version (`"2026-09-v1"`), and IP at registration.                                        | `prisma/schema.prisma`<br>`src/modules/auth/application/commands/`                                         | Needed for legally defensible proof of consent. (Supports **D7**).                                                                     |
| 🔴 **3** | **Host Public Privacy URL for Chrome Extension**<br>Deploy the rewritten `PRIVACY.md` from `jobfit-extension` to a publicly accessible URL (e.g., `https://jobfit.site/privacy/extension`). Update Chrome Web Store Developer Console listing.                                                         | `jobfit-extension/PRIVACY.md`<br>Web Store Console                                                         | Google Web Store rejects extensions without an active, public, and accurate privacy policy URL.                                        |
| 🔴 **4** | **Reconcile Pricing UI & Database Tiers**<br>Align `payment.api.ts`, `pricing/page.tsx`, and `schema.prisma` (`SubscriptionTier` enum) to the agreed tier names. Clearly mark billing as in "Beta" if live Stripe checkout is deferred.                                                                | `src/features/payment/api/payment.api.ts`<br>`jobfit-backend/prisma/schema.prisma`                         | Eliminates false marketing claims about unavailable or mismatched subscription features. (Supports **D11**).                           |
| 🔴 **5** | **Deploy DeepSeek Privacy Disclosures**<br>Verify that `DEEPSEEK_TASKS` in production matches the declared allowlist (`interview,job_requirements`), and ensure the public Privacy Policy explicitly names DeepSeek for requirement keyword extraction while certifying that resumes/PII remain local. | `jobfits-ai-service/.env`<br>`docs/EXTENSION_PRIVACY_FACTS.md`                                             | Prevents regulatory misrepresentation regarding third-party AI data transfers. (Supports **D2**).                                      |

## 4.2 Engineering Tasks Required by Specific Decisions

| #      | Action Item                                                                                                                                                                                 | Affected Component                                             | Required By  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------ |
| **6**  | **Self-Service Candidate Account Deletion**<br>Implement `DELETE /api/v1/users/me` endpoint in `user.controller.ts` allowing job seekers to trigger account closure directly from settings. | `src/modules/user/presentation/controllers/user.controller.ts` | **D6**       |
| **7**  | **Automated Storage File Purge Worker**<br>Create a BullMQ processor that purges uploaded resume PDF/DOCX files from the Supabase `resumes` bucket 30 days after user account deactivation. | `src/modules/resume/infrastructure/queue/`                     | **D5, D6**   |
| **8**  | **Publisher Notice-and-Takedown Intake**<br>Add an administrative mechanism to immediately unpublish or block specific external company postings upon publisher request.                    | `src/modules/job/application/services/job.service.ts`          | **D8**       |
| **9**  | **Khmer Localization of Core Legal Terms**<br>Translate Job Seeker Terms and Privacy Policy into Khmer; wire into frontend locale switcher.                                                 | `src/features/marketing/`                                      | **D16**      |
| **10** | **Employer Verification Acknowledgment**<br>Add an explicit terms checkbox to `EmployerRequest` modal affirming company authorization and agreeing to non-discrimination covenants.         | `src/modules/employer-request/`                                | **D14, D15** |
| **11** | **Rename AI Screening Output**<br>`verdict: "strong\|possible\|weak"` → `coverage: "comprehensive\|partial\|sparse"`. Touches the prompt, the `MatchVerdict` type, and three uses in the eval harness. | `jobfits-ai-service/app/prompts/match_reason_v2.txt`<br>`src/infra/ai/ai.types.ts:202`<br>`generation-eval.service.ts` | **D17**      |
| **12** | **Generation Accuracy Notice**<br>Persistent notice in the Resume Builder and every generation surface: AI output may be inaccurate; verify before sending.                                  | `jobfit-frontend` generation UI                                | **D18**      |
| **13** | **Score Tooltip & Advisory Banner**<br>Candidate-side tooltip ("semantic overlap, not a prediction of hiring") and a non-binding advisory banner wherever a recruiter sees a score.          | `jobfit-frontend`<br>employer application views                | **D19, D1**  |
| **14** | **Decouple `MatchLabel`**<br>Change both FKs from `onDelete: Cascade` to `SET NULL` (or decouple), so deleting an account no longer destroys the evaluation set. Schema + migration.         | `prisma/schema.prisma:1299,1301`                               | **D20**      |
| **15** | **Candidate Data Export**<br>`GET /users/me/export` returning profile, resumes, applications and preferences as structured JSON.                                                             | `src/modules/user/presentation/controllers/user.controller.ts` | **D3**       |
| **16** | **Staged Retention Service + External Link Liveness**<br>`DataRetentionService` (11 / 12 / 36-month lifecycle, zeroing `profiles.embedding` on archive) and a cron marking dead external `applyUrl` targets `CLOSED`, plus a one-click admin de-index. | `src/modules/job/`<br>`src/modules/admin/`                     | **D5, D8**   |

---

## Appendix — Sign-Off & Approvals

| Sign-Off Role                 | Name                 | Decisions Reviewed | Date         | Signature            |
| ----------------------------- | -------------------- | ------------------ | ------------ | -------------------- |
| **Project Lead / Management** | ____________________ | D1 – D16           | ____________ | ____________________ |
| **Engineering Lead**          | ____________________ | §1, §4 Feasibility | ____________ | ____________________ |
| **Legal Counsel**             | ____________________ | D1, D2, D3, D16    | ____________ | ____________________ |

---

_Basis of this document: Comprehensive code audit across `jobfit-backend` (NestJS 10 / Prisma 5 / PostgreSQL), `jobfit-frontend` (Next.js 15 / React 19), `jobfits-ai-service` (FastAPI / Ollama / DeepSeek router), and `jobfit-extension` (Chrome Manifest V3) as of 10 September 2026. Every factual technical claim in §1 is verified directly against active application code._
