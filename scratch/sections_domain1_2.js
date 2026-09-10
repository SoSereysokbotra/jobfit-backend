// scratch/sections_domain1_2.js
module.exports = `
# 3. Management Decision Grid (30 Core Decisions)

## Domain 1: AI Decisioning, AEDT Classification & Algorithmic Transparency

---

### D1 — AI Match Score Legal Characterization & AEDT Status

#### 1. Context & Technical Facts
JobFit calculates match percentages for candidates and employers using a two-dimensional mathematical formula (\`TWO_DIMENSIONAL_MATCHING_SPEC.md\`, \`TwoDimensionalScoringService\`):
Role Fit ($R = 0.60 \\times \\text{Skills} + 0.40 \\times \\text{Experience}$) multiplied by Preference Fit ($P = 0.35 \\times \\text{Location} + 0.25 \\times \\text{Type} + 0.20 \\times \\text{Level} + 0.20 \\times \\text{Salary}$) with non-linear damping ($P < 0.65 \\implies (P/0.65)^2$).
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
| **Code Impact** | Restrict \`ApplicationScreeningService.screen()\` outputs on recruiter views. | Add \`AuditLog\` metrics tracking race, gender, and demographic score distributions. | Update \`EmployerApplicationResponseDto\` with explicit non-binding guidance markers. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended.** JobFit provides scores to both candidates and recruiters, but the engineering design intentionally leaves final screening decisions to human recruiters (\`INTERNAL_EXTERNAL_JOBS_PLAN.md\`). By combining dual-sided advisory disclaimers with express contractual covenants in the Employer Master Services Agreement (prohibiting automated rejections without human review), JobFit avoids high-risk AEDT classification while preserving product utility.

#### 5. Concrete Code & Policy Deliverables
* In **Employer Terms of Service (§4.2)**: Mandate that recruiters conduct human reviews of all applicants and covenant that match scores shall not serve as the sole criterion for disqualification.
* In **Candidate Terms of Service (§6.1)**: Include an express disclaimer that match percentages represent algorithmic approximations of keyword/vector relevance and guarantee neither interviews nor employment.
* In **Frontend UI (\`EmployerApplicationResponseDto\`)**: Render a persistent banner: *"JobFit match scores are heuristic indicators designed to assist human review. Final hiring decisions rest exclusively with the employer."*

#### 6. Management Decision
\`[ ] Option A    [ ] Option B    [X] Option C (Recommended)\`  
*Decision Notes:* __________________________________________________

---

### D2 — Automated Screening Verdicts & Recruiter Advisory Limits

#### 1. Context & Technical Facts
In \`jobfits-ai-service/app/prompts/match_reason_v2.txt\`, the AI prompt explicitly commands the model:
\`verdict: "strong" (clearly worth interviewing for this role), "possible" (partial fit, some core gaps), "weak" (wrong role or missing the essentials)\`.
Furthermore, the prompt states: *"A candidate from a different profession scores below 0.2."*
This output is returned to \`ApplicationScreeningService.screen()\` and projected onto \`EmployerApplicationResponseDto\`. Providing an explicit verdict that a candidate is *"clearly worth interviewing"* or *"weak"* crosses the boundary from neutral relevance matching into affirmative employment decision-making.

#### 2. Decision Options
* **Option A (Factual Requirement Analysis Only):** Strip qualitative verdicts (\`strong/possible/weak\`) from prompts. Emit only factual requirement match lists and documented candidate gaps.
* **Option B (Retain Verdicts with Binding Human-in-the-Loop Safeguards):** Maintain current qualitative verdicts but require employers to check a mandatory confirmation box affirming human review before rejecting any applicant.
* **Option C (Rephrase Verdicts to Neutral Alignment Tiers):** Replace evaluative employment terms ("clearly worth interviewing") with neutral alignment terminology (\`HIGH_ALIGNMENT\`, \`MODERATE_ALIGNMENT\`, \`GAP_IDENTIFIED\`).

#### 3. Comparative Evaluation
| Dimension | Option A — Factual Analysis Only | Option B — Human Confirmation Gate | Option C — Neutral Alignment Tiers (Recommended) |
|---|---|---|---|
| **Legal Definition** | Pure information extraction; zero qualitative assessment. | Qualitative AEDT with procedural human-in-the-loop validation. | Heuristic document alignment classification. |
| **Pros** | Complete elimination of automated hiring verdict liability. | Keeps strong recruiter value proposition of instant candidate triage. | Balances recruiter clarity with safe legal taxonomy. |
| **Cons** | Less actionable for recruiters skimming 100+ applicants. | Extra friction in recruiter applicant review UI. | Requires prompt revision and DTO enum adjustments. |
| **Technical Implementation** | Delete \`verdict\` key from \`match_reason_v2.txt\` and backend DTOs. | Block \`PATCH /applications/:id/status\` to \`REJECTED\` without \`humanReviewed: true\`. | Update prompt schema and map \`verdict\` to objective alignment labels. |
| **Code Impact** | Refactor \`MatchReasonResponse\` in \`ai.types.ts\` and \`ScreeningSummaryDto\`. | Add \`humanReviewedAt\` timestamp column to \`Application\` in Prisma. | Edit \`match_reason_v2.txt\` lines 29-37 and frontend badge rendering. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended**, complemented by the procedural safeguard of Option B. Evaluative statements like *"clearly worth interviewing"* create immense liability if a rejected candidate from a protected class discovers the AI marked them "weak" based on a parsing defect. Reframing the prompt to output objective alignment categories eliminates prescriptive employment advice while preserving the recruiter's ability to prioritize reviews.

#### 5. Concrete Code & Policy Deliverables
* In \`match_reason_v2.txt\`: Replace \`verdict: "strong|possible|weak"\` with \`coverage: "comprehensive|partial|sparse"\`.
* In \`ApplicationScreeningService\`: Ensure that screening data is marked as an internal heuristic summary.
* In **Employer Master Services Agreement (§5.1)**: Explicitly state that JobFit provides document comparison summaries and does not make employment recommendations or screening decisions.

#### 6. Management Decision
\`[ ] Option A    [ ] Option B    [X] Option C (Recommended)\`  
*Decision Notes:* __________________________________________________

---

### D3 — AI Hallucination, Cover Letter & Resume Fabrication Liability

#### 1. Context & Technical Facts
JobFit provides automated generative AI capabilities for job seekers via \`GenerationService\` (\`jobfit-backend/src/modules/generation/generation.service.ts\`):
- \`coverLetterForApplication\`: Generates tailored cover letters using candidate resume summaries and employer job descriptions.
- \`interview\`: Generates tailored interview preparation questions and evaluates user answers.
- \`ResumeBuilder\`: Suggests bullet points and summaries based on profile inputs.
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
| **Code Impact** | None on backend; Terms of Service drafting only. | Major architectural investment in factual consistency verification. | Minor frontend state in \`generation\` and \`resume-builder\` modals. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended.** Generative AI models cannot be guaranteed to produce 100% factual summaries. Combining a comprehensive disclaimer of accuracy in the Terms of Service with a mandatory pre-export confirmation modal in the UI creates an unassailable legal audit trail proving that the candidate reviewed, adopted, and verified the text as their own before transmitting it to an employer.

#### 5. Concrete Code & Policy Deliverables
* In **Job Seeker Terms of Service (§7.3)**: State that AI generation features are experimental draft-generation tools. The user assumes full responsibility for reviewing, editing, and verifying all submissions.
* In **Resume Builder & Generation UI**: Display a persistent notice: *"AI-generated content may contain inaccuracies. Verify all statements, dates, and skills before submitting."*
* In **Employer Master Services Agreement (§6.4)**: Include a disclaimer that JobFit does not verify the truthfulness of candidate-submitted application materials or AI-assisted cover letters.

#### 6. Management Decision
\`[ ] Option A    [ ] Option B    [X] Option C (Recommended)\`  
*Decision Notes:* __________________________________________________

---

### D4 — Model Calibration, Small LLM Limitations & Confidence Disclaimers

#### 1. Context & Technical Facts
In \`MENTOR_REVIEW_2026-08-18.md\` §13 and \`HANDOFF_2026-08-17.md\` §6, engineering documented that model calibration evaluations (\`eval-generation.ts\` and \`eval-retrieval.ts\`) revealed negative correlation ($\rho = -0.065$) on match reasoning when using small local LLMs (\`qwen3:0.6b\`). A candidate with no resume scored a constant 40 on experience, and match percentages varied by as little as 4 points between a senior engineer and a graphic designer. While two-dimensional gating has since stabilized ranking order, the exact **percentage** shown to users has never been statistically calibrated against ground truth hiring outcomes.

#### 2. Decision Options
* **Option A (Disclose Experimental Estimation Nature):** Retain percentage display (e.g., "87% Match") while publishing an explicit Algorithmic Transparency Notice explaining that scores are relative similarity estimates, not predictive probabilities of hiring.
* **Option B (Abolish Numerical Percentages):** Remove numerical percentages from the entire UI. Replace them with broad qualitative match bands: \`HIGH\`, \`MODERATE\`, \`WEAK\`.
* **Option C (Tiered Score Display):** Show broad qualitative bands to free users, while reserving detailed dimensional radar breakdowns (Role Fit vs Preference Fit) for Pro subscribers with technical calibration disclaimers.

#### 3. Comparative Evaluation
| Dimension | Option A — Percentage + Transparency Notice | Option B — Qualitative Bands Only | Option C — Tiered Qualitative / Breakdown (Recommended) |
|---|---|---|---|
| **Legal Definition** | Continuous numerical metric accompanied by prominent experimental caveats. | Ordinal ranking metric with low precision commitments. | Qualitative triage with paid deep-dive analytics. |
| **Pros** | Maintains high user engagement and gamified UX appeal. | Eliminates false precision and candidate disputes over score variations. | Monetization driver; prevents over-reliance by general users. |
| **Cons** | Candidates may obsess over minor 2–3% variations and claim bias. | Flattens nuanced mathematical distinctions calculated by the engine. | Requires distinct UI rendering paths based on user subscription tier. |
| **Technical Implementation** | Publish Algorithmic Methodology document and tooltip disclaimers. | Refactor frontend to map 0–100 scores to 3 discrete badge styles. | Render score badges as \`GREAT / GOOD / FAIR / WEAK\`; reveal % in Pro radar view. |
| **Code Impact** | Documentation only; no code changes. | Refactor \`RecommendationCard.tsx\` and \`match-score.util.ts\`. | Modify \`EntitlementService\` checks around \`ScreeningSummaryDto.breakdown\`. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended.** The core insight from engineering evaluations is that small LLMs provide coarse triage rather than fine-grained percentage calibration. Presenting categorical bands (\`GREAT FIT\` $\ge 80$, \`GOOD FIT\` $65–79$, \`FAIR FIT\` $50–64$, \`WEAK FIT\` $<50$) prevents users from misinterpreting the score as an authoritative mathematical certainty, while allowing advanced users to inspect the dimensional breakdown.

#### 5. Concrete Code & Policy Deliverables
* In **Algorithmic Transparency Disclosure**: Publish the mathematical architecture ($R \\times P$ with non-linear damping) and clarify that scores measure document similarity rather than human competency.
* In **Frontend Score Tooltip**: Add helper text: *"Match ratings reflect the semantic overlap between your resume and the job listing. They do not predict hiring outcomes."*
* In **Employer Terms of Service (§4.3)**: Explicitly caution recruiters that scores are not calibrated aptitude tests and must not be used as statutory cut-offs.

#### 6. Management Decision
\`[ ] Option A    [ ] Option B    [X] Option C (Recommended)\`  
*Decision Notes:* __________________________________________________

---

### D5 — Ground Truth Data (\`MatchLabel\`) & Training Rights on User Resumes

#### 1. Context & Technical Facts
The database contains a \`MatchLabel\` table (\`schema.prisma\` lines 1296–1318) designed to store human-graded evaluation pairs (candidate CV + job posting + ground truth label: \`RELEVANT / IRRELEVANT\`). In \`MENTOR_REVIEW_2026-08-18.md\` §14, it was documented that hard-deleting users through the console destroyed 50 hand-labelled evaluation pairs. To improve matching accuracy, JobFit may wish to fine-tune local embedding models (BGE-M3) or train rerankers using anonymized candidate resumes, applications, and recruiter hiring outcomes.

#### 2. Decision Options
* **Option A (Express Consent for Internal AI Training & Evaluation):** Include an explicit grant in the Privacy Policy allowing JobFit to use de-identified resume text and platform interactions for model training, calibration, and evaluation.
* **Option B (Zero Model Training on User Data):** Strictly prohibit the use of user-uploaded CVs for AI training. Limit all model training to public benchmark datasets.
* **Option C (Evaluation & Benchmarking Only):** Restrict user data usage to automated evaluation harnesses (measuring nDCG, Recall, and MRR) without fine-tuning model weights on candidate CVs.

#### 3. Comparative Evaluation
| Dimension | Option A — Express Training Grant | Option B — Zero Training on User Data | Option C — Evaluation Only (Recommended) |
|---|---|---|---|
| **Legal Definition** | Broad proprietary license to derive algorithmic models from user data. | Absolute data segregation; user data is strictly operational. | Limited analytical license for quality assurance and metric validation. |
| **Pros** | Enables domain-specific model fine-tuning for the Cambodian job market. | Maximizes candidate trust; trivial GDPR Art. 6(1)(b) compliance. | Protects evaluation integrity (\`MatchLabel\`) without IP or privacy controversies. |
| **Cons** | Privacy backlash; requires complex anonymization pipelines under GDPR. | Prevents JobFit from improving proprietary models using platform data. | Precludes direct model weight fine-tuning on proprietary candidate text. |
| **Technical Implementation** | Build automated PII scrubber stripping names, emails, and phones before storage. | Enforce strict read-only inference boundaries in \`ai-service\`. | Maintain \`MatchLabel\` harness using anonymized embeddings and IDs. |
| **Code Impact** | Add \`AnonymizedResumeCorpus\` table and sanitization worker. | None. Existing code already isolates inference from training. | Add foreign key decoupling so \`MatchLabel\` survives user tombstone deletion. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended** for the current operational stage, with a pathway to Option A via explicit opt-in. Preserving evaluation ground truth (\`MatchLabel\`) is essential for engineering quality assurance. However, claiming unconstrained rights to train generative AI on private resumes triggers immediate user distrust and regulatory scrutiny. Restricting use to benchmarking and quality assurance provides complete legal safety.

#### 5. Concrete Code & Policy Deliverables
* In **Candidate Privacy Policy (§3.4)**: State clearly: *"JobFit does not sell your resume data or use your personal resume text to train public generative AI models. We may use de-identified, aggregated interaction telemetry to evaluate matching algorithm quality."*
* In \`schema.prisma\`: Alter \`MatchLabel\` foreign keys to use \`ON DELETE SET NULL\` or decouple candidate references so evaluation pairs are not destroyed when accounts are deleted.

#### 6. Management Decision
\`[ ] Option A    [ ] Option B    [X] Option C (Recommended)\`  
*Decision Notes:* __________________________________________________

---

## Domain 2: AI Infrastructure Boundary, Data Routing & Model Providers

---

### D6 — Multi-Provider AI Boundary & Third-Party LLM Routing

#### 1. Context & Technical Facts
In \`jobfits-ai-service/app/services/chat_router.py\`, JobFit routes AI tasks between a local Ollama instance and DeepSeek's cloud API (\`api.deepseek.com\`).
The architecture enforces a strict structural boundary:
- \`TASK_INTERVIEW\` (job title + seniority) $\\to$ DeepSeek cloud allowed.
- \`TASK_JOB_REQUIREMENTS\` (employer's public posting) $\\to$ DeepSeek cloud allowed.
- \`TASK_INTERVIEW_FEEDBACK\` (user's written answer) $\\to$ Local Ollama default.
- \`TASK_COVER_LETTER\` (\`resumeSummary\` derived from CV) $\\to$ Local Ollama default.
- \`ResumeService\`, \`EmbedService\`, \`RerankService\`, and \`MatchReasonService\` take \`OllamaClient\` directly and **cannot reach DeepSeek under any configuration**.
However, if \`DEEPSEEK_TASKS\` is configured to include \`cover_letter\`, personal summary text derived from a candidate's CV is transmitted to DeepSeek's external cloud.

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
| **Technical Implementation** | Remove \`TASK_COVER_LETTER\` from \`KNOWN_TASKS\` in \`chat_router.py\`. | Add \`cloudAiConsent: Boolean\` to \`User\` and pass flag in \`AiClient\`. | Replace Ollama client with enterprise SDKs in \`jobfits-ai-service\`. |
| **Code Impact** | Lock \`chat_router.py\` to public tasks (\`interview\`, \`job_requirements\`). | Modify \`generate.py\`, \`generation.service.ts\`, and user profile settings. | Wholesale rewrite of \`ai-service\` model execution layer. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** The most profound architectural asset of JobFit is its structural privacy boundary. By guaranteeing that candidate resumes and profile data are processed exclusively on infrastructure operated directly by JobFit (or its private dedicated host), JobFit achieves a market-leading privacy standard that easily satisfies GDPR, PDPA, and Cambodian data protection principles. Public job descriptions and generic interview questions carry zero candidate PII and can safely utilize DeepSeek for cost-effective extraction.

#### 5. Concrete Code & Policy Deliverables
* In \`chat_router.py\`: Permanently exclude \`cover_letter\` and \`interview_feedback\` from \`KNOWN_TASKS\`, ensuring they execute exclusively on local Ollama models.
* In **Candidate Privacy Policy (§4.1)**: Disclose clearly: *"Your resume, profile, and personal career history are processed exclusively on JobFit's secure private infrastructure and are never transmitted to third-party generative AI providers."*
* In **Extension Privacy Policy (\`PRIVACY.md\`)**: Update the disclosures to mirror this exact boundary (job postings may use DeepSeek; candidate CVs never do).

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

### D7 — Cross-Border AI Data Transfers & China Data Protection (PIPL)

#### 1. Context & Technical Facts
When JobFit extracts job requirements via \`POST /match-report\` or generates generic interview questions via \`POST /generate/interview-prep\`, requests are forwarded to \`api.deepseek.com\` if \`DEEPSEEK_API_KEY\` is active. DeepSeek is headquartered in Hangzhou, People's Republic of China, and operates servers subject to the PRC Personal Information Protection Law (PIPL) and Data Security Law. Even though only public job postings and generic titles are transmitted, cross-border data transfer regulations in the EU (GDPR Chapter V), Singapore (PDPA), and Cambodia (E-Commerce Law Sub-Decree) require disclosure of international data destinations.

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
| **Technical Implementation** | Update public privacy documents to explicitly identify DeepSeek's role. | Refactor \`deepseek_client.py\` to call Anthropic, OpenAI, or AWS Bedrock. | Secure executed DPA from DeepSeek corporate sales team. |
| **Code Impact** | Documentation updates in \`PRIVACY.md\` across backend and extension. | Rewrite API client, error handling, and prompt structures in \`ai-service\`. | None on code; legal contract execution only. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** Because the structural boundary established in D6 guarantees that **no personal candidate data** reaches DeepSeek, the data transmitted consists entirely of publicly published job advertisements and general occupation titles. Under international data privacy laws (including GDPR and PIPL), public company data does not constitute personal data. Transparent disclosure in the privacy policy provides complete legal honesty without incurring unnecessary API cost inflation.

#### 5. Concrete Code & Policy Deliverables
* In **Privacy Policy (Sub-Processor Schedule)**: List \`DeepSeek (Hangzhou DeepSeek Artificial Intelligence Co., Ltd.)\` as a sub-processor utilized strictly for public job description analysis and generic interview question synthesis.
* In \`jobfit-extension/PRIVACY.md\`: Maintain the disclosure added in August 2026 accurately identifying DeepSeek's role in the Full Report feature.

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

### D8 — AI Degradation, Service Outages & Heuristic Fallback Disclaimers

#### 1. Context & Technical Facts
As documented in \`AI_DEGRADATION_PLAN.md\` and implemented in \`GenerationService\` (\`generation.service.ts\` lines 72–78):
- If the AI service fails or times out, cover letter generation gracefully degrades to a static string template (\`templateCoverLetter\`).
- Interview preparation degrades to a static, hardcoded set of generic questions.
- Application screening degrades to rule-based keyword counts.
Users who pay for a \`PREMIUM\` or \`PROFESSIONAL\` subscription are paying specifically for AI-powered features. If the AI service experiences downtime and users receive static templates without notice, subscribers may assert claims for breach of contract, misleading conduct, or demand pro-rata subscription refunds.

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
| **Technical Implementation** | Current implementation in \`generation.service.ts\`. | Emit \`generatedBy: 'template'\` in DTO and render UI badge. | In \`AiClient\`, throw \`ServiceUnavailableException\` if user is paid. |
| **Code Impact** | None. | Minor frontend badge in cover letter view indicating template status. | Modify \`GenerationController\` error handling logic. |

#### 4. Recommended Strategy & Rationale
**Option B is recommended.** Silent degradation creates severe legal vulnerability under consumer protection legislation (e.g., Cambodian Law on Consumer Protection Article 21 prohibiting misleading representations regarding the nature and characteristics of services). By transparently flagging that a template fallback was used and ensuring that such fallback generations do **not** count against the user's paid monthly quota, JobFit maintains goodwill, legal compliance, and operational resilience.

#### 5. Concrete Code & Policy Deliverables
* In \`GenerationService\`: Ensure that when \`result.generatedBy === 'template'\`, the user's paid generation usage counter is **not** decremented.
* In **Frontend UI**: Display an informational toast: *"Our AI engine is currently experiencing high load. A standard professional template has been provided, and this generation has not been deducted from your quota."*
* In **Terms of Service (§8.2)**: Include a standard Service Availability clause noting that algorithmic and AI features are subject to maintenance and temporary degradation without constituting a total service failure.

#### 6. Management Decision
\`[ ] Option A    [ ] Option B (Recommended)    [ ] Option C\`  
*Decision Notes:* __________________________________________________
`;
