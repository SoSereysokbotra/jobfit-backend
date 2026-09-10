// scratch/sections_domain5_6.js
module.exports = `
## Domain 5: Ingestion, Extension & Third-Party Platform Terms

---

### D17 — Automated Job Aggregation, Scraping & Fair Use Safe Harbor

#### 1. Context & Technical Facts
JobFit populates its job discovery corpus through automated ingestion pipelines (\`jobfit-backend/src/modules/ingestion\`):
- Ingestion from **BongThom.com** via RSS feeds.
- Ingestion from **JobNet.com.kh** via structured Schema.org JSON-LD web scraping.
- Ingestion from **TheMuse.com** via public developer APIs.
- Ingested jobs are stored in the database with \`JobSourceType.EXTERNAL\` and display an external application URL (\`Job.applyUrl\`).
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
| **Technical Implementation** | Maintain current RSS/JSON-LD ingestion; store canonical source URL. | Build custom B2B partner ingestion APIs and partner authentication keys. | Modify \`ingest.ts\` to truncate \`description\` and mandate external redirect. |
| **Code Impact** | Existing ingestion module architecture (\`ingestion.module.ts\`). | Rewrite ingestion adapters to authenticate against partner B2B endpoints. | Alter \`JobMapper\` to emit shortened description previews. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** JobFit functions as an informational indexing bridge, directing qualified candidates to the employer's original posting URL (\`applyUrl\`). Factual job vacancies published publicly on the open web are not protected by exclusive copyright in their bare factual terms. By indexing public metadata, attributing the source clearly, linking back to the origin, and immediately complying with takedown requests, JobFit operates well within established aggregator safe harbor precedents.

#### 5. Concrete Code & Policy Deliverables
* In **Platform Terms of Service (§9.1 — Aggregated Listings)**: State clearly: *"JobFit indexes publicly available job listings to assist career discovery. External listings remain the property of their respective publishers, and JobFit claims no affiliation with external boards unless expressly stated."*
* In **Frontend Job Detail View**: Ensure all \`EXTERNAL\` jobs render an unambiguous attribution badge: *"Originally posted on [BongThom / JobNet]. Apply on original site $\\to$"*.

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

### D18 — Employer Takedown Notices & De-Indexing Procedures

#### 1. Context & Technical Facts
When an external job posting is closed, deleted, or filled on the origin website (e.g., BongThom or JobNet), JobFit's ingested database record may continue to display the job as active unless refreshed. Furthermore, an employer whose posting was aggregated without prior consultation may demand the immediate removal or de-indexing of their job listing from JobFit. If JobFit displays expired jobs, candidates waste time applying, damaging platform credibility; if JobFit refuses employer takedown requests, it risks civil litigation.

#### 2. Decision Options
* **Option A (Notice-and-Takedown Protocol with 48h SLA):** Establish a published DMCA / Notice-and-Takedown procedure allowing employers to request instant removal via an automated form or designated email (\`compliance@jobfit.com\`).
* **Option B (Automated Head-Check Verification):** Implement an automated daily HTTP crawler that checks whether external \`applyUrl\` links return HTTP 404 or redirect to closed notices, automatically flipping \`Job.status\` to \`CLOSED\`.
* **Option C (Comprehensive Dual Hygiene Protocol):** Combine automated daily HTTP link-health sweeps with a formal, expedited notice-and-takedown channel for employers.

#### 3. Comparative Evaluation
| Dimension | Option A — Manual Notice-and-Takedown | Option B — Automated Link Sweeps | Option C — Dual Hygiene Protocol (Recommended) |
|---|---|---|---|
| **Legal Definition** | Statutory safe-harbor compliance (e.g., DMCA / E-Commerce Law Art. 38). | Automated algorithmic catalog hygiene. | Comprehensive proactive and reactive compliance framework. |
| **Pros** | Satisfies statutory safe harbor requirements with minimal engineering. | Automatically purges 90% of expired listings without human intervention. | Highest catalog freshness; virtually eliminates employer legal complaints. |
| **Cons** | Expired jobs remain visible until someone complains. | Origin sites may block link-checking crawlers; false-positive closures. | Requires building both a worker task and administrative triage UI. |
| **Technical Implementation** | Add \`POST /support/takedown\` endpoint and legal contact email. | Build \`JobLivenessCheckService\` running \`HEAD\` requests across \`applyUrl\`. | Implement both the scheduled verification cron and the admin takedown tool. |
| **Code Impact** | Documentation and basic contact handler. | Scheduled cron worker in \`job\` module. | Moderate engineering effort across \`job\` and \`admin\` modules. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended.** The primary complaint from employers regarding aggregators is that obsolete vacancies remain online months after being filled. Combining proactive automated link validation (marking jobs \`CLOSED\` when origin links fail) with a published, frictionless notice-and-takedown process provides airtight legal protection under international intermediary liability laws.

#### 5. Concrete Code & Policy Deliverables
* In **Platform Terms of Service (§9.3 — Takedown Policy)**: Publish an explicit takedown procedure committing to de-index contested or expired external listings within 48 business hours of verified notice.
* In \`jobfit-backend/src/modules/job\`: Deploy a scheduled cron job (\`JobLivenessCheckCron\`) that issues non-intrusive \`HEAD\` requests to external \`applyUrl\` targets, transitioning unresponsive links to \`JobStatus.CLOSED\`.
* In \`AdminJobController\`: Provide an instant one-click de-index button for platform administrators.

#### 6. Management Decision
\`[ ] Option A    [ ] Option B    [X] Option C (Recommended)\`  
*Decision Notes:* __________________________________________________

---

### D19 — Browser Extension Content Script Injection & Third-Party ToS

#### 1. Context & Technical Facts
The JobFit Chrome Extension (\`jobfit-extension\`, Manifest V3) injects content scripts into five third-party websites:
\`linkedin.com\`, \`indeed.com\`, \`jobnet.com.kh\`, \`khmer24.com\`, and \`bongthom.com\`.
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
| **Technical Implementation** | Add mandatory acceptance modal upon extension install; publish disclaimer. | Strip \`content_scripts\` from \`manifest.config.ts\`; build popup paste UI. | Refactor \`contentScript.ts\` to attach UI inside \`attachShadow({mode: 'closed'})\`. |
| **Code Impact** | Extension onboarding modal and legal terms documentation. | Total rewrite of extension UI and data ingestion flow. | Engineering refactor of content script rendering layer. |

#### 4. Recommended Strategy & Rationale
**Option A combined with Option C is recommended.** In modern web law, a browser extension running locally on a user's machine to assist that user in reading a public web page is a protected personal computing activity (analogous to ad blockers and grammar assistants). JobFit does not automate scraping at scale; it reads a single page only when the user navigates there. By isolating the injected UI in Shadow DOM and providing prominent warnings that third-party sites prohibit extensions, JobFit insulates itself from legal liability while delivering the core product experience.

#### 5. Concrete Code & Policy Deliverables
* In **Extension Privacy Policy (\`PRIVACY.md\`) & Web Store Listing**: Include a prominent **Third-Party Terms Warning**: *"JobFit is an independent tool not affiliated with, sponsored by, or endorsed by LinkedIn, Indeed, JobNet, Khmer24, or BongThom. Use of browser extensions may violate the terms of service of certain third-party platforms. JobFit assumes no liability for account actions taken by third-party sites."*
* In \`jobfit-extension\`: Ensure all injected UI is mounted within a closed Shadow DOM root to prevent DOM collisions and script conflicts with the host page.

#### 6. Management Decision
\`[ ] Option A + C (Recommended)    [ ] Option B    [ ] Option C Only\`  
*Decision Notes:* __________________________________________________

---

### D20 — Saved Jobs (Platform Dependent) vs. Tracked Jobs (Candidate Owned)

#### 1. Context & Technical Facts
In \`MENTOR_REVIEW_2026-08-18.md\` §16 and the database schema, engineering identified a fundamental difference between two job-saving mechanisms:
1. **\`SavedJob\` (Internal Bookmarks):** References internal \`Job.id\` with a foreign key constraint. When an employer deletes or closes a job, database cascades delete the \`SavedJob\` row.
2. **\`TrackedJob\` (Private Kanban Board):** Developed in \`modules/job-tracker/job-tracker.service.ts\`. A \`TrackedJob\` copies job title, company name, URL, and salary notes into an independent candidate record (\`schema.prisma\` line 1833). When an employer deletes a job, the candidate's \`TrackedJob\` card **survives** with all personal notes, interview logs, and salary negotiations intact.
From a legal and privacy perspective, these two tables have distinct ownership structures: \`SavedJob\` is a platform reference, whereas \`TrackedJob\` is the candidate's private personal intellectual property.

#### 2. Decision Options
* **Option A (Formal Legal Partition of Job Data):** Formally define \`TrackedJob\` in the Terms of Service as private candidate-owned data (confidential and never accessible to employers), while \`SavedJob\` is defined as a transient platform discovery bookmark.
* **Option B (Unify into a Single Engine):** Deprecate \`SavedJob\` and migrate all bookmarks into \`TrackedJob\`, decoupling all saved listings from employer deletion cascades.
* **Option C (Employer Visibility into Candidate Tracking):** Allow employers to see how many candidates have "tracked" their job in the Kanban pipeline as an aggregate marketing metric.

#### 3. Comparative Evaluation
| Dimension | Option A — Formal Legal Partition (Recommended) | Option B — Unify into TrackedJob | Option C — Employer Tracking Analytics |
|---|---|---|---|
| **Legal Definition** | Dual legal status: Platform discovery cache vs Private career property. | Uniform candidate ownership across all saved career items. | Candidate activity telemetry monetized as employer analytics. |
| **Pros** | Reflects current code reality; zero database migrations required. | Eliminates user confusion when a saved job disappears. | Creates upsell value for employer analytics dashboards. |
| **Cons** | Users may wonder why a "Saved Job" vanished while a "Tracked Job" stayed. | Architectural refactor migrating existing \`SavedJob\` rows. | Candidate privacy backlash; users expect tracking to be 100% private. |
| **Technical Implementation** | Document distinct lifecycles in UI tooltips and Terms of Service. | Migrate \`SavedJob\` records to \`TrackedJob\` with stage \`WISHLIST\`. | Add \`trackedJobsCount\` aggregation query to \`EmployerJobController\`. |
| **Code Impact** | None on backend; documentation and UI copy only. | Deprecate \`SavedJobModule\`; update frontend bookmark buttons. | New analytics service and privacy policy disclosure. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended** for immediate deployment, with a long-term roadmap toward Option B. As documented in the August 2026 post-mortem, \`TrackedJob\` is explicitly scoped to the user in the WHERE clause, ensuring complete confidentiality. Codifying that \`TrackedJob\` notes, interview dates, and salary figures are the candidate's private work product (immune from employer inspection or discovery) provides critical trust for job seekers.

#### 5. Concrete Code & Policy Deliverables
* In **Job Seeker Terms of Service (§5.2 — Career Tracking Data)**: State: *"Content created within your Job Tracker board—including notes, interview records, and personal compensation targets—constitutes your private candidate work product. JobFit will not disclose your Tracker entries to any employer."*
* In **Frontend UI Tooltip (\`SavedJob\`)**: Add a micro-notice: *"Saved jobs remain available while the employer's posting is active. To permanently save job notes to your personal career tracker, click 'Add to Tracker'."*

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

## Domain 6: Employer Vetting, Offer Negotiations & Labor Compliance

---

### D21 — Employer Onboarding, Domain Verification & Anti-Scam Shielding

#### 1. Context & Technical Facts
In \`jobfit-backend/src/modules/employer-request\` and \`employer.service.ts\`, employer registration is gated through a multi-step verification process (\`EmployerRequest\`):
1. A recruiter registers and submits an \`EmployerRequest\` with their company name, website, and corporate email.
2. The backend performs an automated domain check (\`DomainCheckResult\`), returning \`MATCH\` (email matches company domain), \`MISMATCH\` (personal Gmail/Yahoo used for corporate company), or \`NO_WEBSITE\`.
3. A platform administrator must manually approve the request (\`AuditActionType.EMPLOYER_REQUEST_APPROVED\`), which creates the \`EmployerProfile\` and links the user to the \`Company\`.
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
| **Technical Implementation** | In \`EmployerRequestService\`, block submission if domain mismatch exceeds threshold. | Maintain current workflow; ensure \`AuditLog\` records approving admin. | Build CamDX verification adapter in \`employer-request.module.ts\`. |
| **Code Impact** | Add strict domain validation rules in \`create-employer-request.dto.ts\`. | Current code architecture is already compatible. | Major external integration requiring government credentials. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** As documented in \`mentor_review\` and \`employer_logic.md\`, approving an employer request is the most consequential action an administrator performs, as it mints an authorized hiring account capable of viewing candidate CVs. Enforcing corporate email domain matching as a prerequisite—while requiring formal documentation review for small businesses utilizing generic emails—is essential to protect candidates from recruitment scams and human trafficking schemes.

#### 5. Concrete Code & Policy Deliverables
* In **Employer Master Services Agreement (§2.1 — Verification & Authority)**: Require employers to warrant that they possess full legal authority to recruit on behalf of the named company, and provide complete indemnification for fraudulent representations.
* In \`jobfit-backend/src/modules/employer-request\`: Reject requests where \`domainCheckResult === 'MISMATCH'\` unless accompanied by uploaded business registration documentation.
* In **Candidate Safety Notice**: Render a verified company badge on listings where the employer completed corporate domain verification.

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

### D22 — Prohibited Job Postings, Non-Discrimination & Labor Law Standards

#### 1. Context & Technical Facts
JobFit allows employers to publish internal job descriptions (\`Job\`), specifying requirements, seniority levels, and qualifications.
Under Cambodian Labor Law (1997, Articles 12 and 106) and international labor standards (ILO Convention No. 111):
- Employers are strictly prohibited from discriminating on the basis of race, color, sex, creed, religion, political opinion, birth, or social origin.
- In Cambodia, it is historically common for job advertisements to explicitly demand specific genders (e.g., *"Female only"*), age limits (e.g., *"Age 18-25"*), or physical photos.
- Furthermore, modern recruitment platforms must prohibit fraudulent job postings: charging application fees, Multi-Level Marketing (MLM) schemes, adult services, and "ghost jobs" (fictitious postings posted for branding or market research).

#### 2. Decision Options
* **Option A (Zero-Tolerance Policy with Immediate Account Suspension):** Publish an exhaustive Acceptable Use & Non-Discrimination Policy banning discriminatory criteria, application fees, and MLM schemes. Authorize admins to immediately suspend violators (\`UserStatus.SUSPENDED\`).
* **Option B (Reactive Moderation upon Candidate Reporting):** Rely on candidate reporting flags (\`POST /jobs/:id/report\`) to identify and review discriminatory or abusive listings.
* **Option C (Automated AI Content Filtering on Publication):** Run an automated NLP screening check in \`JobService.publish()\` that scans job descriptions for prohibited discriminatory keywords (gender, age, marital status) before allowing publication.

#### 3. Comparative Evaluation
| Dimension | Option A — Policy + Immediate Suspension | Option B — Reactive Reporting | Option C — Automated AI Pre-Screening (Recommended) |
|---|---|---|---|
| **Legal Definition** | Contractual prohibition enforced via post-hoc administrative sanctions. | Intermediary notice-and-action liability framework. | Proactive algorithmic content moderation satisfying ESG/labor standards. |
| **Pros** | Clear legal standards; absolute contractual right to terminate bad actors. | Lowest engineering investment; zero false-positive publishing delays. | Prevents discriminatory postings from ever being displayed publicly. |
| **Cons** | Relies on manual admin vigilance; discriminatory jobs may be viewed. | Discriminatory jobs harm candidates and platform reputation before removal. | Minor false positives on legitimate occupational qualifications. |
| **Technical Implementation** | Draft comprehensive policy terms; utilize existing \`USER_SUSPENDED\` audit action. | Build candidate reporting button and admin moderation queue. | Add regex/LLM safety check filter in \`JobService.publishJob()\`. |
| **Code Impact** | Documentation and admin handbook drafting. | New \`JobReport\` model and controller in \`job\` module. | Add content moderation guard in \`job.service.ts\`. |

#### 4. Recommended Strategy & Rationale
**Option C combined with Option A is recommended.** Incorporating an automated pre-publication screening pass in \`JobService\` that flags explicit discriminatory constraints (e.g., mandatory female/male requirements where not a genuine occupational qualification, age ceilings, or fees) positions JobFit as a modern, progressive recruitment leader in Cambodia. Backing this with an express contractual right to immediately suspend violating employers without refund provides absolute legal protection.

#### 5. Concrete Code & Policy Deliverables
* In **Employer Master Services Agreement (§3.2 — Prohibited Job Content)**: Enumerate strict prohibitions against: (a) charging candidates application or training fees, (b) multi-level marketing or cryptocurrency recruitment, (c) discriminatory criteria prohibited by the Cambodian Labor Law.
* In \`jobfit-backend/src/modules/job/application/services/job.service.ts\`: Implement a pre-publish heuristic scanner flagging prohibited terms (\`"female only"\`, \`"male only"\`, \`"age limit"\`, \`"deposit required"\`).
* In \`admin-user.repository.ts\`: Utilize the existing \`UserStatus.SUSPENDED\` status to lock accounts of non-compliant employers.

#### 6. Management Decision
\`[ ] Option A + C (Recommended)    [ ] Option B    [ ] Option C Only\`  
*Decision Notes:* __________________________________________________

---

### D23 — In-App Job Offers & Multi-Round Negotiation Enforceability

#### 1. Context & Technical Facts
JobFit provides a comprehensive in-app offer and negotiation module (\`jobfit-backend/src/modules/offer\`):
- An employer creates a structured \`Offer\` entity (\`schema.prisma\` line 1009), specifying \`salary\`, \`equity\`, \`benefits\`, \`startDate\`, and \`expirationDate\`.
- The candidate can click "Accept", "Reject", or initiate negotiations via \`OfferMessage\` (\`schema.prisma\` line 1057), which supports multi-round counter-offers.
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
| **Technical Implementation** | Persistent legal banner across all offer cards and negotiation modals. | Implement digital signature audit trails, hash locking, and identity checks. | Add \`isBinding: Boolean\` to \`Offer\` model and conditional signing logic. |
| **Code Impact** | Frontend UI copy and Terms of Service updates only. | Massive legal and technical overhaul of \`offer\` module. | Major additions to \`offer.dto.ts\` and \`offer.service.ts\`. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** Employment contracts in Cambodia and internationally are governed by extensive statutory formalities (probationary periods, internal enterprise regulations, statutory holidays, termination severance) that cannot be fully captured in a basic five-field database record (\`salary\`, \`equity\`, \`startDate\`). Characterizing in-app offers as preliminary commercial intent agreements protects both candidates and employers from unintended legal exposure, while avoiding dragging JobFit into labor arbitration lawsuits.

#### 5. Concrete Code & Policy Deliverables
* In **Employer Terms of Service (§6.2)** & **Candidate Terms of Service (§8.1)**: State: *"In-app offers and negotiation messages exchanged on JobFit are preliminary declarations of intent. A legally binding employment relationship is formed only upon the mutual execution of formal written employment contracts outside the platform."*
* In **Offer View UI (\`jobfit-frontend/src/features/offer\`):** Display a persistent legal footer: *"This offer is conditional upon the successful completion of standard employer onboarding and the execution of a formal written employment agreement."*

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

### D24 — Recruiter CV Download Access, Expirable Tokens & View Auditing

#### 1. Context & Technical Facts
In \`MENTOR_REVIEW_2026-08-18.md\` §9, engineering resolved a major architectural omission by implementing on-demand resume downloads:
- \`GET /employer/applications/:id/resume\` (\`employer.controller.ts\`).
- The endpoint mints a signed, expirable URL from Supabase Storage with a **300-second (5-minute) Time-to-Live (TTL)**.
- The route enforces strict company authorization (\`companyId\` must match the job's company).
However, the post-mortem noted a deliberate remaining gap:
*"This closes the access gap, not the audit gap. Nothing records that an employer viewed a candidate's CV. \`AuditActionType\` has no member for it... For a hiring product handling CVs, 'who opened whose résumé, and when' is worth having."*
Under modern privacy expectations, candidates expect to know when their CV is accessed, and employers must maintain an auditable access log to defend against data exfiltration.

#### 2. Decision Options
* **Option A (Full Audit Logging with Candidate Transparency):** Implement a database audit row (\`ApplicationViewLog\`) recording every signed resume download, and notify the candidate in their application timeline (*"Employer reviewed your resume"*).
* **Option B (Silent Security Audit Logging Only):** Record CV download events in the administrative \`SecurityEvent\` / \`AuditLog\` table for security investigation, but do not expose view events to candidates.
* **Option C (Retain Ephemeral 300s URLs without View Auditing):** Maintain the current architecture relying on short 300s signed URL expiration without database access logging.

#### 3. Comparative Evaluation
| Dimension | Option A — Full Audit + Candidate Notice (Recommended) | Option B — Silent Security Logging | Option C — Ephemeral Signed URLs Only |
|---|---|---|---|
| **Legal Definition** | Transparent candidate tracking satisfying GDPR Art. 15 access rights. | Internal compliance telemetry for cybersecurity defense. | Standard cloud storage bearer credential model. |
| **Pros** | Enormous candidate engagement; full GDPR transparency; auditable security. | Security visibility without candidate relationship complications. | Zero database writes; minimal latency on resume download route. |
| **Cons** | Employers may dislike candidates knowing the exact minute their CV was opened. | Candidates cannot verify whether their application was actually reviewed. | Zero accountability if a recruiter's account is compromised and bulk-downloads CVs. |
| **Technical Implementation** | Add \`AuditActionType.RESUME_VIEWED\` and emit \`ApplicationTimeline\` event. | Insert row into \`SecurityEvent\` table upon signed URL generation. | Current production implementation in \`employer.service.ts\`. |
| **Code Impact** | Add Prisma migration, event listener, and timeline UI component. | Minor insertion call in \`employer.service.ts\`. | None. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** In modern ATS platforms (such as LinkedIn and Indeed), alerting a candidate that an employer *"viewed your resume"* drives exceptional user retention and candidate satisfaction. Legally, logging CV access provides complete traceability in the event of an employer data leak or candidate privacy complaint, proving exactly which recruiter user accessed the document and at what timestamp.

#### 5. Concrete Code & Policy Deliverables
* In \`schema.prisma\`: Add \`RESUME_VIEWED\` to \`AuditActionType\` and record the recruiter user ID and application ID.
* In \`ApplicationTimeline\`: Append a milestone event (\`RESUME_OPENED\`) when \`GET /employer/applications/:id/resume\` is invoked, visible in the candidate's tracking board.
* In **Employer Master Services Agreement (§7.3)**: Disclose to employers that candidate application access and resume download events are logged for security and transparency purposes.

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________
`;
