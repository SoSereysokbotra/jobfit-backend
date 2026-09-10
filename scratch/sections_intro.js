// scratch/sections_intro.js
module.exports = `
# JobFit — Comprehensive Legal Decision Framework (30 Core Decisions)

**Prepared for:** JobFit Management / Leadership Review  
**Prepared by:** Engineering  
**Date:** 10 September 2026  
**Status:** Comprehensive Decision Document — **not** a formal legal opinion. Requires review by qualified legal counsel before public deployment.

---

## How to Use This Document

This document exists to convert **30 open legal, regulatory, architectural, and operational questions into recorded management decisions**, establishing the factual and policy foundation for drafting JobFit's production legal agreements.

* **Section 1** establishes the **factual basis**. Every statement is verified directly against the active codebases (\`jobfit-backend\`, \`jobfit-frontend\`, \`jobfits-ai-service\`, and \`jobfit-extension\`), incorporating the architectural findings, post-mortems, and edge-case analyses documented in \`MENTOR_REVIEW_2026-08-18.md\` and accompanying plans.
* **Section 2** specifies the **proposed architecture of the five core legal documents** required for the JobFit ecosystem.
* **Section 3** is the **management decision grid** covering 30 decisions across 8 core domains. Leadership marks their selection on each item's \`Management Decision\` line.
* **Section 4** details the **engineering action items and compliance roadmap** required to support and enforce these decisions prior to public launch.
* **Section 5** provides an **index of verified code references** mapping legal topics to exact repository files.

---

### Priority Blockers Requiring Immediate Leadership Determination

Three foundational decisions dictate the legal posture of the platform and should be resolved first:

| Priority | Decision | Why It Blocks |
|---|---|---|
| 🔴 **1st** | **D1 — AI Match Score Legal Characterization & AEDT Status** | Determines whether JobFit is legally classified as an Automated Employment Decision Tool (AEDT) under emerging regulations (e.g., EU AI Act High-Risk Annex III, NYC Local Law 144) or strictly as a candidate advisory career compass. Dictates liability structure, disclaimers, and mandatory bias audit requirements. |
| 🔴 **2nd** | **D6 — Multi-Provider AI Boundary & Third-Party LLM Routing** | Dictates data flows to external inference providers (\`api.deepseek.com\` vs. local Ollama), governing user consent, cross-border data transfer disclosures, and PII protection boundaries. |
| 🔴 **3rd** | **D9 — Governing Privacy Standard & Regulatory Compliance** | Establishes whether JobFit adheres to a universal GDPR / Singapore PDPA standard or a local baseline (Cambodian E-Commerce & Consumer Protection Laws), governing retention, rights to erasure, and DPA structures. |

Once these three foundational decisions are established, the remaining 27 decisions can be reviewed in parallel within their respective domains.

---

# 1. Architectural & Legal Summary

## 1.1 The Multi-Party Platform Model

JobFit operates as an **integrated AI recruitment and career navigation ecosystem** combining a modern Next.js 15 PWA web platform, a NestJS DDD modular backend, an on-premises/cloud hybrid FastAPI AI microservice, and a Chrome Manifest V3 browser extension.

\`\`\`
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
\`\`\`

### Party Definitions and Code Manifestation

| Party | Code Representation | Operational Reality |
|---|---|---|
| **Platform Operator** | \`UserRole.ADMIN\`; \`src/modules/admin/\` | Operates backend infrastructure, evaluates employer onboarding requests (\`EmployerRequest\`), manages system health, triggers user locks/unlocks, supervises audit logs, and executes soft-deletion tombstones. |
| **Job Seeker (Candidate)** | \`UserRole.JOB_SEEKER\`; \`src/modules/user/\`, \`resume/\`, \`matching/\` | Uploads resumes, creates structured profile records, receives two-dimensional match calculations, tracks private applications (\`TrackedJob\`), accesses AI generation tools, and manages offline PWA sync. |
| **Employer (Recruiter)** | \`UserRole.EMPLOYER\`; \`src/modules/employer/\`, \`company/\`, \`offer/\` | Publishes internal job postings, manages company identity, reviews candidate applications, inspects candidate CVs via signed URLs, adds internal notes (\`employerNotes\`), and conducts offer negotiations. |
| **External Job Providers** | \`JobSourceType.EXTERNAL\`; \`src/modules/ingestion/\` | External job boards (BongThom, JobNet.com.kh, TheMuse) ingested via RSS/APIs/scraping, providing discovery without native application submission or direct recruiter interaction. |

---

## 1.2 System Architecture, Repositories & Verified Code Realities

The JobFit platform is split across four tightly integrated repositories:

1. **\`jobfit-backend\` (NestJS DDD Core):** Implements Clean Architecture with 26 bounded modules, Prisma ORM targeting PostgreSQL/pgvector via Supabase (port 6543 pooled, port 5432 direct), Redis-backed caching and token blacklisting, and background event listeners.
2. **\`jobfit-frontend\` (Next.js 15 PWA):** Enterprise web application featuring multi-role dashboards, TanStack React Query, Tailwind CSS design system, Serwist service worker, and Dexie IndexedDB (\`jobfits-offline\`) for offline caching and mutations.
3. **\`jobfits-ai-service\` (FastAPI Python Engine):** Hosts local NLP models via Ollama (BGE-M3 for 1024-d dense embeddings, Qwen/Llama for resume parsing) with optional proxying to DeepSeek API (\`api.deepseek.com\`).
4. **\`jobfit-extension\` (Chrome Manifest V3 Extension):** Injected content scripts running across 5 target job boards (\`linkedin.com\`, \`indeed.com\`, \`jobnet.com.kh\`, \`khmer24.com\`, \`bongthom.com\`), communicating with the backend via cookie-based SSO and storage sync.

### Grounded Technical Facts & Verified Post-Mortem Findings

A review of the engineering record (specifically \`MENTOR_REVIEW_2026-08-18.md\`, \`TWO_DIMENSIONAL_MATCHING_SPEC.md\`, \`chat_router.py\`, and related specifications) highlights critical architectural realities:

* **The Two-Dimensional Gating Engine:** Matches are computed across **Role Fit** ($R$, skills 60%, experience 40%) and **Preference Fit** ($P$, location 35%, work type 25%, seniority 20%, salary 20%). A non-linear damping penalty ($P < 0.65 \implies \text{Damping} = (P / 0.65)^2$) forces logistical dealbreakers (e.g. Remote candidate vs On-Site job) into the \`WEAK\` band regardless of skill qualifications.
* **The Structural AI Privacy Boundary:** In \`chat_router.py\`, the boundary between local Ollama execution and DeepSeek cloud inference is **structural, not a convention**. Services handling candidate resumes, profile embeddings, and match reasoning are hardwired to \`OllamaClient\` and cannot reach DeepSeek even if configured. Only public job requirements and interview topic prompts are routed to \`api.deepseek.com\`.
* **Model Calibration & Negative Correlation:** Evaluation runs (\`eval-generation.ts\`) on smaller models (\`qwen3:0.6b\`) demonstrated negative Spearman correlation ($\rho = -0.065$) on match reasoning, where poorly matched profiles scored higher than well-matched ones. This proves that raw model outputs cannot be treated as authoritative hiring determinations.
* **Automated Screening Verdicts:** The AI prompt \`match_reason_v2.txt\` explicitly instructs the model to return verdicts: \`"strong" (clearly worth interviewing)\`, \`"possible"\`, or \`"weak" (wrong role or missing essentials)\`. This constitutes an automated assessment of applicant suitability.
* **Tombstone Soft Deletion:** To prevent cascading deletes from destroying ground truth evaluation pairs (\`MatchLabel\`), \`AdminUserRepository.softDelete\` renames deleted user emails to a tombstone (\`u_<id>@deleted.invalid\`), clearing authentication while preserving historical relational integrity.
* **Application Resume Resolution:** An application row fixes \`resumeId\` at the moment of submission (\`Application.resumeId\`). Recruiters view the exact CV snapshot submitted, even if the candidate subsequently updates their active profile CV.
* **GPU Rate Limiting:** \`AiThrottlerGuard\` enforces per-user hourly caps (10 generations, 30 match reports, 20 resume scores, 120 match queries) to protect against denial-of-service and runaway cloud inference invoices.
* **Tracked Jobs vs. Saved Jobs:** Saved internal jobs (\`SavedJob\`) are tied to the platform listing and are removed if the employer deletes the posting. Tracked jobs (\`TrackedJob\`) belong entirely to the candidate's private Kanban board and survive external listing deletions.
* **Salary Formatting & Currency Realities:** In Cambodia, 348 out of 367 ingested jobs quote no salary; when quoted, salaries are often monthly in USD or KHR. \`formatSalaryRange\` outputs \`null\` for missing pay rather than fabricating \`$0K\`.
* **Stripe Subscription Stub:** The billing adapter is currently an empty stub (\`StripeAdapter.createSubscription\` returns \`''\`). Tier entitlements (\`FREE\`, \`PREMIUM\`, \`PROFESSIONAL\`) are presently enforced via admin grants.

---

# 2. Legal Document Suite Architecture

To protect JobFit across all jurisdictions and user interactions, five distinct legal instruments must be deployed:

\`\`\`
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
\`\`\`
`;
