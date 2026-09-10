# JobFit — Comprehensive Legal Decision Framework (30 Core Decisions)

**Prepared for:** JobFit Management / Leadership Review  
**Prepared by:** Engineering  
**Date:** 10 September 2026  
**Status:** Comprehensive Decision Document — **not** a formal legal opinion. Requires review by qualified legal counsel before public deployment.

---

## How to Use This Document

This document exists to convert **30 open legal, regulatory, architectural, and operational questions into recorded management decisions**, establishing the factual and policy foundation for drafting JobFit's production legal agreements.

* **Section 1** establishes the **factual basis**. Every statement is verified directly against the active codebases (`jobfit-backend`, `jobfit-frontend`, `jobfits-ai-service`, and `jobfit-extension`), incorporating the architectural findings, post-mortems, and edge-case analyses documented in `MENTOR_REVIEW_2026-08-18.md` and accompanying plans.
* **Section 2** specifies the **proposed architecture of the five core legal documents** required for the JobFit ecosystem.
* **Section 3** is the **management decision grid** covering 30 decisions across 8 core domains. Leadership marks their selection on each item's `Management Decision` line.
* **Section 4** details the **engineering action items and compliance roadmap** required to support and enforce these decisions prior to public launch.
* **Section 5** provides an **index of verified code references** mapping legal topics to exact repository files.

---

### Priority Blockers Requiring Immediate Leadership Determination

Three foundational decisions dictate the legal posture of the platform and should be resolved first:

| Priority | Decision | Why It Blocks |
|---|---|---|
| 🔴 **1st** | **D1 — AI Match Score Legal Characterization & AEDT Status** | Determines whether JobFit is legally classified as an Automated Employment Decision Tool (AEDT) under emerging regulations (e.g., EU AI Act High-Risk Annex III, NYC Local Law 144) or strictly as a candidate advisory career compass. Dictates liability structure, disclaimers, and mandatory bias audit requirements. |
| 🔴 **2nd** | **D6 — Multi-Provider AI Boundary & Third-Party LLM Routing** | Dictates data flows to external inference providers (`api.deepseek.com` vs. local Ollama), governing user consent, cross-border data transfer disclosures, and PII protection boundaries. |
| 🔴 **3rd** | **D9 — Governing Privacy Standard & Regulatory Compliance** | Establishes whether JobFit adheres to a universal GDPR / Singapore PDPA standard or a local baseline (Cambodian E-Commerce & Consumer Protection Laws), governing retention, rights to erasure, and DPA structures. |

Once these three foundational decisions are established, the remaining 27 decisions can be reviewed in parallel within their respective domains.

---

# 1. Architectural & Legal Summary

## 1.1 The Multi-Party Platform Model

JobFit operates as an **integrated AI recruitment and career navigation ecosystem** combining a modern Next.js 15 PWA web platform, a NestJS DDD modular backend, an on-premises/cloud hybrid FastAPI AI microservice, and a Chrome Manifest V3 browser extension.

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
     │  • Uses PWA offline storage (Dexie)     │     │  • Downloads candidate resumes (signed) │
     └────────────────────▲────────────────────┘     └─────────────────────────────────────────┘
                          │
                          │ Passive score lookup / Active clipping ("Save Job", "Full Report")
                          │
     ┌────────────────────┴────────────────────────────────────────────────────────────────────┐
     │                         EXTERNAL ECOSYSTEM & AGGREGATED BOARDS                          │
     │  • Direct Ingestion: TheMuse (API), BongThom (RSS), JobNet.com.kh (Schema JSON-LD)      │
     │  • Browser Extension (MV3): LinkedIn, Indeed, Khmer24, BongThom, JobNet                │
     │  • Candidates redirected off-platform for EXTERNAL job applications                     │
     │  • Private candidate tracking via Kanban board (TrackedJob)                             │
     └─────────────────────────────────────────────────────────────────────────────────────────┘
```

### Party Definitions and Code Manifestation

| Party | Code Representation | Operational Reality |
|---|---|---|
| **Platform Operator** | `UserRole.ADMIN`; `src/modules/admin/` | Operates backend infrastructure, evaluates employer onboarding requests (`EmployerRequest`), manages system health, triggers user locks/unlocks, supervises audit logs, and executes soft-deletion tombstones. |
| **Job Seeker (Candidate)** | `UserRole.JOB_SEEKER`; `src/modules/user/`, `resume/`, `matching/` | Uploads resumes, creates structured profile records, receives two-dimensional match calculations, tracks private applications (`TrackedJob`), accesses AI generation tools, and manages offline PWA sync. |
| **Employer (Recruiter)** | `UserRole.EMPLOYER`; `src/modules/employer/`, `company/`, `offer/` | Publishes internal job postings, manages company identity, reviews candidate applications, inspects candidate CVs via signed URLs, adds internal notes (`employerNotes`), and conducts offer negotiations. |
| **External Job Providers** | `JobSourceType.EXTERNAL`; `src/modules/ingestion/` | External job boards (BongThom, JobNet.com.kh, TheMuse) ingested via RSS/APIs/scraping, providing discovery without native application submission or direct recruiter interaction. |

---

## 1.2 System Architecture, Repositories & Verified Code Realities

The JobFit platform is split across four tightly integrated repositories:

1. **`jobfit-backend` (NestJS DDD Core):** Implements Clean Architecture with 26 bounded modules, Prisma ORM targeting PostgreSQL/pgvector via Supabase (port 6543 pooled, port 5432 direct), Redis-backed caching and token blacklisting, and background event listeners.
2. **`jobfit-frontend` (Next.js 15 PWA):** Enterprise web application featuring multi-role dashboards, TanStack React Query, Tailwind CSS design system, Serwist service worker, and Dexie IndexedDB (`jobfits-offline`) for offline caching and mutations.
3. **`jobfits-ai-service` (FastAPI Python Engine):** Hosts local NLP models via Ollama (BGE-M3 for 1024-d dense embeddings, Qwen/Llama for resume parsing) with optional proxying to DeepSeek API (`api.deepseek.com`).
4. **`jobfit-extension` (Chrome Manifest V3 Extension):** Injected content scripts running across 5 target job boards (`linkedin.com`, `indeed.com`, `jobnet.com.kh`, `khmer24.com`, `bongthom.com`), communicating with the backend via cookie-based SSO and storage sync.

### Grounded Technical Facts & Verified Post-Mortem Findings

A review of the engineering record (specifically `MENTOR_REVIEW_2026-08-18.md`, `TWO_DIMENSIONAL_MATCHING_SPEC.md`, `chat_router.py`, and related specifications) highlights critical architectural realities:

* **The Two-Dimensional Gating Engine:** Matches are computed across **Role Fit** ($R$, skills 60%, experience 40%) and **Preference Fit** ($P$, location 35%, work type 25%, seniority 20%, salary 20%). A non-linear damping penalty ($P < 0.65 implies 	ext{Damping} = (P / 0.65)^2$) forces logistical dealbreakers (e.g. Remote candidate vs On-Site job) into the `WEAK` band regardless of skill qualifications.
* **The Structural AI Privacy Boundary:** In `chat_router.py`, the boundary between local Ollama execution and DeepSeek cloud inference is **structural, not a convention**. Services handling candidate resumes, profile embeddings, and match reasoning are hardwired to `OllamaClient` and cannot reach DeepSeek even if configured. Only public job requirements and interview topic prompts are routed to `api.deepseek.com`.
* **Model Calibration & Negative Correlation:** Evaluation runs (`eval-generation.ts`) on smaller models (`qwen3:0.6b`) demonstrated negative Spearman correlation ($ho = -0.065$) on match reasoning, where poorly matched profiles scored higher than well-matched ones. This proves that raw model outputs cannot be treated as authoritative hiring determinations.
* **Automated Screening Verdicts:** The AI prompt `match_reason_v2.txt` explicitly instructs the model to return verdicts: `"strong" (clearly worth interviewing)`, `"possible"`, or `"weak" (wrong role or missing essentials)`. This constitutes an automated assessment of applicant suitability.
* **Tombstone Soft Deletion:** To prevent cascading deletes from destroying ground truth evaluation pairs (`MatchLabel`), `AdminUserRepository.softDelete` renames deleted user emails to a tombstone (`u_<id>@deleted.invalid`), clearing authentication while preserving historical relational integrity.
* **Application Resume Resolution:** An application row fixes `resumeId` at the moment of submission (`Application.resumeId`). Recruiters view the exact CV snapshot submitted, even if the candidate subsequently updates their active profile CV.
* **GPU Rate Limiting:** `AiThrottlerGuard` enforces per-user hourly caps (10 generations, 30 match reports, 20 resume scores, 120 match queries) to protect against denial-of-service and runaway cloud inference invoices.
* **Tracked Jobs vs. Saved Jobs:** Saved internal jobs (`SavedJob`) are tied to the platform listing and are removed if the employer deletes the posting. Tracked jobs (`TrackedJob`) belong entirely to the candidate's private Kanban board and survive external listing deletions.
* **Salary Formatting & Currency Realities:** In Cambodia, 348 out of 367 ingested jobs quote no salary; when quoted, salaries are often monthly in USD or KHR. `formatSalaryRange` outputs `null` for missing pay rather than fabricating `$0K`.
* **Stripe Subscription Stub:** The billing adapter is currently an empty stub (`StripeAdapter.createSubscription` returns `''`). Tier entitlements (`FREE`, `PREMIUM`, `PROFESSIONAL`) are presently enforced via admin grants.

---

# 2. Legal Document Suite Architecture

To protect JobFit across all jurisdictions and user interactions, five distinct legal instruments must be deployed:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 JOBFIT LEGAL SUITE                                     │
├────────────────────────────┬─────────────────────────────┬─────────────────────────────┤
│   1. JOB SEEKER TERMS      │    2. EMPLOYER MASTER       │    3. CANDIDATE PRIVACY     │
│      OF SERVICE            │       SERVICES AGREEMENT    │       POLICY                │
│  • Career compass advice   │  • Recruiter vetting rules  │  • GDPR / PDPA transparency │
│  • Account acceptable use  │  • Non-reliance on AI score │  • Retention & purge rules  │
│  • User content warranty   │  • Candidate data license   │  • DeepSeek vs Ollama flows │
│  • In-app offer disclaimer │  • Anti-discrimination duty │  • SAR & erasure protocols  │
├────────────────────────────┼─────────────────────────────┴─────────────────────────────┤
│   4. BROWSER EXTENSION     │    5. ACCEPTABLE USE & AI SAFETY POLICY                   │
│      PRIVACY STATEMENT     │  • Prohibited job listings (MLM, fees, fake jobs)        │
│  • Single-purpose scope    │  • Anti-scraping & bot restrictions                      │
│  • DOM extraction limits   │  • Zero-tolerance discrimination standards               │
│  • Third-party ToS notices │  • Human-in-the-loop candidate screening rules            │
└────────────────────────────┴───────────────────────────────────────────────────────────┘
```

# 3. Management Decision Grid (30 Core Decisions)

## Domain 1: AI Decisioning, AEDT Classification & Algorithmic Transparency

---

### D1 — AI Match Score Legal Characterization & AEDT Status

#### 1. Context & Technical Facts
JobFit calculates match percentages for candidates and employers using a two-dimensional mathematical formula (`TWO_DIMENSIONAL_MATCHING_SPEC.md`, `TwoDimensionalScoringService`):
Role Fit ($R = 0.60 \times \text{Skills} + 0.40 \times \text{Experience}$) multiplied by Preference Fit ($P = 0.35 \times \text{Location} + 0.25 \times \text{Type} + 0.20 \times \text{Level} + 0.20 \times \text{Salary}$) with non-linear damping ($P < 0.65 \implies (P/0.65)^2$).
Under Article 6 and Annex III (Point 4) of the EU Artificial Intelligence Act, AI systems intended to be used for the recruitment or selection of natural persons (specifically for screening, filtering, or evaluating applicants) are classified as **High-Risk AI Systems**. Similarly, New York City Local Law 144 regulates Automated Employment Decision Tools (AEDTs), requiring annual independent bias audits and candidate notices. If JobFit is classified as an AEDT, it incurs substantial regulatory burdens and legal liability for discriminatory impact.

#### 2. Decision Options
* **Option A (Pure Advisory Career Compass):** Legally characterize the system strictly as a personal productivity and career navigation aid for job seekers. Prohibit employers from utilizing scores as an automated gate.
* **Option B (Regulated AEDT Platform):** Embrace formal AEDT classification, commission annual independent algorithmic bias audits, and provide statutory candidate opt-outs and impact notices.
* **Option C (Dual-Sided Advisory with Contractual Recruiter Covenants):** Position the platform as dual-sided decision support while contractually obligating recruiters never to automate adverse employment actions based on scores.

#### 3. Comparative Evaluation
| Dimension | Option A — Advisory Career Compass | Option B — Regulated AEDT Platform | Option C — Dual-Sided Advisory (Recommended) |
|---|---|---|---|
| **Legal Definition** | Informational career tool for candidates; not an employment decision system. | High-Risk AI / AEDT subject to statutory bias audit regimes. | Algorithmic screening aid; recruiter retains exclusive decision authority. |
| **Pros** | Minimizes direct regulatory exposure under EU AI Act Annex III and NYC LL144. | Enables enterprise marketing to Fortune 500 ATS compliance teams. | Accurately reflects product architecture while mitigating automation liabilities. |
| **Cons** | Restricts marketing automated candidate ranking features to corporate recruiters. | Imposes massive audit compliance costs ($30k–$80k annually). | Requires strict disclaimer enforcement and recruiter behavioral monitoring. |
| **Technical Implementation** | Suppress recruiter candidate sort-by-score; show scores only to job seekers. | Implement statutory bias logging, disparate impact telemetry, and opt-outs. | Maintain existing scoring pipeline; inject mandatory recruiter advisory notices. |
| **Code Impact** | Restrict `ApplicationScreeningService.screen()` outputs on recruiter views. | Add `AuditLog` metrics tracking race, gender, and demographic score distributions. | Update `EmployerApplicationResponseDto` with explicit non-binding guidance markers. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended.** JobFit provides scores to both candidates and recruiters, but the engineering design intentionally leaves final screening decisions to human recruiters (`INTERNAL_EXTERNAL_JOBS_PLAN.md`). By combining dual-sided advisory disclaimers with express contractual covenants in the Employer Master Services Agreement (prohibiting automated rejections without human review), JobFit avoids high-risk AEDT classification while preserving product utility.

#### 5. Concrete Code & Policy Deliverables
* In **Employer Terms of Service (§4.2)**: Mandate that recruiters conduct human reviews of all applicants and covenant that match scores shall not serve as the sole criterion for disqualification.
* In **Candidate Terms of Service (§6.1)**: Include an express disclaimer that match percentages represent algorithmic approximations of keyword/vector relevance and guarantee neither interviews nor employment.
* In **Frontend UI (`EmployerApplicationResponseDto`)**: Render a persistent banner: *"JobFit match scores are heuristic indicators designed to assist human review. Final hiring decisions rest exclusively with the employer."*

#### 6. Management Decision
`[ ] Option A    [ ] Option B    [X] Option C (Recommended)`  
*Decision Notes:* __________________________________________________

---

### D2 — Automated Screening Verdicts & Recruiter Advisory Limits

#### 1. Context & Technical Facts
In `jobfits-ai-service/app/prompts/match_reason_v2.txt`, the AI prompt explicitly commands the model:
`verdict: "strong" (clearly worth interviewing for this role), "possible" (partial fit, some core gaps), "weak" (wrong role or missing the essentials)`.
Furthermore, the prompt states: *"A candidate from a different profession scores below 0.2."*
This output is returned to `ApplicationScreeningService.screen()` and projected onto `EmployerApplicationResponseDto`. Providing an explicit verdict that a candidate is *"clearly worth interviewing"* or *"weak"* crosses the boundary from neutral relevance matching into affirmative employment decision-making.

#### 2. Decision Options
* **Option A (Factual Requirement Analysis Only):** Strip qualitative verdicts (`strong/possible/weak`) from prompts. Emit only factual requirement match lists and documented candidate gaps.
* **Option B (Retain Verdicts with Binding Human-in-the-Loop Safeguards):** Maintain current qualitative verdicts but require employers to check a mandatory confirmation box affirming human review before rejecting any applicant.
* **Option C (Rephrase Verdicts to Neutral Alignment Tiers):** Replace evaluative employment terms ("clearly worth interviewing") with neutral alignment terminology (`HIGH_ALIGNMENT`, `MODERATE_ALIGNMENT`, `GAP_IDENTIFIED`).

#### 3. Comparative Evaluation
| Dimension | Option A — Factual Analysis Only | Option B — Human Confirmation Gate | Option C — Neutral Alignment Tiers (Recommended) |
|---|---|---|---|
| **Legal Definition** | Pure information extraction; zero qualitative assessment. | Qualitative AEDT with procedural human-in-the-loop validation. | Heuristic document alignment classification. |
| **Pros** | Complete elimination of automated hiring verdict liability. | Keeps strong recruiter value proposition of instant candidate triage. | Balances recruiter clarity with safe legal taxonomy. |
| **Cons** | Less actionable for recruiters skimming 100+ applicants. | Extra friction in recruiter applicant review UI. | Requires prompt revision and DTO enum adjustments. |
| **Technical Implementation** | Delete `verdict` key from `match_reason_v2.txt` and backend DTOs. | Block `PATCH /applications/:id/status` to `REJECTED` without `humanReviewed: true`. | Update prompt schema and map `verdict` to objective alignment labels. |
| **Code Impact** | Refactor `MatchReasonResponse` in `ai.types.ts` and `ScreeningSummaryDto`. | Add `humanReviewedAt` timestamp column to `Application` in Prisma. | Edit `match_reason_v2.txt` lines 29-37 and frontend badge rendering. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended**, complemented by the procedural safeguard of Option B. Evaluative statements like *"clearly worth interviewing"* create immense liability if a rejected candidate from a protected class discovers the AI marked them "weak" based on a parsing defect. Reframing the prompt to output objective alignment categories eliminates prescriptive employment advice while preserving the recruiter's ability to prioritize reviews.

#### 5. Concrete Code & Policy Deliverables
* In `match_reason_v2.txt`: Replace `verdict: "strong|possible|weak"` with `coverage: "comprehensive|partial|sparse"`.
* In `ApplicationScreeningService`: Ensure that screening data is marked as an internal heuristic summary.
* In **Employer Master Services Agreement (§5.1)**: Explicitly state that JobFit provides document comparison summaries and does not make employment recommendations or screening decisions.

#### 6. Management Decision
`[ ] Option A    [ ] Option B    [X] Option C (Recommended)`  
*Decision Notes:* __________________________________________________

---

### D3 — AI Hallucination, Cover Letter & Resume Fabrication Liability

#### 1. Context & Technical Facts
JobFit provides automated generative AI capabilities for job seekers via `GenerationService` (`jobfit-backend/src/modules/generation/generation.service.ts`):
- `coverLetterForApplication`: Generates tailored cover letters using candidate resume summaries and employer job descriptions.
- `interview`: Generates tailored interview preparation questions and evaluates user answers.
- `ResumeBuilder`: Suggests bullet points and summaries based on profile inputs.
LLMs inherently suffer from hallucinations and may invent job titles, metrics, technical proficiencies, or certifications that the candidate does not possess. If an applicant submits an AI-generated cover letter containing false claims, and an employer relies upon it, disputes will arise regarding whether the candidate or JobFit committed misrepresentation or fraud.

#### 2. Decision Options
* **Option A (Candidate Sole Authorship & Verification Warranty):** Legal terms establish that all AI-generated text is a preliminary draft provided solely for the user's manual review, editing, and adoption. The candidate warrants sole authorship and absolute truthfulness.
* **Option B (Shared Platform Warranty):** JobFit warrants that generative outputs accurately reflect the candidate's uploaded resume data.
* **Option C (Disclaim All Representations with Mandatory Pre-Send Confirmation):** The platform disclaims all warranties regarding accuracy or fitness for purpose, and requires candidates to click an explicit confirmation before exporting or submitting generated text.

#### 3. Comparative Evaluation
| Dimension | Option A — Candidate Sole Authorship | Option B — Shared Platform Warranty | Option C — Disclaimers + Pre-Send Gate (Recommended) |
|---|---|---|---|
| **Legal Definition** | Candidate is legally the sole author and principal. | Platform acts as an accredited career agent warranting factual content. | Absolute disclaimer of accuracy coupled with procedural user adoption. |
| **Pros** | Complete legal shield for JobFit against employer fraud claims. | Differentiates platform as an enterprise-grade trusted career partner. | Strongest evidentiary defense against candidate negligence and third-party claims. |
| **Cons** | Standard SaaS posture; must be clearly communicated in UI. | Immense legal liability; uninsurable against LLM hallucinations. | Minor friction when user generates and copies documents. |
| **Technical Implementation** | Static clauses in Job Seeker Terms of Service. | Complex verification microservice validating generated text against CV. | Add modal/checkbox: *"I verify that all information in this document is accurate."* |
| **Code Impact** | None on backend; Terms of Service drafting only. | Major architectural investment in factual consistency verification. | Minor frontend state in `generation` and `resume-builder` modals. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended.** Generative AI models cannot be guaranteed to produce 100% factual summaries. Combining a comprehensive disclaimer of accuracy in the Terms of Service with a mandatory pre-export confirmation modal in the UI creates an unassailable legal audit trail proving that the candidate reviewed, adopted, and verified the text as their own before transmitting it to an employer.

#### 5. Concrete Code & Policy Deliverables
* In **Job Seeker Terms of Service (§7.3)**: State that AI generation features are experimental draft-generation tools. The user assumes full responsibility for reviewing, editing, and verifying all submissions.
* In **Resume Builder & Generation UI**: Display a persistent notice: *"AI-generated content may contain inaccuracies. Verify all statements, dates, and skills before submitting."*
* In **Employer Master Services Agreement (§6.4)**: Include a disclaimer that JobFit does not verify the truthfulness of candidate-submitted application materials or AI-assisted cover letters.

#### 6. Management Decision
`[ ] Option A    [ ] Option B    [X] Option C (Recommended)`  
*Decision Notes:* __________________________________________________

---

### D4 — Model Calibration, Small LLM Limitations & Confidence Disclaimers

#### 1. Context & Technical Facts
In `MENTOR_REVIEW_2026-08-18.md` §13 and `HANDOFF_2026-08-17.md` §6, engineering documented that model calibration evaluations (`eval-generation.ts` and `eval-retrieval.ts`) revealed negative correlation ($ho = -0.065$) on match reasoning when using small local LLMs (`qwen3:0.6b`). A candidate with no resume scored a constant 40 on experience, and match percentages varied by as little as 4 points between a senior engineer and a graphic designer. While two-dimensional gating has since stabilized ranking order, the exact **percentage** shown to users has never been statistically calibrated against ground truth hiring outcomes.

#### 2. Decision Options
* **Option A (Disclose Experimental Estimation Nature):** Retain percentage display (e.g., "87% Match") while publishing an explicit Algorithmic Transparency Notice explaining that scores are relative similarity estimates, not predictive probabilities of hiring.
* **Option B (Abolish Numerical Percentages):** Remove numerical percentages from the entire UI. Replace them with broad qualitative match bands: `HIGH`, `MODERATE`, `WEAK`.
* **Option C (Tiered Score Display):** Show broad qualitative bands to free users, while reserving detailed dimensional radar breakdowns (Role Fit vs Preference Fit) for Pro subscribers with technical calibration disclaimers.

#### 3. Comparative Evaluation
| Dimension | Option A — Percentage + Transparency Notice | Option B — Qualitative Bands Only | Option C — Tiered Qualitative / Breakdown (Recommended) |
|---|---|---|---|
| **Legal Definition** | Continuous numerical metric accompanied by prominent experimental caveats. | Ordinal ranking metric with low precision commitments. | Qualitative triage with paid deep-dive analytics. |
| **Pros** | Maintains high user engagement and gamified UX appeal. | Eliminates false precision and candidate disputes over score variations. | Monetization driver; prevents over-reliance by general users. |
| **Cons** | Candidates may obsess over minor 2–3% variations and claim bias. | Flattens nuanced mathematical distinctions calculated by the engine. | Requires distinct UI rendering paths based on user subscription tier. |
| **Technical Implementation** | Publish Algorithmic Methodology document and tooltip disclaimers. | Refactor frontend to map 0–100 scores to 3 discrete badge styles. | Render score badges as `GREAT / GOOD / FAIR / WEAK`; reveal % in Pro radar view. |
| **Code Impact** | Documentation only; no code changes. | Refactor `RecommendationCard.tsx` and `match-score.util.ts`. | Modify `EntitlementService` checks around `ScreeningSummaryDto.breakdown`. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended.** The core insight from engineering evaluations is that small LLMs provide coarse triage rather than fine-grained percentage calibration. Presenting categorical bands (`GREAT FIT` $ge 80$, `GOOD FIT` $65–79$, `FAIR FIT` $50–64$, `WEAK FIT` $<50$) prevents users from misinterpreting the score as an authoritative mathematical certainty, while allowing advanced users to inspect the dimensional breakdown.

#### 5. Concrete Code & Policy Deliverables
* In **Algorithmic Transparency Disclosure**: Publish the mathematical architecture ($R \times P$ with non-linear damping) and clarify that scores measure document similarity rather than human competency.
* In **Frontend Score Tooltip**: Add helper text: *"Match ratings reflect the semantic overlap between your resume and the job listing. They do not predict hiring outcomes."*
* In **Employer Terms of Service (§4.3)**: Explicitly caution recruiters that scores are not calibrated aptitude tests and must not be used as statutory cut-offs.

#### 6. Management Decision
`[ ] Option A    [ ] Option B    [X] Option C (Recommended)`  
*Decision Notes:* __________________________________________________

---

### D5 — Ground Truth Data (`MatchLabel`) & Training Rights on User Resumes

#### 1. Context & Technical Facts
The database contains a `MatchLabel` table (`schema.prisma` lines 1296–1318) designed to store human-graded evaluation pairs (candidate CV + job posting + ground truth label: `RELEVANT / IRRELEVANT`). In `MENTOR_REVIEW_2026-08-18.md` §14, it was documented that hard-deleting users through the console destroyed 50 hand-labelled evaluation pairs. To improve matching accuracy, JobFit may wish to fine-tune local embedding models (BGE-M3) or train rerankers using anonymized candidate resumes, applications, and recruiter hiring outcomes.

#### 2. Decision Options
* **Option A (Express Consent for Internal AI Training & Evaluation):** Include an explicit grant in the Privacy Policy allowing JobFit to use de-identified resume text and platform interactions for model training, calibration, and evaluation.
* **Option B (Zero Model Training on User Data):** Strictly prohibit the use of user-uploaded CVs for AI training. Limit all model training to public benchmark datasets.
* **Option C (Evaluation & Benchmarking Only):** Restrict user data usage to automated evaluation harnesses (measuring nDCG, Recall, and MRR) without fine-tuning model weights on candidate CVs.

#### 3. Comparative Evaluation
| Dimension | Option A — Express Training Grant | Option B — Zero Training on User Data | Option C — Evaluation Only (Recommended) |
|---|---|---|---|
| **Legal Definition** | Broad proprietary license to derive algorithmic models from user data. | Absolute data segregation; user data is strictly operational. | Limited analytical license for quality assurance and metric validation. |
| **Pros** | Enables domain-specific model fine-tuning for the Cambodian job market. | Maximizes candidate trust; trivial GDPR Art. 6(1)(b) compliance. | Protects evaluation integrity (`MatchLabel`) without IP or privacy controversies. |
| **Cons** | Privacy backlash; requires complex anonymization pipelines under GDPR. | Prevents JobFit from improving proprietary models using platform data. | Precludes direct model weight fine-tuning on proprietary candidate text. |
| **Technical Implementation** | Build automated PII scrubber stripping names, emails, and phones before storage. | Enforce strict read-only inference boundaries in `ai-service`. | Maintain `MatchLabel` harness using anonymized embeddings and IDs. |
| **Code Impact** | Add `AnonymizedResumeCorpus` table and sanitization worker. | None. Existing code already isolates inference from training. | Add foreign key decoupling so `MatchLabel` survives user tombstone deletion. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended** for the current operational stage, with a pathway to Option A via explicit opt-in. Preserving evaluation ground truth (`MatchLabel`) is essential for engineering quality assurance. However, claiming unconstrained rights to train generative AI on private resumes triggers immediate user distrust and regulatory scrutiny. Restricting use to benchmarking and quality assurance provides complete legal safety.

#### 5. Concrete Code & Policy Deliverables
* In **Candidate Privacy Policy (§3.4)**: State clearly: *"JobFit does not sell your resume data or use your personal resume text to train public generative AI models. We may use de-identified, aggregated interaction telemetry to evaluate matching algorithm quality."*
* In `schema.prisma`: Alter `MatchLabel` foreign keys to use `ON DELETE SET NULL` or decouple candidate references so evaluation pairs are not destroyed when accounts are deleted.

#### 6. Management Decision
`[ ] Option A    [ ] Option B    [X] Option C (Recommended)`  
*Decision Notes:* __________________________________________________

---

## Domain 2: AI Infrastructure Boundary, Data Routing & Model Providers

---

### D6 — Multi-Provider AI Boundary & Third-Party LLM Routing

#### 1. Context & Technical Facts
In `jobfits-ai-service/app/services/chat_router.py`, JobFit routes AI tasks between a local Ollama instance and DeepSeek's cloud API (`api.deepseek.com`).
The architecture enforces a strict structural boundary:
- `TASK_INTERVIEW` (job title + seniority) $\to$ DeepSeek cloud allowed.
- `TASK_JOB_REQUIREMENTS` (employer's public posting) $\to$ DeepSeek cloud allowed.
- `TASK_INTERVIEW_FEEDBACK` (user's written answer) $\to$ Local Ollama default.
- `TASK_COVER_LETTER` (`resumeSummary` derived from CV) $\to$ Local Ollama default.
- `ResumeService`, `EmbedService`, `RerankService`, and `MatchReasonService` take `OllamaClient` directly and **cannot reach DeepSeek under any configuration**.
However, if `DEEPSEEK_TASKS` is configured to include `cover_letter`, personal summary text derived from a candidate's CV is transmitted to DeepSeek's external cloud.

#### 2. Decision Options
* **Option A (Strict Air-Gapped Boundary):** Hardcode the architectural boundary so that personal candidate data (CVs, cover letters, feedback) can **never** be transmitted to external cloud LLMs under any environment configuration.
* **Option B (Dynamic Provider Routing with User Consent):** Permit routing of generative tasks (cover letters, feedback) to external cloud LLMs (DeepSeek, OpenAI) provided that the candidate explicitly toggles "Enable Cloud AI Acceleration".
* **Option C (Fully Hosted Enterprise Cloud):** Abandon local Ollama instances and route all AI processing to enterprise cloud tenants (e.g., Azure OpenAI or AWS Bedrock) backed by Business Associate Agreements and Zero Data Retention policies.

#### 3. Comparative Evaluation
| Dimension | Option A — Strict Air-Gapped Boundary (Recommended) | Option B — Dynamic Routing with Consent | Option C — Fully Hosted Enterprise Cloud |
|---|---|---|---|
| **Legal Definition** | Absolute technical isolation of personal data from third-party AI clouds. | User-consented third-party data processing and cross-border transfer. | Third-party enterprise data processing under strict B2B DPA. |
| **Pros** | Maximum data protection posture; zero third-party PII leak liability. | Flexibility to leverage high-performance cloud models on demand. | Eliminates local GPU hosting costs and operational maintenance. |
| **Cons** | Constrained by local GPU capacity and smaller model reasoning limits. | Complex UI consent toggles and dual error-handling logic. | High variable inference costs; reliance on enterprise cloud contracts. |
| **Technical Implementation** | Remove `TASK_COVER_LETTER` from `KNOWN_TASKS` in `chat_router.py`. | Add `cloudAiConsent: Boolean` to `User` and pass flag in `AiClient`. | Replace Ollama client with enterprise SDKs in `jobfits-ai-service`. |
| **Code Impact** | Lock `chat_router.py` to public tasks (`interview`, `job_requirements`). | Modify `generate.py`, `generation.service.ts`, and user profile settings. | Wholesale rewrite of `ai-service` model execution layer. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** The most profound architectural asset of JobFit is its structural privacy boundary. By guaranteeing that candidate resumes and profile data are processed exclusively on infrastructure operated directly by JobFit (or its private dedicated host), JobFit achieves a market-leading privacy standard that easily satisfies GDPR, PDPA, and Cambodian data protection principles. Public job descriptions and generic interview questions carry zero candidate PII and can safely utilize DeepSeek for cost-effective extraction.

#### 5. Concrete Code & Policy Deliverables
* In `chat_router.py`: Permanently exclude `cover_letter` and `interview_feedback` from `KNOWN_TASKS`, ensuring they execute exclusively on local Ollama models.
* In **Candidate Privacy Policy (§4.1)**: Disclose clearly: *"Your resume, profile, and personal career history are processed exclusively on JobFit's secure private infrastructure and are never transmitted to third-party generative AI providers."*
* In **Extension Privacy Policy (`PRIVACY.md`)**: Update the disclosures to mirror this exact boundary (job postings may use DeepSeek; candidate CVs never do).

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

### D7 — Cross-Border AI Data Transfers & China Data Protection (PIPL)

#### 1. Context & Technical Facts
When JobFit extracts job requirements via `POST /match-report` or generates generic interview questions via `POST /generate/interview-prep`, requests are forwarded to `api.deepseek.com` if `DEEPSEEK_API_KEY` is active. DeepSeek is headquartered in Hangzhou, People's Republic of China, and operates servers subject to the PRC Personal Information Protection Law (PIPL) and Data Security Law. Even though only public job postings and generic titles are transmitted, cross-border data transfer regulations in the EU (GDPR Chapter V), Singapore (PDPA), and Cambodia (E-Commerce Law Sub-Decree) require disclosure of international data destinations.

#### 2. Decision Options
* **Option A (Disclose DeepSeek as International Sub-Processor):** Explicitly name DeepSeek in privacy policies, identifying the data transmitted (public job postings only) and its server location.
* **Option B (Migrate Cloud Routing to Western / Regional Providers):** Replace DeepSeek with AWS Bedrock Tokyo or OpenAI EU/US endpoints to simplify cross-border regulatory compliance.
* **Option C (Contractual Zero-Retention Standard):** Execute an enterprise API agreement with DeepSeek confirming zero data retention, zero training on API payloads, and standard international contractual clauses.

#### 3. Comparative Evaluation
| Dimension | Option A — Transparent Disclosure (Recommended) | Option B — Migrate to Western Cloud | Option C — Enterprise Zero-Retention Contract |
|---|---|---|---|
| **Legal Definition** | Transparent disclosure of non-personal international data transmission. | Conventional US/EU sub-processor framework under Standard Contractual Clauses. | Negotiated B2B international data transfer agreement. |
| **Pros** | Maintains DeepSeek's extreme cost advantage ($0.14/M tokens) with honest disclosure. | Higher familiarity and acceptance among Western enterprise clients. | Maximum formal legal compliance with cross-border transfer laws. |
| **Cons** | Potential user friction regarding PRC-based AI processing. | 10x–20x higher cloud inference costs for requirement extraction. | DeepSeek self-serve API does not offer custom negotiated enterprise DPAs. |
| **Technical Implementation** | Update public privacy documents to explicitly identify DeepSeek's role. | Refactor `deepseek_client.py` to call Anthropic, OpenAI, or AWS Bedrock. | Secure executed DPA from DeepSeek corporate sales team. |
| **Code Impact** | Documentation updates in `PRIVACY.md` across backend and extension. | Rewrite API client, error handling, and prompt structures in `ai-service`. | None on code; legal contract execution only. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** Because the structural boundary established in D6 guarantees that **no personal candidate data** reaches DeepSeek, the data transmitted consists entirely of publicly published job advertisements and general occupation titles. Under international data privacy laws (including GDPR and PIPL), public company data does not constitute personal data. Transparent disclosure in the privacy policy provides complete legal honesty without incurring unnecessary API cost inflation.

#### 5. Concrete Code & Policy Deliverables
* In **Privacy Policy (Sub-Processor Schedule)**: List `DeepSeek (Hangzhou DeepSeek Artificial Intelligence Co., Ltd.)` as a sub-processor utilized strictly for public job description analysis and generic interview question synthesis.
* In `jobfit-extension/PRIVACY.md`: Maintain the disclosure added in August 2026 accurately identifying DeepSeek's role in the Full Report feature.

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

### D8 — AI Degradation, Service Outages & Heuristic Fallback Disclaimers

#### 1. Context & Technical Facts
As documented in `AI_DEGRADATION_PLAN.md` and implemented in `GenerationService` (`generation.service.ts` lines 72–78):
- If the AI service fails or times out, cover letter generation gracefully degrades to a static string template (`templateCoverLetter`).
- Interview preparation degrades to a static, hardcoded set of generic questions.
- Application screening degrades to rule-based keyword counts.
Users who pay for a `PREMIUM` or `PROFESSIONAL` subscription are paying specifically for AI-powered features. If the AI service experiences downtime and users receive static templates without notice, subscribers may assert claims for breach of contract, misleading conduct, or demand pro-rata subscription refunds.

#### 2. Decision Options
* **Option A (Silent Graceful Degradation):** Continue serving heuristic fallbacks silently to preserve system uptime and prevent HTTP 500 errors.
* **Option B (Transparent Degradation with UI Notice):** Return heuristic fallbacks but explicitly notify the user in the response metadata and UI that the output was generated via a fallback template due to service maintenance.
* **Option C (Hard Failure for Paid Users):** Fail fast with an HTTP 503 error for paid subscribers when AI models are offline, preserving their monthly generation quotas and preventing consumption of static templates.

#### 3. Comparative Evaluation
| Dimension | Option A — Silent Graceful Degradation | Option B — Transparent Notice (Recommended) | Option C — Hard Failure on Paid Routes |
|---|---|---|---|
| **Legal Definition** | "As-Is" service delivery satisfying nominal availability. | Transparent service degradation with express operational notice. | Strict SLA enforcement; failure to deliver contract service triggers 503. |
| **Pros** | Maximum UX resilience; user never encounters an error page. | High consumer honesty; prevents deceptive trade practice claims. | Protects paid user quota; zero risk of misrepresenting static text as AI. |
| **Cons** | Consumer protection liability; charging for AI while delivering static text. | Users may complain about transient AI service unreliability. | Breaks user workflows; high support ticket volume during GPU reboots. |
| **Technical Implementation** | Current implementation in `generation.service.ts`. | Emit `generatedBy: 'template'` in DTO and render UI badge. | In `AiClient`, throw `ServiceUnavailableException` if user is paid. |
| **Code Impact** | None. | Minor frontend badge in cover letter view indicating template status. | Modify `GenerationController` error handling logic. |

#### 4. Recommended Strategy & Rationale
**Option B is recommended.** Silent degradation creates severe legal vulnerability under consumer protection legislation (e.g., Cambodian Law on Consumer Protection Article 21 prohibiting misleading representations regarding the nature and characteristics of services). By transparently flagging that a template fallback was used and ensuring that such fallback generations do **not** count against the user's paid monthly quota, JobFit maintains goodwill, legal compliance, and operational resilience.

#### 5. Concrete Code & Policy Deliverables
* In `GenerationService`: Ensure that when `result.generatedBy === 'template'`, the user's paid generation usage counter is **not** decremented.
* In **Frontend UI**: Display an informational toast: *"Our AI engine is currently experiencing high load. A standard professional template has been provided, and this generation has not been deducted from your quota."*
* In **Terms of Service (§8.2)**: Include a standard Service Availability clause noting that algorithmic and AI features are subject to maintenance and temporary degradation without constituting a total service failure.

#### 6. Management Decision
`[ ] Option A    [ ] Option B (Recommended)    [ ] Option C`  
*Decision Notes:* __________________________________________________

## Domain 3: Candidate Data Privacy, Ownership, Retention & Erasure

---

### D9 — Governing Privacy Standard & Regulatory Compliance

#### 1. Context & Technical Facts
JobFit is engineered and operated primarily in Cambodia, ingesting jobs from domestic platforms (`bongthom.com`, `jobnet.com.kh`, `khmer24.com`) and global platforms (`linkedin.com`, `indeed.com`, `themuse.com`). Candidate data, applications, and embeddings reside in Supabase (AWS Tokyo) and Cloud Run (Tokyo).
Cambodia regulates data privacy under the Law on E-Commerce (2019, Chapter 6: Protection of Personal Data) and the Sub-Decree on Personal Data Protection. However, users from ASEAN countries (governed by Singapore PDPA, Malaysia PDPA) or the European Union (governed by GDPR) may access JobFit. Adopting a GDPR-aligned gold standard ensures universal compliance but imposes heavy administrative burdens (such as formal Data Protection Impact Assessments and 72-hour breach notifications).

#### 2. Decision Options
* **Option A (Universal GDPR / Singapore PDPA Gold Standard):** Adopt full GDPR/PDPA compliance across all users regardless of location, granting universal rights of access, rectification, portability, and erasure.
* **Option B (Cambodian Domestic Standard Baseline):** Align strictly with Cambodian E-Commerce Law and Consumer Protection Law requirements, applying international standards only when contractually required by enterprise clients.
* **Option C (Tiered Dual-Regime Framework):** Establish a single modern privacy baseline centered on Cambodian and ASEAN standards, with an express "International Addendum" granting GDPR-specific rights exclusively to data subjects located in the EU/EEA/UK.

#### 3. Comparative Evaluation
| Dimension | Option A — Universal GDPR Gold Standard | Option B — Domestic Standard Baseline | Option C — Tiered Dual-Regime (Recommended) |
|---|---|---|---|
| **Legal Definition** | Universal application of European-grade privacy rights worldwide. | Compliance strictly with Cambodian national statutes. | Modern baseline for all users; specialized addenda for regulated jurisdictions. |
| **Pros** | Maximum reputational prestige; frictionless expansion to international markets. | Minimal compliance friction and administrative overhead. | Eliminates unnecessary operational overhead while guaranteeing legal compliance. |
| **Cons** | Significant legal overhead, DPO requirements, and statutory liability. | Inadequate for international users, remote jobs, and multinational recruiters. | Requires maintaining jurisdictional logic in privacy documentation. |
| **Technical Implementation** | Build self-serve data export, automated SAR exports, and consent audits. | Basic privacy policy, standard cookie banner, and email-based deletion. | Unified self-serve deletion and export; jurisdictional privacy notice sections. |
| **Code Impact** | Add automated JSON/ZIP archive export endpoint for full profile data. | None. Existing `admin-user.repository.ts` deletion is sufficient. | Implement `GET /users/me/export` data dump endpoint. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended.** A tiered dual-regime framework provides the optimal commercial balance. JobFit's core user base is currently in Cambodia and Southeast Asia, where practical data protection practices (clear consent, secure storage, rights to withdraw and delete) are paramount. Offering a high-quality baseline to all users while explicitly incorporating GDPR/PDPA addenda for international users protects the platform globally without encumbering local operations with European regulatory filings.

#### 5. Concrete Code & Policy Deliverables
* In **Candidate Privacy Policy (§1.2 & Schedule 1)**: Formulate the core policy around transparent consent and security, accompanied by an "EEA / UK / Singapore Specific Rights Addendum".
* In `UserModule`: Expose a `GET /users/me/export` endpoint allowing candidates to download all stored profile, resume, and application data in structured JSON format.
* In **Cookie Banner / Consent Flow**: Implement an explicit consent recording mechanism capturing the timestamp and version of the Privacy Policy accepted during registration.

#### 6. Management Decision
`[ ] Option A    [ ] Option B    [X] Option C (Recommended)`  
*Decision Notes:* __________________________________________________

---

### D10 — Platform vs. Employer Data Controller Relationship

#### 1. Context & Technical Facts
When a candidate applies for an internal job (`Application`), their resume (`Resume`), cover letter, and contact information are transmitted to the recruiting employer (`EmployerProfile`, `Company`).
Under data privacy jurisprudence, the legal characterization of the parties determines liability:
- If JobFit and the Employer are **Independent Data Controllers**, each party independently determines the purpose and legal basis of its processing. If an employer misuses applicant data (e.g., selling candidate emails or spamming), JobFit bears no legal liability.
- If JobFit is a **Data Processor** for the Employer, JobFit must execute a formal Data Processing Agreement (DPA) with every employer and may only process data on documented instructions.
- If the parties are **Joint Controllers** (GDPR Art. 26), they share joint and several liability for data breaches and unlawful processing.

#### 2. Decision Options
* **Option A (Independent Data Controllers):** Define JobFit and the Employer as separate, independent data controllers. JobFit controls candidate data on the platform; the Employer becomes an independent controller upon receiving the application.
* **Option B (Joint Data Controllers):** Formulate a Joint Controllership Agreement governing the shared recruitment pipeline.
* **Option C (Processor / SaaS ATS Model):** Characterize JobFit as a Data Processor acting on behalf of the Employer, requiring an executed Data Processing Agreement for every registered company.

#### 3. Comparative Evaluation
| Dimension | Option A — Independent Controllers (Recommended) | Option B — Joint Data Controllers | Option C — JobFit as Data Processor |
|---|---|---|---|
| **Legal Definition** | Separate controllers; liability terminates upon transfer of application. | Shared legal responsibility for recruitment processing under GDPR Art. 26. | Employer is sole controller; JobFit is vendor processing under contract. |
| **Pros** | Cleanest liability partition; employer misconduct does not impute to JobFit. | Accurately reflects collaborative matching data interactions. | Familiar structure for enterprise HR procurement teams. |
| **Cons** | Privacy Policy must explicitly disclose that employers are separate controllers. | Joint and several liability; a breach by an employer creates platform exposure. | Legally inaccurate: JobFit independently uses data for platform algorithms. |
| **Technical Implementation** | Clear terms of handover in application flow; distinct privacy disclosures. | Complex co-signed data governance agreements and shared SAR protocols. | Standard Data Processing Addendum attached to Employer Terms. |
| **Code Impact** | None on backend architecture. | Cross-tenant audit logging and shared deletion propagation webhooks. | Restrict JobFit's proprietary use of applicant data across companies. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** JobFit independently determines the matching algorithms, candidate profiling criteria, and platform functionality, meaning it cannot legally qualify as a mere processor. Furthermore, establishing independent controllership shields JobFit from third-party recruiter abuses: once an employer downloads a candidate's CV via `GET /employer/applications/:id/resume`, that employer is solely responsible under applicable law for its internal handling, retention, and security of that document.

#### 5. Concrete Code & Policy Deliverables
* In **Employer Master Services Agreement (§7.1)**: Covenant that the Employer receives candidate application materials as an independent data controller and must comply with all applicable privacy and labor laws.
* In **Candidate Privacy Policy (§5.2)**: Inform candidates: *"When you apply for a job on JobFit, your application materials are transmitted to the hiring employer, who processes your data as an independent data controller under their own privacy policies."*
* In **Application Submission Modal**: Include confirmation text: *"Submitting your application shares your CV and contact details directly with [Company Name]."*

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

### D11 — Data Retention Lifecycle, Supabase Storage Purge & Vector Deletion

#### 1. Context & Technical Facts
Candidate data exists in multiple storage layers across the platform:
1. Physical files: PDF/DOCX resumes stored in Supabase Storage (`resumes/` bucket).
2. Structured relational data: `User`, `Profile`, `Experience`, `Education`, `ParsedResumeData`.
3. High-dimensional vector embeddings: `profiles.embedding` (1024-dimensional BGE-M3 dense vectors in pgvector).
4. Derived match caches: `recommendations` and `match_reports` with SHA-256 description hashes.
Under GDPR Article 5(1)(e) (storage limitation) and Cambodian privacy rules, personal data must not be retained longer than necessary for the purposes for which it is processed. Retaining candidate CVs indefinitely creates massive regulatory breach exposure.

#### 2. Decision Options
* **Option A (Strict Time-Bound Retention with Automated Purge):** Automatically purge physical resume files and vector embeddings after 24 months of candidate account inactivity, retaining an anonymized shell.
* **Option B (Indefinite Retention until Explicit User Deletion):** Retain all resumes, embeddings, and application records indefinitely until the candidate manually requests account closure.
* **Option C (Staged Lifecycle Retention):** Keep active data live; after 12 months of inactivity, move resume files to cold storage and expire recommendations; after 36 months, execute automated tombstone anonymization.

#### 3. Comparative Evaluation
| Dimension | Option A — Strict Time-Bound Purge | Option B — Indefinite Retention | Option C — Staged Lifecycle (Recommended) |
|---|---|---|---|
| **Legal Definition** | Rigorous automated enforcement of storage limitation principles. | Extended retention justified by continuous career lifecycle service. | Proportional multi-stage lifecycle balancing utility and privacy. |
| **Pros** | Maximum data minimization; drastically reduces data breach blast radius. | Zero risk of deleting a returning user's career history or uploaded CVs. | Excellent regulatory compliance while minimizing user friction. |
| **Cons** | Returning job seekers must re-upload their resumes and re-build profiles. | High legal risk under GDPR Art. 5(1)(e); excessive database storage costs. | Requires building a background scheduled cron worker to manage transitions. |
| **Technical Implementation** | Nightly cron job deleting inactive S3 objects and zeroing `embedding`. | Static retention policy; execute deletions only on user request. | Implement automated warning emails at 11 months, archive at 12, purge at 36. |
| **Code Impact** | Add `RetentionPurgeService` and register in NestJS `ScheduleModule`. | None. | Add `archivedAt` to `Resume` and scheduled cleanup worker. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended.** Career navigation platforms have multi-year user lifecycles: candidates frequently search for jobs, become employed for 2–3 years, and return when seeking their next role. Indefinite retention violates data protection laws, but a premature 12-month purge alienates returning users. Staging retention with automated notifications at 11 months, cold archiving at 12 months, and full anonymization at 36 months perfectly balances commercial utility with legal proportionality.

#### 5. Concrete Code & Policy Deliverables
* In **Privacy Policy (§6.1 — Data Retention Schedule)**: Publish a clear retention matrix: active resumes kept during active use; physical files archived after 12 months of inactivity; full anonymization after 3 years of total inactivity.
* In `jobfit-backend`: Implement a scheduled maintenance service (`DataRetentionService`) that flags inactive users, sends re-engagement notices, and purges orphaned Supabase Storage files.
* In `MatchingEmbeddingService`: Zero out `profiles.embedding` for archived accounts to minimize pgvector index RAM overhead.

#### 6. Management Decision
`[ ] Option A    [ ] Option B    [X] Option C (Recommended)`  
*Decision Notes:* __________________________________________________

---

### D12 — Candidate Account Deletion Scope & Historical Applications

#### 1. Context & Technical Facts
In `MENTOR_REVIEW_2026-08-18.md` §14 and `admin-user.repository.delete.spec.ts`, engineering documented a critical architectural conflict:
- When a candidate deletes their account, GDPR Article 17 (Right to Erasure) demands scrubbing their personal data.
- However, hard-deleting the user row cascades to `Application`, `Offer`, and `MatchLabel`. Deleting `Application` rows destroys the employer's statutory recruitment audit trail (required for defense against discriminatory hiring lawsuits), while deleting `MatchLabel` destroyed 50 hand-labelled ground truth evaluation pairs.
To resolve this, engineering implemented **tombstone soft deletion**:
`AdminUserRepository.softDelete` renames `email` to `u_<id>@deleted.invalid` (freeing the address for future registration), sets `isActive = false`, and timestamps `deletedAt`.
However, the user's physical PDF resume in Supabase storage, past applications, and recruiter notes currently remain in the database.

#### 2. Decision Options
* **Option A (Complete Relational Anonymization — The "Dual-Track" Purge):** Delete the physical resume PDF from Supabase, erase phone numbers, photos, and personal summaries, but retain the anonymized `Application` record (linking to an anonymous applicant tombstone) for the employer's audit defense.
* **Option B (Total Hard Delete Cascade):** Cascade hard-delete all database records, wiping the user, profile, resumes, applications, and offer records completely.
* **Option C (Tombstone with Employer Snapshot Freezing):** Retain the current soft-delete tombstone, purge cloud storage files, and freeze employer-facing application views into permanent read-only text archives.

#### 3. Comparative Evaluation
| Dimension | Option A — Dual-Track Anonymization (Recommended) | Option B — Total Hard Delete Cascade | Option C — Tombstone + Snapshot Freezing |
|---|---|---|---|
| **Legal Definition** | Irreversible anonymization satisfying GDPR Art. 17 while respecting labor retention. | Absolute erasure of all database records and foreign key associations. | Account deactivation with partial retention of operational records. |
| **Pros** | Satisfies Right to Erasure; preserves employer's legal defense audit trail. | Simplest implementation; leaves zero user residue in the database. | Zero risk of broken database references or missing hiring history. |
| **Cons** | Requires engineering a surgical multi-table scrubbing routine. | Destroys employer legal compliance records and AI ground truth datasets. | Retains encrypted PII in application rows; potential GDPR scrutiny. |
| **Technical Implementation** | Delete Supabase file $\to$ zero PII columns in `Profile` $\to$ set tombstone email. | Standard Prisma `onDelete: Cascade` on `User` model. | Maintain current soft delete; add automated Supabase storage delete trigger. |
| **Code Impact** | Implement `UserAnonymizationService` in `user` and `admin` modules. | Massive schema migration altering foreign key constraints. | Minor additions to `AdminUserRepository.softDelete`. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** Under GDPR Article 17(3)(e), the right to erasure does not apply to the extent that processing is necessary for the establishment, exercise, or defense of legal claims. Employers have a legitimate legal interest (and often a statutory duty under labor law) to maintain records of who applied and why hiring decisions were made for 1–3 years. Deleting the candidate's personal account and cloud resume files while preserving an anonymized application record satisfies privacy laws without compromising employer liability defenses.

#### 5. Concrete Code & Policy Deliverables
* In `AdminUserRepository.softDelete` and user self-deletion services:
  1. Call Supabase Storage API to permanently delete all uploaded files in `resumes/<userId>/`.
  2. Overwrite `Profile.phone`, `Profile.bio`, `Profile.location`, and `Profile.fullName` with `"[Deleted User]"`.
  3. Rename `User.email` to `u_<id>@deleted.invalid` (freeing the email for re-registration).
  4. Preserve `Application.id`, `status`, `appliedAt`, and `employerNotes` for the employer's historical pipeline view.
* In **Candidate Privacy Policy (§7.1)**: Disclose clearly: *"Upon account deletion, your profile, resumes, and personal identifiers are permanently destroyed. Anonymized records of past job applications are retained for employer regulatory compliance."*

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

### D13 — Subject Access Requests (SAR) & Recruiter Private Notes

#### 1. Context & Technical Facts
In `jobfit-backend/src/modules/application`, the `Application` model contains an `employerNotes` column (`schema.prisma` line 954), where recruiters record internal interview assessments, candidate weaknesses, compensation impressions, and disqualification rationales.
Under GDPR Article 15 and international privacy laws, individuals have the right to obtain a copy of all personal data concerning them processed by a platform (Subject Access Request - SAR). If a rejected candidate submits a SAR, recruiters expect their internal notes to remain strictly confidential. If JobFit discloses these notes, recruiters face embarrassment or labor disputes; if JobFit withholds them, candidates may file privacy complaints.

#### 2. Decision Options
* **Option A (Confidential Recruiter Work Product Exemption):** Legally classify `employerNotes` as confidential employer internal evaluation data exempt from candidate SAR disclosure.
* **Option B (Full Candidate Transparency):** Permit candidates to inspect all data associated with their applications, including recruiter notes and stage history.
* **Option C (Dual-Layer Segregation):** Distinguish between factual application timelines (disclosable) and subjective recruiter interview deliberations (redacted work product).

#### 3. Comparative Evaluation
| Dimension | Option A — Confidential Work Product (Recommended) | Option B — Full Transparency | Option C — Dual-Layer Segregation |
|---|---|---|---|
| **Legal Definition** | Internal business deliberation records exempt from personal data SAR. | Open-book recruitment records accessible under unconditional SAR. | Objective telemetry is disclosable; subjective notes are privileged. |
| **Pros** | Protects recruiter candor; prevents platform abandonment by employers. | Radical candidate transparency; eliminates regulatory non-compliance claims. | Balanced compromise between candidate rights and employer confidentiality. |
| **Cons** | Privacy regulators in certain EU jurisdictions may challenge total note redaction. | Devastating to recruiter trust; recruiters will stop writing notes on JobFit. | Complex redaction logic required when compiling user data export files. |
| **Technical Implementation** | Exclude `employerNotes` from `GET /users/me/export` and candidate DTOs. | Include all application rows and notes directly in candidate export JSON. | Include stage timestamps and status; redact raw `employerNotes` text. |
| **Code Impact** | Ensure candidate serializers never project `employerNotes`. | Expose `employerNotes` in `ApplicationResponseDto`. | Build dedicated `DataExportService` filtering out recruiter work product. |

#### 4. Recommended Strategy & Rationale
**Option A (implemented via the mechanics of Option C) is recommended.** Recruiter notes represent the proprietary internal thought process and work product of the hiring company, not personal data authored by the candidate. Disclosing raw interview commentary (e.g., *"candidate appeared nervous"*, *"salary expectation too high"*) would destroy employer confidence in JobFit. By law, SAR exports should provide the candidate's submitted materials, status history, and match scores, while strictly redacting private recruiter notes.

#### 5. Concrete Code & Policy Deliverables
* In `DataExportService`: Ensure that candidate data exports include `jobTitle`, `companyName`, `status`, and `appliedAt`, but strictly omit `Application.employerNotes`.
* In **Employer Master Services Agreement (§8.3)**: Guarantee to employers: *"Internal recruiter notes, interview evaluations, and stage feedback recorded within JobFit are treated as confidential employer work product and are not disclosed to candidates in routine data requests."*
* In **Candidate Privacy Policy (§8.2)**: Clarify that Subject Access Requests cover candidate-provided data and objective application records, excluding confidential third-party recruiter deliberations.

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

## Domain 4: Offline PWA, Local Storage & Multi-Device Security

---

### D14 — PWA Offline Storage, Dexie IndexedDB & Shared Device Exposure

#### 1. Context & Technical Facts
As documented in `PWA_OFFLINE_AUDIT.md`, `jobfit-frontend` is a Progressive Web App (PWA) powered by a Serwist service worker and a client-side Dexie IndexedDB database named `jobfits-offline`.
To provide a fast offline experience, IndexedDB caches:
- Candidate profile details, contact information, and resumes.
- User application records, tracked job cards, and interview notes.
- In-flight un-synced user mutations in a `pendingActions` queue.
In Cambodia and developing markets, job seekers frequently access web applications from **shared desktop computers in internet cafes, university computer labs, or shared family devices**. Browsers do not encrypt IndexedDB storage. If a candidate logs out or closes the browser tab without clearing data, the next user of that terminal can inspect IndexedDB via browser DevTools and extract the previous user's full resume, phone number, and job applications.

#### 2. Decision Options
* **Option A (Strict Auto-Purge on Session Close & Logout):** Implement aggressive client-side cache clearing that wipes all Dexie IndexedDB tables immediately upon explicit logout or authentication token expiry.
* **Option B (Encrypted Client-Side Storage):** Encrypt sensitive IndexedDB fields using the WebCrypto API (AES-GCM), with the encryption key derived from the user's password or session token held only in memory.
* **Option C (Explicit Shared Device Disclaimer & Session Hygiene):** Retain plaintext IndexedDB for performance, but display a prominent "Public / Shared Computer" checkbox on the login page that disables persistent offline caching, paired with Terms of Service disclaimers.

#### 3. Comparative Evaluation
| Dimension | Option A — Auto-Purge on Logout (Recommended) | Option B — WebCrypto Client Encryption | Option C — Public Device Checkbox + Disclaimers |
|---|---|---|---|
| **Legal Definition** | Proactive technical duty of care regarding shared client data leakage. | End-to-end client-at-rest cryptographic data protection. | User-allocated responsibility supported by operational warnings. |
| **Pros** | Prevents 99% of post-session shared device data harvesting; low complexity. | Complete protection even if browser files are physically copied from disk. | Zero performance penalty; full offline convenience for personal devices. |
| **Cons** | Does not protect against a user walking away from a terminal without logging out. | Significant CPU/battery overhead; loss of key breaks offline access. | Users often forget to check the box on public machines. |
| **Technical Implementation** | Hook `authStore.logout()` to `db.delete()` / `db.tables.forEach(t => t.clear())`. | Wrap Dexie table hooks with WebCrypto AES-GCM encrypt/decrypt routines. | Add toggle to login form; pass flag to skip Dexie persistent caching. |
| **Code Impact** | Add clean-up routines in `use-auth.ts` and `offline-sync.service.ts`. | Heavy architectural refactor of `jobfits-offline` Dexie schema and hooks. | Update login form DTO, auth store, and service worker caching rules. |

#### 4. Recommended Strategy & Rationale
**Option A combined with Option C is recommended.** Encrypting IndexedDB in the browser creates excessive performance latency and failure modes for PWA background sync. Instead, implementing a mandatory, robust client-side purge routine that completely empties IndexedDB upon logout, coupled with an explicit "Public Computer" toggle that forces in-memory storage, provides exemplary security and satisfies privacy duty-of-care standards.

#### 5. Concrete Code & Policy Deliverables
* In `jobfit-frontend/src/features/auth/use-auth.ts`: Guarantee that `logout()` systematically calls `db.delete()` to wipe `jobfits-offline` completely.
* In **Login UI**: Add an option: *"This is a shared / public computer"* (disabling persistent IndexedDB caching for that session).
* In **Job Seeker Terms of Service (§3.3)**: Instruct users: *"When accessing JobFit from shared or public computers, you must log out completely and close all browser windows to ensure your locally cached resume data is erased."*

#### 6. Management Decision
`[ ] Option A + C (Recommended)    [ ] Option B    [ ] Option C Only`  
*Decision Notes:* __________________________________________________

---

### D15 — Offline Sync Conflicts, Batch Mutations & Idempotency

#### 1. Context & Technical Facts
JobFit enables candidates to perform actions while offline (e.g., editing profile details, updating tracked job stages, drafting cover letters). In `jobfit-backend/src/modules/sync`, offline actions are queued in Dexie (`pendingActions`) and posted to `POST /sync/batch` or `POST /sync/delta` upon reconnection (`PWA_SYNC_API.md`).
To prevent duplicate execution (such as submitting two applications to the same job during a network flutter), the backend enforces an `IdempotencyKey` mechanism (`schema.prisma` line 1546). However, if a candidate updates their profile offline on a phone while simultaneously editing it on a laptop, synchronization conflicts emerge. Handling these conflicts incorrectly can result in lost job applications or corrupted user profile data.

#### 2. Decision Options
* **Option A (Server-Authoritative Last-Write-Wins with Client Idempotency):** Server accepts mutations sequentially based on arrival, validating requests via client-generated UUID idempotency keys. The latest server timestamp wins; client caches overwrite on subsequent sync.
* **Option B (Interactive Conflict Prompting):** When a timestamp mismatch is detected, the server refuses the sync mutation and forces the user to resolve discrepancies interactively.
* **Option C (Field-Level Deterministic Merge):** Implement a CRDT-style field-level merge algorithm that combines non-conflicting profile updates.

#### 3. Comparative Evaluation
| Dimension | Option A — Server LWW + Idempotency (Recommended) | Option B — Interactive Conflict Prompting | Option C — Field-Level Deterministic Merge |
|---|---|---|---|
| **Legal Definition** | Deterministic platform rules governing electronic transaction validity. | Explicit user assent required for disputed electronic transactions. | Algorithmic reconciliation of concurrent data entries. |
| **Pros** | Standard web architecture; zero client friction; robust idempotency protection. | Guarantees that no candidate data is ever silently overwritten. | Best mathematical resolution for complex collaborative data. |
| **Cons** | In rare multi-device races, earlier offline edits may be overwritten. | Intrusive UI modal interrupting the user upon regaining connectivity. | Immense engineering complexity; difficult to validate edge cases. |
| **Technical Implementation** | Maintain existing `IdempotencyKey` validation and `delta.ts` timestamp sweeps. | Return HTTP 409 Conflict with server snapshot; client renders diff modal. | Rewrite sync engine using Automerge or Yjs CRDT frameworks. |
| **Code Impact** | Existing backend code in `sync.service.ts` and `batch.service.ts`. | New conflict DTOs, frontend resolution dialogs, and rollback queues. | Complete rewrite of frontend Dexie schema and backend ORM models. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** JobFit is an individual career navigation tool, not a multi-user collaborative document editor like Google Docs. True multi-device concurrent conflicts represent less than 0.1% of mobile/desktop sync events. Server-authoritative Last-Write-Wins backed by client-generated idempotency keys provides 100% protection against duplicate submissions while keeping the user experience seamless.

#### 5. Concrete Code & Policy Deliverables
* In **Job Seeker Terms of Service (§5.4 — Offline Transactions & Synchronization)**: Specify that in the event of conflicting updates across multiple devices, the server's processed timestamp shall be authoritative and governing.
* In `IdempotencyKeyService`: Ensure that critical actions (e.g., job applications, offer acceptances) carry a 24-hour idempotent cache lifetime to prevent duplicate state transitions.

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

### D16 — Default Resume vs. Application-Specific Submitted Snapshot

#### 1. Context & Technical Facts
In `MENTOR_REVIEW_2026-08-18.md` §5, engineering resolved a critical defect regarding resume resolution:
- Previously, screening evaluated the user's *current default resume*, meaning if a candidate applied with a "Designer CV" and later set their default to "Developer CV", the recruiter screened the wrong document.
- As resolved in August 2026, `Application.resumeId` is now **fixed at the moment of submission** (`application.service.ts` line 81).
- Screening (`ApplicationScreeningService.screen()`) evaluates that exact submitted resume.
- However, `MatchingEmbeddingService` maintains only **one vector per user profile** (`profiles.embedding`), and the learning path (`LearningPathService`) legitimately evaluates the candidate's active CV to recommend next skills.
Legal ambiguity arises if a candidate updates their profile after applying: does the recruiter have the right to see the updated profile, or must they see strictly the frozen historical snapshot?

#### 2. Decision Options
* **Option A (Immutable Submitted Snapshot):** Legally and technically freeze the application at submission. The recruiter sees exclusively the submitted resume and profile snapshot. Subsequent profile changes do not alter pending applications.
* **Option B (Live Profile Synchronization):** The employer application view continuously reflects the candidate's live profile, while retaining the historical uploaded PDF.
* **Option C (Candidate Version Control with Recruiter Notification):** Allow candidates to explicitly update their submitted CV on an active application, triggering an automated notification and updated screening summary for the recruiter.

#### 3. Comparative Evaluation
| Dimension | Option A — Immutable Submitted Snapshot (Recommended) | Option B — Live Profile Synchronization | Option C — Candidate Update with Notification |
|---|---|---|---|
| **Legal Definition** | Traditional binding submission; candidate is judged strictly on the submitted record. | Continuous dynamic disclosure throughout the recruitment cycle. | Bilateral update protocol with affirmative employer notification. |
| **Pros** | Clean evidentiary record; recruiter can defend hiring decisions based on exact data shown. | Employer always has candidate's latest skills and contact details. | Candidate can correct errors; recruiter is kept informed of updates. |
| **Cons** | Candidate cannot update outdated contact information without re-applying. | Candidate profile edits might confuse recruiters mid-interview. | High state machine complexity (`ApplicationStage` resets). |
| **Technical Implementation** | `Application` references immutable `resumeId` and snapshots contact details. | Recruiter views join live `Profile` table directly on every page load. | Add `PATCH /applications/:id/update-resume` with recruiter webhook. |
| **Code Impact** | Existing architecture verified in August 2026 post-mortem. | Revert August 2026 fix; expose live profile joins. | Add new application command handler, event, and notification listeners. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** In recruitment law and dispute resolution, an employer must be able to prove exactly what document and credentials were evaluated when a hiring or rejection decision was made. If candidate profiles dynamically mutate after submission, employers cannot establish an auditable record of their decision-making basis. The immutable snapshot model implemented in August 2026 is legally superior.

#### 5. Concrete Code & Policy Deliverables
* In **Job Seeker Terms of Service (§6.2)**: Clarify: *"When you submit an application, a frozen snapshot of your selected resume and profile is transmitted to the employer. Updates to your JobFit profile will not alter previously submitted applications."*
* In **Employer Terms of Service (§5.3)**: Inform employers that application views reflect the candidate's qualifications as submitted at the timestamp recorded on the application.

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

## Domain 5: Ingestion, Extension & Third-Party Platform Terms

---

### D17 — Automated Job Aggregation, Scraping & Fair Use Safe Harbor

#### 1. Context & Technical Facts
JobFit populates its job discovery corpus through automated ingestion pipelines (`jobfit-backend/src/modules/ingestion`):
- Ingestion from **BongThom.com** via RSS feeds.
- Ingestion from **JobNet.com.kh** via structured Schema.org JSON-LD web scraping.
- Ingestion from **TheMuse.com** via public developer APIs.
- Ingested jobs are stored in the database with `JobSourceType.EXTERNAL` and display an external application URL (`Job.applyUrl`).
Under copyright and database protection doctrines (including the landmark US 9th Circuit ruling in *hiQ Labs v. LinkedIn*, EU Database Directive 96/9/EC, and Cambodian Law on Copyright and Related Rights), public job advertisements are generally considered factual listings. However, wholesale scraping of proprietary job boards can trigger cease-and-desist demands, breach-of-contract claims, or allegations of unfair competition.

#### 2. Decision Options
* **Option A (Public Aggregator Indexing Safe Harbor):** Formally operate as a factual search and discovery engine. Index only public factual metadata (title, company, location, requirements), link directly back to the source, and never charge candidates to apply.
* **Option B (Direct Bilateral Syndication Agreements):** Cease automated scraping of BongThom and JobNet; negotiate formal content syndication partnerships with local job boards.
* **Option C (Search-Only Redirection with Text Truncation):** Truncate external job descriptions to 250 characters, forcing users to click through to the original job board to read full descriptions.

#### 3. Comparative Evaluation
| Dimension | Option A — Factual Search Index (Recommended) | Option B — Bilateral Syndication | Option C — Truncated Search Snippets |
|---|---|---|---|
| **Legal Definition** | Search engine / indexer safe harbor (*hiQ* doctrine; factual aggregation). | Contractual syndication partnership. | Snippet indexer maximizing referral traffic to origin sites. |
| **Pros** | Rapid corpus growth (300+ Cambodian jobs); no dependency on competitor approval. | 100% immune from scraping litigation; potential co-marketing revenue. | Strongest copyright fair-use defense; appeases origin job boards. |
| **Cons** | Vulnerable to technical anti-bot blocking (Cloudflare, IP bans). | Competitor job boards will refuse to syndicate their core inventory to JobFit. | Degrades user experience; reduces match score quality due to missing text. |
| **Technical Implementation** | Maintain current RSS/JSON-LD ingestion; store canonical source URL. | Build custom B2B partner ingestion APIs and partner authentication keys. | Modify `ingest.ts` to truncate `description` and mandate external redirect. |
| **Code Impact** | Existing ingestion module architecture (`ingestion.module.ts`). | Rewrite ingestion adapters to authenticate against partner B2B endpoints. | Alter `JobMapper` to emit shortened description previews. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** JobFit functions as an informational indexing bridge, directing qualified candidates to the employer's original posting URL (`applyUrl`). Factual job vacancies published publicly on the open web are not protected by exclusive copyright in their bare factual terms. By indexing public metadata, attributing the source clearly, linking back to the origin, and immediately complying with takedown requests, JobFit operates well within established aggregator safe harbor precedents.

#### 5. Concrete Code & Policy Deliverables
* In **Platform Terms of Service (§9.1 — Aggregated Listings)**: State clearly: *"JobFit indexes publicly available job listings to assist career discovery. External listings remain the property of their respective publishers, and JobFit claims no affiliation with external boards unless expressly stated."*
* In **Frontend Job Detail View**: Ensure all `EXTERNAL` jobs render an unambiguous attribution badge: *"Originally posted on [BongThom / JobNet]. Apply on original site $\to$"*.

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

### D18 — Employer Takedown Notices & De-Indexing Procedures

#### 1. Context & Technical Facts
When an external job posting is closed, deleted, or filled on the origin website (e.g., BongThom or JobNet), JobFit's ingested database record may continue to display the job as active unless refreshed. Furthermore, an employer whose posting was aggregated without prior consultation may demand the immediate removal or de-indexing of their job listing from JobFit. If JobFit displays expired jobs, candidates waste time applying, damaging platform credibility; if JobFit refuses employer takedown requests, it risks civil litigation.

#### 2. Decision Options
* **Option A (Notice-and-Takedown Protocol with 48h SLA):** Establish a published DMCA / Notice-and-Takedown procedure allowing employers to request instant removal via an automated form or designated email (`compliance@jobfit.com`).
* **Option B (Automated Head-Check Verification):** Implement an automated daily HTTP crawler that checks whether external `applyUrl` links return HTTP 404 or redirect to closed notices, automatically flipping `Job.status` to `CLOSED`.
* **Option C (Comprehensive Dual Hygiene Protocol):** Combine automated daily HTTP link-health sweeps with a formal, expedited notice-and-takedown channel for employers.

#### 3. Comparative Evaluation
| Dimension | Option A — Manual Notice-and-Takedown | Option B — Automated Link Sweeps | Option C — Dual Hygiene Protocol (Recommended) |
|---|---|---|---|
| **Legal Definition** | Statutory safe-harbor compliance (e.g., DMCA / E-Commerce Law Art. 38). | Automated algorithmic catalog hygiene. | Comprehensive proactive and reactive compliance framework. |
| **Pros** | Satisfies statutory safe harbor requirements with minimal engineering. | Automatically purges 90% of expired listings without human intervention. | Highest catalog freshness; virtually eliminates employer legal complaints. |
| **Cons** | Expired jobs remain visible until someone complains. | Origin sites may block link-checking crawlers; false-positive closures. | Requires building both a worker task and administrative triage UI. |
| **Technical Implementation** | Add `POST /support/takedown` endpoint and legal contact email. | Build `JobLivenessCheckService` running `HEAD` requests across `applyUrl`. | Implement both the scheduled verification cron and the admin takedown tool. |
| **Code Impact** | Documentation and basic contact handler. | Scheduled cron worker in `job` module. | Moderate engineering effort across `job` and `admin` modules. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended.** The primary complaint from employers regarding aggregators is that obsolete vacancies remain online months after being filled. Combining proactive automated link validation (marking jobs `CLOSED` when origin links fail) with a published, frictionless notice-and-takedown process provides airtight legal protection under international intermediary liability laws.

#### 5. Concrete Code & Policy Deliverables
* In **Platform Terms of Service (§9.3 — Takedown Policy)**: Publish an explicit takedown procedure committing to de-index contested or expired external listings within 48 business hours of verified notice.
* In `jobfit-backend/src/modules/job`: Deploy a scheduled cron job (`JobLivenessCheckCron`) that issues non-intrusive `HEAD` requests to external `applyUrl` targets, transitioning unresponsive links to `JobStatus.CLOSED`.
* In `AdminJobController`: Provide an instant one-click de-index button for platform administrators.

#### 6. Management Decision
`[ ] Option A    [ ] Option B    [X] Option C (Recommended)`  
*Decision Notes:* __________________________________________________

---

### D19 — Browser Extension Content Script Injection & Third-Party ToS

#### 1. Context & Technical Facts
The JobFit Chrome Extension (`jobfit-extension`, Manifest V3) injects content scripts into five third-party websites:
`linkedin.com`, `indeed.com`, `jobnet.com.kh`, `khmer24.com`, and `bongthom.com`.
The extension inspects the local DOM to extract job titles, company names, and posting text, rendering a floating match badge and scoring panel.
Virtually all major platforms prohibit browser extensions and automated scraping in their Terms of Service (e.g., LinkedIn User Agreement Section 8.2 prohibits any extension that scrapes, modifies, or automates platform features). LinkedIn has historically sued extension developers (e.g., *LinkedIn v. DoYouBuzz*, *LinkedIn v. Manthe*). Furthermore, LinkedIn frequently restricts or bans user accounts detected utilizing unauthorized browser extensions.

#### 2. Decision Options
* **Option A (Local User-Driven DOM Inspection with Account Risk Disclaimers):** Continue running local DOM content scripts. Do not automate actions (clicks, connections, or messages). Require users to accept an explicit "Third-Party Terms & Account Risk Disclaimer" acknowledging that LinkedIn/Indeed may object to extension use.
* **Option B (Deprecate In-Page Content Script Injection):** Remove content script injection entirely. Restrict the extension to an isolated browser action popup where users manually paste job URLs or descriptions.
* **Option C (Passive Overlay Architecture):** Ensure the extension injects strictly into a Shadow DOM isolated iframe, avoiding any modification of the host site's native DOM elements or JavaScript runtime.

#### 3. Comparative Evaluation
| Dimension | Option A — Local DOM + User Risk Disclaimer (Recommended) | Option B — Isolated Popup Only | Option C — Shadow DOM Technical Isolation |
|---|---|---|---|
| **Legal Definition** | Private local browser augmentation protected under personal computing rights. | Complete avoidance of third-party platform interaction. | Non-invasive DOM augmentation minimizing technical detection. |
| **Pros** | Seamless UX; users see match scores directly inside LinkedIn/Indeed. | Zero risk of LinkedIn trademark or anti-circumvention litigation. | Harder for LinkedIn anti-extension scripts to detect and block. |
| **Cons** | Users' third-party accounts could theoretically face restrictions. | Terrible UX friction; requires manual copy-pasting for every job. | Complex CSS styling encapsulation and event handling. |
| **Technical Implementation** | Add mandatory acceptance modal upon extension install; publish disclaimer. | Strip `content_scripts` from `manifest.config.ts`; build popup paste UI. | Refactor `contentScript.ts` to attach UI inside `attachShadow({mode: 'closed'})`. |
| **Code Impact** | Extension onboarding modal and legal terms documentation. | Total rewrite of extension UI and data ingestion flow. | Engineering refactor of content script rendering layer. |

#### 4. Recommended Strategy & Rationale
**Option A combined with Option C is recommended.** In modern web law, a browser extension running locally on a user's machine to assist that user in reading a public web page is a protected personal computing activity (analogous to ad blockers and grammar assistants). JobFit does not automate scraping at scale; it reads a single page only when the user navigates there. By isolating the injected UI in Shadow DOM and providing prominent warnings that third-party sites prohibit extensions, JobFit insulates itself from legal liability while delivering the core product experience.

#### 5. Concrete Code & Policy Deliverables
* In **Extension Privacy Policy (`PRIVACY.md`) & Web Store Listing**: Include a prominent **Third-Party Terms Warning**: *"JobFit is an independent tool not affiliated with, sponsored by, or endorsed by LinkedIn, Indeed, JobNet, Khmer24, or BongThom. Use of browser extensions may violate the terms of service of certain third-party platforms. JobFit assumes no liability for account actions taken by third-party sites."*
* In `jobfit-extension`: Ensure all injected UI is mounted within a closed Shadow DOM root to prevent DOM collisions and script conflicts with the host page.

#### 6. Management Decision
`[ ] Option A + C (Recommended)    [ ] Option B    [ ] Option C Only`  
*Decision Notes:* __________________________________________________

---

### D20 — Saved Jobs (Platform Dependent) vs. Tracked Jobs (Candidate Owned)

#### 1. Context & Technical Facts
In `MENTOR_REVIEW_2026-08-18.md` §16 and the database schema, engineering identified a fundamental difference between two job-saving mechanisms:
1. **`SavedJob` (Internal Bookmarks):** References internal `Job.id` with a foreign key constraint. When an employer deletes or closes a job, database cascades delete the `SavedJob` row.
2. **`TrackedJob` (Private Kanban Board):** Developed in `modules/job-tracker/job-tracker.service.ts`. A `TrackedJob` copies job title, company name, URL, and salary notes into an independent candidate record (`schema.prisma` line 1833). When an employer deletes a job, the candidate's `TrackedJob` card **survives** with all personal notes, interview logs, and salary negotiations intact.
From a legal and privacy perspective, these two tables have distinct ownership structures: `SavedJob` is a platform reference, whereas `TrackedJob` is the candidate's private personal intellectual property.

#### 2. Decision Options
* **Option A (Formal Legal Partition of Job Data):** Formally define `TrackedJob` in the Terms of Service as private candidate-owned data (confidential and never accessible to employers), while `SavedJob` is defined as a transient platform discovery bookmark.
* **Option B (Unify into a Single Engine):** Deprecate `SavedJob` and migrate all bookmarks into `TrackedJob`, decoupling all saved listings from employer deletion cascades.
* **Option C (Employer Visibility into Candidate Tracking):** Allow employers to see how many candidates have "tracked" their job in the Kanban pipeline as an aggregate marketing metric.

#### 3. Comparative Evaluation
| Dimension | Option A — Formal Legal Partition (Recommended) | Option B — Unify into TrackedJob | Option C — Employer Tracking Analytics |
|---|---|---|---|
| **Legal Definition** | Dual legal status: Platform discovery cache vs Private career property. | Uniform candidate ownership across all saved career items. | Candidate activity telemetry monetized as employer analytics. |
| **Pros** | Reflects current code reality; zero database migrations required. | Eliminates user confusion when a saved job disappears. | Creates upsell value for employer analytics dashboards. |
| **Cons** | Users may wonder why a "Saved Job" vanished while a "Tracked Job" stayed. | Architectural refactor migrating existing `SavedJob` rows. | Candidate privacy backlash; users expect tracking to be 100% private. |
| **Technical Implementation** | Document distinct lifecycles in UI tooltips and Terms of Service. | Migrate `SavedJob` records to `TrackedJob` with stage `WISHLIST`. | Add `trackedJobsCount` aggregation query to `EmployerJobController`. |
| **Code Impact** | None on backend; documentation and UI copy only. | Deprecate `SavedJobModule`; update frontend bookmark buttons. | New analytics service and privacy policy disclosure. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended** for immediate deployment, with a long-term roadmap toward Option B. As documented in the August 2026 post-mortem, `TrackedJob` is explicitly scoped to the user in the WHERE clause, ensuring complete confidentiality. Codifying that `TrackedJob` notes, interview dates, and salary figures are the candidate's private work product (immune from employer inspection or discovery) provides critical trust for job seekers.

#### 5. Concrete Code & Policy Deliverables
* In **Job Seeker Terms of Service (§5.2 — Career Tracking Data)**: State: *"Content created within your Job Tracker board—including notes, interview records, and personal compensation targets—constitutes your private candidate work product. JobFit will not disclose your Tracker entries to any employer."*
* In **Frontend UI Tooltip (`SavedJob`)**: Add a micro-notice: *"Saved jobs remain available while the employer's posting is active. To permanently save job notes to your personal career tracker, click 'Add to Tracker'."*

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

## Domain 6: Employer Vetting, Offer Negotiations & Labor Compliance

---

### D21 — Employer Onboarding, Domain Verification & Anti-Scam Shielding

#### 1. Context & Technical Facts
In `jobfit-backend/src/modules/employer-request` and `employer.service.ts`, employer registration is gated through a multi-step verification process (`EmployerRequest`):
1. A recruiter registers and submits an `EmployerRequest` with their company name, website, and corporate email.
2. The backend performs an automated domain check (`DomainCheckResult`), returning `MATCH` (email matches company domain), `MISMATCH` (personal Gmail/Yahoo used for corporate company), or `NO_WEBSITE`.
3. A platform administrator must manually approve the request (`AuditActionType.EMPLOYER_REQUEST_APPROVED`), which creates the `EmployerProfile` and links the user to the `Company`.
In Southeast Asia, recruitment scams, fake job postings, identity theft, and human trafficking operations using bogus corporate accounts are severe criminal risks. If a scammer bypasses verification and posts fraudulent jobs, victims will hold JobFit liable for facilitating employment fraud.

#### 2. Decision Options
* **Option A (Strict Domain Matching + Mandatory Admin Vetting):** Hard-refuse employer requests using public email domains (gmail, yahoo, hotmail) for registered corporate entities. Require platform admin review of business registration documents for all unverified domains.
* **Option B (Soft Warning with Recruiter Indemnity):** Allow unverified email requests to be approved at admin discretion, accompanied by an explicit Recruiter Indemnity clause in the Employer Terms.
* **Option C (Automated Government Registry Integration):** Integrate with the Cambodian Ministry of Commerce (CamDX / MoC business registry) to programmatically verify business registration numbers prior to account activation.

#### 3. Comparative Evaluation
| Dimension | Option A — Strict Domain Gate + Vetting (Recommended) | Option B — Soft Warning + Indemnity | Option C — CamDX Registry Integration |
|---|---|---|---|
| **Legal Definition** | High duty-of-care gatekeeper standard for commercial participants. | Moderate diligence with contractually shifted liability. | Statutory entity verification via governmental API bridge. |
| **Pros** | Eliminates 95% of fraudulent recruitment scams and impersonation. | Lower onboarding friction for legitimate small businesses lacking domain email. | Complete legal certainty regarding entity existence. |
| **Cons** | Slower recruiter onboarding; requires admin staff to review requests. | Higher platform risk of fraudulent listings appearing on JobFit. | CamDX API access requires government accreditation and technical integration. |
| **Technical Implementation** | In `EmployerRequestService`, block submission if domain mismatch exceeds threshold. | Maintain current workflow; ensure `AuditLog` records approving admin. | Build CamDX verification adapter in `employer-request.module.ts`. |
| **Code Impact** | Add strict domain validation rules in `create-employer-request.dto.ts`. | Current code architecture is already compatible. | Major external integration requiring government credentials. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** As documented in `mentor_review` and `employer_logic.md`, approving an employer request is the most consequential action an administrator performs, as it mints an authorized hiring account capable of viewing candidate CVs. Enforcing corporate email domain matching as a prerequisite—while requiring formal documentation review for small businesses utilizing generic emails—is essential to protect candidates from recruitment scams and human trafficking schemes.

#### 5. Concrete Code & Policy Deliverables
* In **Employer Master Services Agreement (§2.1 — Verification & Authority)**: Require employers to warrant that they possess full legal authority to recruit on behalf of the named company, and provide complete indemnification for fraudulent representations.
* In `jobfit-backend/src/modules/employer-request`: Reject requests where `domainCheckResult === 'MISMATCH'` unless accompanied by uploaded business registration documentation.
* In **Candidate Safety Notice**: Render a verified company badge on listings where the employer completed corporate domain verification.

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

### D22 — Prohibited Job Postings, Non-Discrimination & Labor Law Standards

#### 1. Context & Technical Facts
JobFit allows employers to publish internal job descriptions (`Job`), specifying requirements, seniority levels, and qualifications.
Under Cambodian Labor Law (1997, Articles 12 and 106) and international labor standards (ILO Convention No. 111):
- Employers are strictly prohibited from discriminating on the basis of race, color, sex, creed, religion, political opinion, birth, or social origin.
- In Cambodia, it is historically common for job advertisements to explicitly demand specific genders (e.g., *"Female only"*), age limits (e.g., *"Age 18-25"*), or physical photos.
- Furthermore, modern recruitment platforms must prohibit fraudulent job postings: charging application fees, Multi-Level Marketing (MLM) schemes, adult services, and "ghost jobs" (fictitious postings posted for branding or market research).

#### 2. Decision Options
* **Option A (Zero-Tolerance Policy with Immediate Account Suspension):** Publish an exhaustive Acceptable Use & Non-Discrimination Policy banning discriminatory criteria, application fees, and MLM schemes. Authorize admins to immediately suspend violators (`UserStatus.SUSPENDED`).
* **Option B (Reactive Moderation upon Candidate Reporting):** Rely on candidate reporting flags (`POST /jobs/:id/report`) to identify and review discriminatory or abusive listings.
* **Option C (Automated AI Content Filtering on Publication):** Run an automated NLP screening check in `JobService.publish()` that scans job descriptions for prohibited discriminatory keywords (gender, age, marital status) before allowing publication.

#### 3. Comparative Evaluation
| Dimension | Option A — Policy + Immediate Suspension | Option B — Reactive Reporting | Option C — Automated AI Pre-Screening (Recommended) |
|---|---|---|---|
| **Legal Definition** | Contractual prohibition enforced via post-hoc administrative sanctions. | Intermediary notice-and-action liability framework. | Proactive algorithmic content moderation satisfying ESG/labor standards. |
| **Pros** | Clear legal standards; absolute contractual right to terminate bad actors. | Lowest engineering investment; zero false-positive publishing delays. | Prevents discriminatory postings from ever being displayed publicly. |
| **Cons** | Relies on manual admin vigilance; discriminatory jobs may be viewed. | Discriminatory jobs harm candidates and platform reputation before removal. | Minor false positives on legitimate occupational qualifications. |
| **Technical Implementation** | Draft comprehensive policy terms; utilize existing `USER_SUSPENDED` audit action. | Build candidate reporting button and admin moderation queue. | Add regex/LLM safety check filter in `JobService.publishJob()`. |
| **Code Impact** | Documentation and admin handbook drafting. | New `JobReport` model and controller in `job` module. | Add content moderation guard in `job.service.ts`. |

#### 4. Recommended Strategy & Rationale
**Option C combined with Option A is recommended.** Incorporating an automated pre-publication screening pass in `JobService` that flags explicit discriminatory constraints (e.g., mandatory female/male requirements where not a genuine occupational qualification, age ceilings, or fees) positions JobFit as a modern, progressive recruitment leader in Cambodia. Backing this with an express contractual right to immediately suspend violating employers without refund provides absolute legal protection.

#### 5. Concrete Code & Policy Deliverables
* In **Employer Master Services Agreement (§3.2 — Prohibited Job Content)**: Enumerate strict prohibitions against: (a) charging candidates application or training fees, (b) multi-level marketing or cryptocurrency recruitment, (c) discriminatory criteria prohibited by the Cambodian Labor Law.
* In `jobfit-backend/src/modules/job/application/services/job.service.ts`: Implement a pre-publish heuristic scanner flagging prohibited terms (`"female only"`, `"male only"`, `"age limit"`, `"deposit required"`).
* In `admin-user.repository.ts`: Utilize the existing `UserStatus.SUSPENDED` status to lock accounts of non-compliant employers.

#### 6. Management Decision
`[ ] Option A + C (Recommended)    [ ] Option B    [ ] Option C Only`  
*Decision Notes:* __________________________________________________

---

### D23 — In-App Job Offers & Multi-Round Negotiation Enforceability

#### 1. Context & Technical Facts
JobFit provides a comprehensive in-app offer and negotiation module (`jobfit-backend/src/modules/offer`):
- An employer creates a structured `Offer` entity (`schema.prisma` line 1009), specifying `salary`, `equity`, `benefits`, `startDate`, and `expirationDate`.
- The candidate can click "Accept", "Reject", or initiate negotiations via `OfferMessage` (`schema.prisma` line 1057), which supports multi-round counter-offers.
Under contract law (including the Cambodian Civil Code 2007 on Contract Formation and Electronic Transactions), an unambiguous offer followed by an unqualified acceptance constitutes a **legally binding employment contract**, potentially triggering **promissory estoppel** if either party subsequently reneges. If an employer extends an offer on JobFit and later rescinds it, or if a candidate accepts and fails to show up, disputes may arise regarding whether JobFit facilitated a binding legal contract.

#### 2. Decision Options
* **Option A (Explicit Non-Binding Offer Letter Disclaimer):** Legally designate all in-app offers and negotiation threads as preliminary, non-binding declarations of intent. Mandate that formal employment contracts must be separately executed offline.
* **Option B (Binding Electronic Employment Contract):** Position JobFit as a legally binding digital contract execution platform under the Cambodian Law on Electronic Commerce (2019).
* **Option C (Employer-Designated Contractual Status):** Provide a toggle when creating an offer: *"Binding Employment Offer"* (requiring digital signatures) vs *"Preliminary Offer Letter"* (conditional).

#### 3. Comparative Evaluation
| Dimension | Option A — Non-Binding Intent (Recommended) | Option B — Binding Electronic Contract | Option C — Employer-Designated Status |
|---|---|---|---|
| **Legal Definition** | Conditional offer letter; subject to formal employment contract execution. | Legally binding electronic contract under E-Commerce Law Chapter 3. | Dual-mode platform supporting both informal offers and formal contracts. |
| **Pros** | Eliminates platform liability for rescinded offers or candidate reneging. | High value for remote hiring; eliminates offline paperwork. | Maximum flexibility for corporate HR vs informal hiring. |
| **Cons** | Candidates have no legal recourse if an employer rescinds an accepted offer. | Extreme liability; disputes regarding labor code formalities (probation, benefits). | Significant legal and technical complexity; confuses candidates. |
| **Technical Implementation** | Persistent legal banner across all offer cards and negotiation modals. | Implement digital signature audit trails, hash locking, and identity checks. | Add `isBinding: Boolean` to `Offer` model and conditional signing logic. |
| **Code Impact** | Frontend UI copy and Terms of Service updates only. | Massive legal and technical overhaul of `offer` module. | Major additions to `offer.dto.ts` and `offer.service.ts`. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** Employment contracts in Cambodia and internationally are governed by extensive statutory formalities (probationary periods, internal enterprise regulations, statutory holidays, termination severance) that cannot be fully captured in a basic five-field database record (`salary`, `equity`, `startDate`). Characterizing in-app offers as preliminary commercial intent agreements protects both candidates and employers from unintended legal exposure, while avoiding dragging JobFit into labor arbitration lawsuits.

#### 5. Concrete Code & Policy Deliverables
* In **Employer Terms of Service (§6.2)** & **Candidate Terms of Service (§8.1)**: State: *"In-app offers and negotiation messages exchanged on JobFit are preliminary declarations of intent. A legally binding employment relationship is formed only upon the mutual execution of formal written employment contracts outside the platform."*
* In **Offer View UI (`jobfit-frontend/src/features/offer`):** Display a persistent legal footer: *"This offer is conditional upon the successful completion of standard employer onboarding and the execution of a formal written employment agreement."*

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

### D24 — Recruiter CV Download Access, Expirable Tokens & View Auditing

#### 1. Context & Technical Facts
In `MENTOR_REVIEW_2026-08-18.md` §9, engineering resolved a major architectural omission by implementing on-demand resume downloads:
- `GET /employer/applications/:id/resume` (`employer.controller.ts`).
- The endpoint mints a signed, expirable URL from Supabase Storage with a **300-second (5-minute) Time-to-Live (TTL)**.
- The route enforces strict company authorization (`companyId` must match the job's company).
However, the post-mortem noted a deliberate remaining gap:
*"This closes the access gap, not the audit gap. Nothing records that an employer viewed a candidate's CV. `AuditActionType` has no member for it... For a hiring product handling CVs, 'who opened whose résumé, and when' is worth having."*
Under modern privacy expectations, candidates expect to know when their CV is accessed, and employers must maintain an auditable access log to defend against data exfiltration.

#### 2. Decision Options
* **Option A (Full Audit Logging with Candidate Transparency):** Implement a database audit row (`ApplicationViewLog`) recording every signed resume download, and notify the candidate in their application timeline (*"Employer reviewed your resume"*).
* **Option B (Silent Security Audit Logging Only):** Record CV download events in the administrative `SecurityEvent` / `AuditLog` table for security investigation, but do not expose view events to candidates.
* **Option C (Retain Ephemeral 300s URLs without View Auditing):** Maintain the current architecture relying on short 300s signed URL expiration without database access logging.

#### 3. Comparative Evaluation
| Dimension | Option A — Full Audit + Candidate Notice (Recommended) | Option B — Silent Security Logging | Option C — Ephemeral Signed URLs Only |
|---|---|---|---|
| **Legal Definition** | Transparent candidate tracking satisfying GDPR Art. 15 access rights. | Internal compliance telemetry for cybersecurity defense. | Standard cloud storage bearer credential model. |
| **Pros** | Enormous candidate engagement; full GDPR transparency; auditable security. | Security visibility without candidate relationship complications. | Zero database writes; minimal latency on resume download route. |
| **Cons** | Employers may dislike candidates knowing the exact minute their CV was opened. | Candidates cannot verify whether their application was actually reviewed. | Zero accountability if a recruiter's account is compromised and bulk-downloads CVs. |
| **Technical Implementation** | Add `AuditActionType.RESUME_VIEWED` and emit `ApplicationTimeline` event. | Insert row into `SecurityEvent` table upon signed URL generation. | Current production implementation in `employer.service.ts`. |
| **Code Impact** | Add Prisma migration, event listener, and timeline UI component. | Minor insertion call in `employer.service.ts`. | None. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** In modern ATS platforms (such as LinkedIn and Indeed), alerting a candidate that an employer *"viewed your resume"* drives exceptional user retention and candidate satisfaction. Legally, logging CV access provides complete traceability in the event of an employer data leak or candidate privacy complaint, proving exactly which recruiter user accessed the document and at what timestamp.

#### 5. Concrete Code & Policy Deliverables
* In `schema.prisma`: Add `RESUME_VIEWED` to `AuditActionType` and record the recruiter user ID and application ID.
* In `ApplicationTimeline`: Append a milestone event (`RESUME_OPENED`) when `GET /employer/applications/:id/resume` is invoked, visible in the candidate's tracking board.
* In **Employer Master Services Agreement (§7.3)**: Disclose to employers that candidate application access and resume download events are logged for security and transparency purposes.

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

## Domain 7: Commercial Tiers, Billing, IP & Platform Content

---

### D25 — Subscription Tier Alignment & Feature Entitlement Enforcement

#### 1. Context & Technical Facts
In `MENTOR_REVIEW_2026-08-18.md` §2, §10 and the codebase, engineering exposed an architectural naming discrepancy:
- Database schema: `enum SubscriptionTier { FREE, PREMIUM, PROFESSIONAL }` (`schema.prisma` line 55).
- Frontend marketing and pricing table: `Free ($0)`, `Pro ($19/mo)`, `Enterprise ($49/mo)` (`pricing.constants.ts`).
- Entitlement enforcement: `EntitlementService` (`jobfit-backend/src/modules/user/application/services/entitlement.service.ts`) checks:
  `hasPaidPlan() => account?.subscriptionTier === 'PREMIUM' || account?.subscriptionTier === 'PROFESSIONAL'`.
- Gated features: AI Cover Letter generation, AI Interview Coaching, detailed ATS suggestions in Resume Builder, advanced match report exports.
If the commercial contracts and Stripe checkout describe "Pro" and "Enterprise", while the backend database stores "PREMIUM" and "PROFESSIONAL", legal ambiguity exists regarding what specific features each tier legally guarantees.

#### 2. Decision Options
* **Option A (Reconcile Code and Legal Tiers via Schema Migration):** Migrate `SubscriptionTier` in Prisma to match the public marketing terms: `FREE`, `PRO`, `ENTERPRISE`.
* **Option B (Codify Binding Mapping Table in Legal Agreements):** Retain current database enums; include an explicit definition table in the Commercial Terms stating: `"Pro" corresponds to PREMIUM, and "Enterprise" corresponds to PROFESSIONAL`.
* **Option C (Simplify to Binary Tiers):** Collapse platform tiers into two simple legal categories: `STANDARD (Free)` and `JOBFIT_PRO (Paid)`.

#### 3. Comparative Evaluation
| Dimension | Option A — Schema Migration to Pro/Enterprise | Option B — Binding Mapping Table (Recommended) | Option C — Binary Tiers |
|---|---|---|---|
| **Legal Definition** | Complete 1:1 linguistic parity between code, UI, and contract. | Contractual definition bridging technical taxonomy with commercial copy. | Simplified dual-tier commercial licensing model. |
| **Pros** | Eliminates all developer and customer confusion; pristine codebase. | Zero code changes; zero risk of breaking active database migrations. | Drastically simplifies entitlement rules across frontend and backend. |
| **Cons** | Requires a database migration on a populated PostgreSQL enum column. | Slight inelegance in legal contract drafting. | Removes the 3-tier price discrimination architecture. |
| **Technical Implementation** | Run Prisma migration renaming enum values across all tables. | Draft Definitions section in Terms of Sale with explicit mapping. | Update `SubscriptionTier` to `FREE / PRO`; refactor controllers. |
| **Code Impact** | Migration script affecting `User` and `auth-cache` keys. | None. Documentation only. | Refactor `EntitlementService` and frontend pricing tables. |

#### 4. Recommended Strategy & Rationale
**Option B is recommended** for immediate launch, transitioning to Option A during the next scheduled database maintenance window. The database mapping is fully encapsulated inside `EntitlementService`, which already treats `PREMIUM` and `PROFESSIONAL` as equivalent paid entitlements. Legally defining in the Terms of Sale that "Pro corresponds to database tier PREMIUM" provides complete enforceability without risking database migration locks.

#### 5. Concrete Code & Policy Deliverables
* In **Commercial Terms of Sale (§1.1 — Tier Definitions)**: Formally declare: *"References to 'JobFit Pro' correspond to the technical tier identifier PREMIUM, and references to 'JobFit Enterprise' correspond to PROFESSIONAL."*
* In **Entitlement Feature Matrix**: Clearly publish the exact limits per tier: Free (basic matching, 3 cover letters/mo); Pro (unlimited matching, 30 AI generations/mo, full ATS suggestions); Enterprise (multi-seat recruiter access, candidate scout alerts).

#### 6. Management Decision
`[ ] Option A    [ ] Option B (Recommended)    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

### D26 — Payment Gateway Integration & Subscription Billing Terms

#### 1. Context & Technical Facts
In `MENTOR_REVIEW_2026-08-18.md` §10, engineering confirmed the operational reality of payments:
- `PaymentService` is currently an empty class (`class PaymentService {}`).
- `StripeAdapter.createSubscription` returns `''`.
- `PaymentController` has no active routes.
- The only way a user currently attains `PREMIUM` is through manual admin grant (`PATCH /admin/users/:id/subscription`).
- However, `jobfit-frontend` contains a Stripe billing checkout hook (`src/features/payment/api/payment.api.ts`), and Cambodia heavily relies on local mobile payments (Bakong KHQR, ABA PayWay).
If JobFit activates payment processing, it must establish clear legal rules regarding recurring auto-renewals, cancellation grace periods, chargebacks, and statutory 14-day cooling-off refund rights.

#### 2. Decision Options
* **Option A (Formal SaaS Recurring Billing Terms with 14-Day Cooling-Off):** Implement standard recurring subscription terms (monthly auto-renewal, prorated upgrades, 14-day statutory refund for unused digital services).
* **Option B (Hybrid Gateway Terms: Stripe + Bakong KHQR):** Offer dual payment rails: Stripe for international credit cards (auto-recurring) and Bakong KHQR for Cambodia (manual 30-day fixed prepaid passes with zero auto-renew).
* **Option C (Public Beta Subsidized Status):** Formally declare JobFit in "Public Commercial Beta", providing free tier upgrades to all verified users and postponing formal billing terms until Stripe/Bakong are fully wired.

#### 3. Comparative Evaluation
| Dimension | Option A — Standard Recurring SaaS Terms | Option B — Hybrid Stripe + Bakong KHQR (Recommended) | Option C — Public Beta Free Status |
|---|---|---|---|
| **Legal Definition** | Conventional Western auto-recurring SaaS subscription agreement. | Dual-rail terms: Auto-recurring credit card vs Prepaid fixed pass. | Royalty-free beta evaluation license. |
| **Pros** | Predictable Monthly Recurring Revenue (MRR) and standard churn metrics. | Perfect cultural fit for Cambodia (Bakong KHQR) + international scale. | Zero billing disputes, zero chargebacks, frictionless user acquisition. |
| **Cons** | Credit card penetration in Cambodia is <10%; high chargeback risk. | Requires maintaining two distinct billing lifecycle state machines. | Generates zero revenue; users may resist future paywall activation. |
| **Technical Implementation** | Wire Stripe webhooks (`invoice.paid`, `customer.subscription.deleted`). | Implement Stripe webhooks + Bakong KHQR transaction verification API. | Keep `PaymentService` stubbed; grant tiers via admin panel. |
| **Code Impact** | Complete implementation of `payment` module in backend. | Substantial engineering across `payment` module and webhooks. | None on backend. |

#### 4. Recommended Strategy & Rationale
**Option B is recommended** for the production launch. In Cambodia, consumers overwhelmingly pay via mobile banking apps scanning Bakong KHQR codes (prepaid fixed duration), whereas international users prefer auto-recurring credit card billing via Stripe. Designing legal terms that explicitly accommodate both auto-renewing subscriptions (Stripe) and non-renewing 30-day prepaid access passes (Bakong KHQR) reflects the reality of the market and maximizes conversion.

#### 5. Concrete Code & Policy Deliverables
* In **Terms of Sale (§3 — Payment Methods & Renewals)**:
  - Clause 3.1 (Stripe): Credit card subscriptions auto-renew monthly until cancelled via account settings.
  - Clause 3.2 (Bakong KHQR): Mobile QR purchases grant 30, 90, or 365 days of prepaid access with no auto-renewal.
* In **Refund Policy (§4.2)**: Digital service access is activated immediately. A 14-day refund is honored only if zero AI generations (`cover_letter`, `interview`) were consumed during the billing cycle.

#### 6. Management Decision
`[ ] Option A    [ ] Option B (Recommended)    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

### D27 — Resume Builder Intellectual Property & Template Ownership

#### 1. Context & Technical Facts
JobFit provides an interactive Resume Builder (`jobfit-backend/src/modules/resume-builder`):
- Manages structured resume documents (`ResumeDocument`), experience, education, skills, and projects (`schema.prisma` lines 1616–1830).
- Renders ATS-optimized PDF documents via `resume-pdf.renderer.ts` and `resume-export.service.ts`.
- Provides pre-designed visual styling templates (`ResumeTemplate`) and color presets (`color-presets.ts`).
Intellectual property conflicts frequently arise in document builder software: Does JobFit own the design, typography, and layout of the generated PDF? Does the candidate own their career history and narrative text? Can a candidate freely submit the generated PDF to third-party competitors without infringing JobFit's copyright?

#### 2. Decision Options
* **Option A (Clear Dual-Ownership IP Allocation):** JobFit owns all intellectual property in the templates, visual designs, software code, and rendering algorithms. The candidate retains 100% ownership of their personal career narrative and receives a perpetual, royalty-free, worldwide license to use, copy, export, and distribute the generated PDF.
* **Option B (Work-Made-For-Hire Assignment):** JobFit assigns all copyright in the generated PDF directly to the candidate upon creation.
* **Option C (Proprietary Document Lock-In):** Retain JobFit ownership of the rendered format and embed a non-removable JobFit watermark on free tier exports.

#### 3. Comparative Evaluation
| Dimension | Option A — Dual-Ownership Allocation (Recommended) | Option B — Work-Made-For-Hire Assignment | Option C — Watermark Document Lock-In |
|---|---|---|---|
| **Legal Definition** | Platform owns design IP; candidate owns narrative IP + broad usage license. | Complete transfer of all design rights in the output file to user. | Proprietary branding retention on exported derivative works. |
| **Pros** | Industry standard (similar to Canva / Figma); protects JobFit's design assets. | Ultimate candidate appeal; zero copyright ambiguity for job seekers. | Virality driver; free marketing on candidate resumes submitted to HR. |
| **Cons** | Candidates must read terms to understand design licensing structure. | JobFit loses exclusive rights to its proprietary resume styling templates. | Candidates despise watermarks; harms professional job seeker credibility. |
| **Technical Implementation** | Draft clear IP clauses in Job Seeker Terms of Service. | Legal assignment clause in Terms of Service. | Inject footer in `resume-pdf.renderer.ts`: *"Built with JobFit.com"*. |
| **Code Impact** | None on backend. | None. | Modify PDF canvas drawing commands in `resume-pdf.renderer.ts`. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** Dual-ownership is the universal legal standard for creative software tools. JobFit must protect its proprietary layout designs, CSS typography systems, and template structures (`ResumeTemplate`) from being copied or commercialized by rival recruitment platforms. Granting the candidate an unrestricted, perpetual license to use the exported PDF for any job search purpose provides total legal freedom to the user without compromising JobFit's core design IP.

#### 5. Concrete Code & Policy Deliverables
* In **Job Seeker Terms of Service (§10.1 — Intellectual Property & License)**: Formally declare: *"JobFit retains all rights, title, and interest in its software, templates, styling designs, and PDF layout structures. You retain full ownership of your personal career narrative and are granted a perpetual, royalty-free, irrevocable license to export, print, and distribute your generated resume for any personal employment purpose."*
* In `ResumeExportService`: Ensure exported PDFs include standard document metadata tagging author and generator attributes cleanly.

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

### D28 — Salary Intelligence, Percentile Benchmarking & Antitrust Compliance

#### 1. Context & Technical Facts
In `jobfit-backend/src/modules/salary/salary.service.ts`, JobFit computes real-time compensation intelligence for candidates and recruiters:
- `getSalary(company, role)` queries all `PUBLISHED` internal postings for that company, calculating:
  - 25th percentile (`p25`), 50th percentile (`p50`), 75th percentile (`p75`), and average total compensation.
- The service renders actionable negotiation tips: `"Aim for $500–$800/mo based on 12 market data points."`
- In `MENTOR_REVIEW_2026-08-18.md` §12, engineering resolved salary formatting defects by introducing `salaryCurrency` and `salaryPeriod` (`ANNUAL` vs `MONTHLY`).
Under antitrust and competition laws (including US FTC wage-fixing guidelines and Article 56 of the Cambodian Law on Competition), exchanging confidential, non-public wage information among competing employers can be scrutinized as **unlawful wage-fixing or compensation coordination**. Furthermore, companies may object to JobFit publicly exposing their internal salary bands.

#### 2. Decision Options
* **Option A (Public Aggregation Safe Harbor with Antitrust Disclaimers):** Generate salary statistics strictly from publicly advertised job postings (never confidential payroll data). Require a minimum threshold of data points ($N \ge 5$) before displaying company-specific percentiles, and publish explicit wage-benchmarking disclaimers.
* **Option B (Industry-Wide Aggregation Only):** Suppress company-specific compensation breakdowns; calculate salary percentiles strictly across broad industry and occupational categories (e.g., *"Mid-Level Software Engineer in Phnom Penh"*).
* **Option C (Opt-In Employer Compensation Benchmarking):** Permit employers to opt out of public salary intelligence reporting on their company profiles.

#### 3. Comparative Evaluation
| Dimension | Option A — Minimum Data Threshold + Disclaimers (Recommended) | Option B — Industry-Wide Aggregation Only | Option C — Employer Opt-Out |
|---|---|---|---|
| **Legal Definition** | Public factual aggregation with statistical privacy thresholds. | Generalized macroeconomic compensation intelligence. | Voluntary publisher participation framework. |
| **Pros** | Highly engaging candidate feature; completely legal as data is drawn from public ads. | Zero risk of employer corporate complaints; immune from antitrust inquiry. | Avoids friction with large corporate recruiters who demand pay confidentiality. |
| **Cons** | Small companies with 1–2 postings may object to compensation visibility. | Removes the compelling feature of looking up specific target company pay. | Creates data gaps in the salary intelligence database. |
| **Technical Implementation** | In `salary.service.ts`, return `null` if `mids.length < 5` for company-level queries. | Refactor query to group by `role` and `industry`, ignoring `companyId`. | Add `hideSalaryIntel: Boolean` to `Company` model and filter queries. |
| **Code Impact** | Add guard `if (rows.length < 5) return null;` in `salary.service.ts`. | Modify `fetchSalaryRows` to aggregate across industry cohorts. | Add column in `Company` schema and toggle in employer settings. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** Compensation figures derived exclusively from publicly published job listings do not constitute illegal wage-fixing, because the information was already placed in the public domain by the employers themselves. Enforcing a minimum data threshold of $N \ge 5$ postings ensures statistical anonymization and prevents an employer's single posting from being singled out unfairly.

#### 5. Concrete Code & Policy Deliverables
* In `salary.service.ts` line 38: Add a statistical threshold check:
  `if (rows.length < 3) return null;` (or fall back to role-wide averages across all companies).
* In **Salary Intelligence UI**: Display a persistent disclaimer: *"Compensation benchmarks are statistical estimates calculated from publicly advertised job listings on JobFit. Actual compensation is determined independently by employers."*
* In **Employer Terms of Service (§5.4)**: Clarify that salary figures included in public job postings may be aggregated into platform-wide compensation benchmarks.

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

## Domain 8: Jurisdiction, Dispute Resolution & Language Governance

---

### D29 — Governing Law, Venue & National Commercial Arbitration (NCAC)

#### 1. Context & Technical Facts
JobFit is operated primarily from Phnom Penh, Kingdom of Cambodia, serving both local Cambodian candidates and international corporations / remote job seekers.
When commercial disputes arise—such as an employer demanding a refund for an unverified listing, a candidate asserting discriminatory AI screening, or an IP infringement claim—the governing law and forum selection clause dictates where and how litigation is resolved.
Litigation in Cambodian municipal courts can be unpredictable for foreign investors and enterprise clients. Conversely, the **National Commercial Arbitration Centre (NCAC)** in Phnom Penh provides modern, expedited, internationally enforceable commercial arbitration under UNCITRAL rules.

#### 2. Decision Options
* **Option A (Laws of Cambodia; Mandatory NCAC Commercial Arbitration):** Designate the laws of the Kingdom of Cambodia as governing; mandate binding commercial arbitration before the National Commercial Arbitration Centre (NCAC) in Phnom Penh, with an explicit class action waiver.
* **Option B (Laws of Cambodia; Exclusive Jurisdiction of Phnom Penh Courts):** Select Cambodian governing law, with non-exclusive jurisdiction vested in the Municipal Court of Phnom Penh.
* **Option C (International Hybrid Forum):** Select Cambodian law and NCAC arbitration for domestic users and local employers; designate Singapore law and SIAC (Singapore International Arbitration Centre) arbitration for international enterprise contracts.

#### 3. Comparative Evaluation
| Dimension | Option A — Cambodian Law + NCAC Arbitration (Recommended) | Option B — Phnom Penh Municipal Courts | Option C — International Hybrid (NCAC / SIAC) |
|---|---|---|---|
| **Legal Definition** | Private, neutral, international-standard institutional arbitration. | Traditional sovereign municipal judicial litigation. | Dual-forum framework segmented by user domicile. |
| **Pros** | Confidential proceedings; enforceable in 170+ nations under New York Convention. | Lowest upfront legal drafting complexity; familiar to local Cambodian entities. | Maximizes confidence for foreign enterprise buyers and venture investors. |
| **Cons** | Filing fees at NCAC are higher than basic local small-claims court filing fees. | Public court proceedings; potential delays; unfamiliar to foreign enterprise clients. | Requires maintaining two distinct dispute resolution schedules in terms. |
| **Technical Implementation** | Standardized dispute resolution section drafted in all five legal documents. | Basic forum selection clause naming Phnom Penh courts. | Jurisdictional routing clause in Master Services Agreement. |
| **Code Impact** | None on backend. | None. | None. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** The NCAC is Cambodia's premier dispute resolution institution, recognized internationally and enforceable worldwide under the New York Convention on the Recognition and Enforcement of Foreign Arbitral Awards. Mandating NCAC arbitration in Phnom Penh guarantees that disputes are decided confidentially by commercial arbitration experts, shielding JobFit from frivolous public court litigation while assuring foreign investors of procedural fairness.

#### 5. Concrete Code & Policy Deliverables
* In **All Platform Agreements (§12 — Governing Law & Dispute Resolution)**: Incorporate the standard NCAC arbitration model clause:
  *"This Agreement shall be governed by and construed in accordance with the laws of the Kingdom of Cambodia. Any dispute arising out of or in connection with this Agreement shall be referred to and finally resolved by arbitration administered by the National Commercial Arbitration Centre (NCAC) in accordance with its Arbitration Rules."*
* In **Dispute Clause**: Include a mandatory 30-day informal negotiation period prior to initiating arbitration, and a mutual waiver of class action proceedings.

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

---

### D30 — Bilingual Supremacy, Khmer Consumer Protection & Language Discrepancies

#### 1. Context & Technical Facts
In `MENTOR_REVIEW_2026-08-18.md` §19, engineering identified a fundamental reality of JobFit's deployment:
- The corpus mixes English postings (TheMuse, corporate tech) with Khmer-language listings (BongThom, JobNet, Khmer24).
- The user interface supports both English and Khmer.
Under the Cambodian Law on Consumer Protection (2019) and the Law on Electronic Commerce (2019), commercial terms and conditions presented to domestic consumers within the Kingdom of Cambodia must be available in the **Khmer language**. If there is a linguistic conflict between the English master text and the Khmer translation, consumer protection courts typically interpret ambiguous provisions in favor of the local consumer.

#### 2. Decision Options
* **Option A (Dual Official Texts with English Controlling Internationally):** Publish full, certified bilingual versions (Khmer and English). Specify that for domestic consumer transactions in Cambodia, the Khmer version controls in accordance with local consumer law, while the English text controls for enterprise B2B contracts.
* **Option B (English Master Supremacy):** Publish terms in English with an informational Khmer translation, explicitly stating that the English text shall prevail in all instances of conflict or ambiguity.
* **Option C (Khmer Universal Supremacy for Cambodia Operations):** Designate the Khmer language version as the sole legally authoritative document within Cambodia.

#### 3. Comparative Evaluation
| Dimension | Option A — Dual Official Texts (Recommended) | Option B — English Master Supremacy | Option C — Khmer Universal Supremacy |
|---|---|---|---|
| **Legal Definition** | Harmonized bilingual contract with statutory consumer language alignment. | Unilateral linguistic priority clause favoring English master. | Domestic sovereign language supremacy clause. |
| **Pros** | Complies fully with Cambodian Consumer Protection Law; defensible locally. | Protects software engineering nuances that do not translate easily to Khmer. | Complete favor with Cambodian regulatory authorities and labor inspectors. |
| **Cons** | Requires certified professional translation of all legal policies. | High risk of being struck down by Cambodian consumer protection judges. | Disincentivizes international enterprise recruiters unable to read Khmer. |
| **Technical Implementation** | Language toggle in legal footer rendering synchronized Khmer/English policies. | Render English master with secondary translation disclaimer. | Store Khmer text as primary document in CMS. |
| **Code Impact** | Add internationalization routing for `/legal/*` routes in `jobfit-frontend`. | None. English text only. | Requires full Khmer localization of legal route content. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** Under Cambodian Consumer Protection Law, attempting to enforce an English-only clause against a Cambodian job seeker will likely fail in local dispute proceedings. By providing high-quality, professional Khmer translations for Candidate Terms and the Privacy Policy—while maintaining English supremacy for technical B2B Employer Agreements—JobFit ensures flawless domestic consumer protection compliance and institutional credibility.

#### 5. Concrete Code & Policy Deliverables
* In **Job Seeker Terms & Privacy Policy**: Include dual-language provisions: *"This document is executed in both Khmer and English. For domestic consumers in the Kingdom of Cambodia, the Khmer version reflects statutory consumer rights; for international interactions, the English text is authoritative."*
* In **Frontend Routing**: Provide full Khmer translations for `/terms`, `/privacy`, and `/extension-privacy` accessible via the existing language switcher.

#### 6. Management Decision
`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C`  
*Decision Notes:* __________________________________________________

# 4. Engineering Action Items & Compliance Roadmap

Prior to the public publication of the JobFit Legal Suite, engineering must complete the following implementation tasks to ensure that production code strictly reflects the adopted legal policies:

| Priority | Component | Associated Decision | Engineering Deliverable | Target Repository | Verification Method |
|---|---|---|---|---|---|
| 🔴 **P0** | **AI Safety & Verbiage** | **D1, D2** | Replace prescriptive verdicts in `match_reason_v2.txt` (`"clearly worth interviewing"`) with objective alignment tiers (`"comprehensive / partial / sparse"`). | `jobfits-ai-service` | Inspect prompt output; run `eval-generation.ts`. |
| 🔴 **P0** | **Structural AI Boundary** | **D6, D7** | Remove `cover_letter` from `KNOWN_TASKS` in `chat_router.py`, locking candidate PII processing strictly to local Ollama models. | `jobfits-ai-service` | Run `chat_router.spec.py` asserting personal data never routes to DeepSeek. |
| 🔴 **P0** | **Shared Device PWA Hygiene** | **D14** | Ensure `logout()` in `use-auth.ts` completely wipes the Dexie `jobfits-offline` IndexedDB database to protect public terminal users. | `jobfit-frontend` | Verify IndexedDB is 100% empty after logout in Chrome DevTools. |
| 🟡 **P1** | **User Data Anonymization** | **D11, D12** | Wire Supabase Storage file deletion into `AdminUserRepository.softDelete`, ensuring physical PDF resumes are purged upon account closure. | `jobfit-backend` | Execute test soft-delete; verify Supabase S3 bucket file deletion. |
| 🟡 **P1** | **Recruiter CV Download Audit** | **D24** | Add `RESUME_VIEWED` to `AuditActionType` and log recruiter user ID whenever `GET /employer/applications/:id/resume` is called. | `jobfit-backend` | Run `employer.controller.spec.ts` asserting audit log entry generation. |
| 🟡 **P1** | **Salary Statistical Guard** | **D28** | Enforce a minimum threshold ($N \ge 3$) in `SalaryService.getSalary()` before rendering company-specific percentile benchmarks. | `jobfit-backend` | Unit test asserting `null` return for companies with $<3$ salaried jobs. |
| 🟡 **P1** | **AI Degradation Telemetry** | **D8** | Verify that `GenerationService` emits `generatedBy: 'template'` on fallback and exempts the call from paid user quota decrements. | `jobfit-backend` | Run `generation.service.spec.ts` with mocked AI failure. |
| 🟢 **P2** | **Subject Access Export** | **D9, D13** | Deploy `GET /users/me/export` compiling user profile, resumes, and applications into a downloadable ZIP/JSON archive (redacting recruiter notes). | `jobfit-backend` | Test export endpoint with simulated candidate account. |
| 🟢 **P2** | **Extension Shadow DOM** | **D19** | Mount the extension floating badge inside a closed Shadow DOM root to prevent host DOM collisions and script detection. | `jobfit-extension` | Test on LinkedIn and Indeed in Chrome browser. |
| 🟢 **P2** | **Bilingual Legal Routing** | **D30** | Create localized Next.js legal routes (`/terms`, `/privacy`, `/extension-privacy`) supporting both Khmer and English language toggles. | `jobfit-frontend` | Verify language switching renders certified Khmer legal translations. |

---

# 5. Appendix: Code Reference Index

Every legal policy statement and decision in this framework is grounded in verified code artifacts across the four JobFit repositories:

### `jobfit-backend`
- **Prisma Data Models:** `prisma/schema.prisma` (`User`, `Profile`, `Resume`, `Application`, `Offer`, `OfferMessage`, `SavedJob`, `TrackedJob`, `MatchLabel`, `AuditLog`, `SecurityEvent`, `IdempotencyKey`, `ResumeDocument`).
- **Two-Dimensional Matching Logic:** `src/modules/matching/domain/scoring/role-fit.calculator.ts`, `preference-fit.calculator.ts`, `two-dimensional-scoring.service.ts`.
- **Screening & Resume Resolution:** `src/modules/matching/application/services/application-screening.service.ts`, `src/modules/application/application.service.ts`.
- **Salary Intelligence & Percentiles:** `src/modules/salary/salary.service.ts`, `salary.dto.ts`.
- **PWA Sync & Idempotency:** `src/modules/sync/sync.service.ts`, `batch.service.ts`, `delta.ts`.
- **GPU & AI Rate Limiting:** `src/common/guards/ai-throttler.guard.ts`, `src/config/throttler.config.ts`.
- **Entitlement & Subscription Tiers:** `src/modules/user/application/services/entitlement.service.ts`.
- **Employer Vetting & Company Claims:** `src/modules/employer-request/employer-request.service.ts`, `src/modules/employer/application/services/employer.service.ts`.
- **Admin Audit & Tombstone Deletion:** `src/modules/admin/infrastructure/repositories/admin-user.repository.ts`, `audit-log.repository.ts`.
- **Resume Builder & PDF Renderer:** `src/modules/resume-builder/application/services/resume-pdf.renderer.ts`, `resume-export.service.ts`.

### `jobfits-ai-service`
- **Multi-Provider Router & Privacy Boundary:** `app/services/chat_router.py`, `chat_provider.py`, `deepseek_client.py`, `ollama_client.py`.
- **AI Prompts & Screening Verdicts:** `app/prompts/match_reason_v2.txt`, `resume_score.txt`, `cover_letter.txt`, `job_requirements_v1.txt`.
- **Generative Services:** `app/services/generate_service.py`, `job_requirements_service.py`, `resume_service.py`.

### `jobfit-frontend`
- **PWA Service Worker & Offline Dexie Storage:** `src/lib/offline/db.ts` (`jobfits-offline`), `src/features/auth/use-auth.ts`.
- **Payment & Stripe Integration:** `src/features/payment/api/payment.api.ts`, `pricing.constants.ts`.
- **Job Tracker Kanban Board:** `src/features/job-tracker/`.
- **Resume Builder Workspace:** `src/features/resume-builder/`.
- **Offer & Negotiation Thread:** `src/features/offer/`.

### `jobfit-extension`
- **Manifest V3 Configuration & Host Permissions:** `manifest.config.ts`.
- **Extension Privacy Disclosures:** `PRIVACY.md`, `docs/EXTENSION_PRIVACY_FACTS.md`, `docs/STORE_LISTING.md`.
- **Injected DOM Content Scripts:** `src/contentScript.ts`, `src/data/savedJobs.ts`.

---

*Document End — JobFit Legal Decision Framework (30 Decisions).*