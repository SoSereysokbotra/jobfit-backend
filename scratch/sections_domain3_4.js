// scratch/sections_domain3_4.js
module.exports = `
## Domain 3: Candidate Data Privacy, Ownership, Retention & Erasure

---

### D9 — Governing Privacy Standard & Regulatory Compliance

#### 1. Context & Technical Facts
JobFit is engineered and operated primarily in Cambodia, ingesting jobs from domestic platforms (\`bongthom.com\`, \`jobnet.com.kh\`, \`khmer24.com\`) and global platforms (\`linkedin.com\`, \`indeed.com\`, \`themuse.com\`). Candidate data, applications, and embeddings reside in Supabase (AWS Tokyo) and Cloud Run (Tokyo).
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
| **Code Impact** | Add automated JSON/ZIP archive export endpoint for full profile data. | None. Existing \`admin-user.repository.ts\` deletion is sufficient. | Implement \`GET /users/me/export\` data dump endpoint. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended.** A tiered dual-regime framework provides the optimal commercial balance. JobFit's core user base is currently in Cambodia and Southeast Asia, where practical data protection practices (clear consent, secure storage, rights to withdraw and delete) are paramount. Offering a high-quality baseline to all users while explicitly incorporating GDPR/PDPA addenda for international users protects the platform globally without encumbering local operations with European regulatory filings.

#### 5. Concrete Code & Policy Deliverables
* In **Candidate Privacy Policy (§1.2 & Schedule 1)**: Formulate the core policy around transparent consent and security, accompanied by an "EEA / UK / Singapore Specific Rights Addendum".
* In \`UserModule\`: Expose a \`GET /users/me/export\` endpoint allowing candidates to download all stored profile, resume, and application data in structured JSON format.
* In **Cookie Banner / Consent Flow**: Implement an explicit consent recording mechanism capturing the timestamp and version of the Privacy Policy accepted during registration.

#### 6. Management Decision
\`[ ] Option A    [ ] Option B    [X] Option C (Recommended)\`  
*Decision Notes:* __________________________________________________

---

### D10 — Platform vs. Employer Data Controller Relationship

#### 1. Context & Technical Facts
When a candidate applies for an internal job (\`Application\`), their resume (\`Resume\`), cover letter, and contact information are transmitted to the recruiting employer (\`EmployerProfile\`, \`Company\`).
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
**Option A is recommended.** JobFit independently determines the matching algorithms, candidate profiling criteria, and platform functionality, meaning it cannot legally qualify as a mere processor. Furthermore, establishing independent controllership shields JobFit from third-party recruiter abuses: once an employer downloads a candidate's CV via \`GET /employer/applications/:id/resume\`, that employer is solely responsible under applicable law for its internal handling, retention, and security of that document.

#### 5. Concrete Code & Policy Deliverables
* In **Employer Master Services Agreement (§7.1)**: Covenant that the Employer receives candidate application materials as an independent data controller and must comply with all applicable privacy and labor laws.
* In **Candidate Privacy Policy (§5.2)**: Inform candidates: *"When you apply for a job on JobFit, your application materials are transmitted to the hiring employer, who processes your data as an independent data controller under their own privacy policies."*
* In **Application Submission Modal**: Include confirmation text: *"Submitting your application shares your CV and contact details directly with [Company Name]."*

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

### D11 — Data Retention Lifecycle, Supabase Storage Purge & Vector Deletion

#### 1. Context & Technical Facts
Candidate data exists in multiple storage layers across the platform:
1. Physical files: PDF/DOCX resumes stored in Supabase Storage (\`resumes/\` bucket).
2. Structured relational data: \`User\`, \`Profile\`, \`Experience\`, \`Education\`, \`ParsedResumeData\`.
3. High-dimensional vector embeddings: \`profiles.embedding\` (1024-dimensional BGE-M3 dense vectors in pgvector).
4. Derived match caches: \`recommendations\` and \`match_reports\` with SHA-256 description hashes.
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
| **Technical Implementation** | Nightly cron job deleting inactive S3 objects and zeroing \`embedding\`. | Static retention policy; execute deletions only on user request. | Implement automated warning emails at 11 months, archive at 12, purge at 36. |
| **Code Impact** | Add \`RetentionPurgeService\` and register in NestJS \`ScheduleModule\`. | None. | Add \`archivedAt\` to \`Resume\` and scheduled cleanup worker. |

#### 4. Recommended Strategy & Rationale
**Option C is recommended.** Career navigation platforms have multi-year user lifecycles: candidates frequently search for jobs, become employed for 2–3 years, and return when seeking their next role. Indefinite retention violates data protection laws, but a premature 12-month purge alienates returning users. Staging retention with automated notifications at 11 months, cold archiving at 12 months, and full anonymization at 36 months perfectly balances commercial utility with legal proportionality.

#### 5. Concrete Code & Policy Deliverables
* In **Privacy Policy (§6.1 — Data Retention Schedule)**: Publish a clear retention matrix: active resumes kept during active use; physical files archived after 12 months of inactivity; full anonymization after 3 years of total inactivity.
* In \`jobfit-backend\`: Implement a scheduled maintenance service (\`DataRetentionService\`) that flags inactive users, sends re-engagement notices, and purges orphaned Supabase Storage files.
* In \`MatchingEmbeddingService\`: Zero out \`profiles.embedding\` for archived accounts to minimize pgvector index RAM overhead.

#### 6. Management Decision
\`[ ] Option A    [ ] Option B    [X] Option C (Recommended)\`  
*Decision Notes:* __________________________________________________

---

### D12 — Candidate Account Deletion Scope & Historical Applications

#### 1. Context & Technical Facts
In \`MENTOR_REVIEW_2026-08-18.md\` §14 and \`admin-user.repository.delete.spec.ts\`, engineering documented a critical architectural conflict:
- When a candidate deletes their account, GDPR Article 17 (Right to Erasure) demands scrubbing their personal data.
- However, hard-deleting the user row cascades to \`Application\`, \`Offer\`, and \`MatchLabel\`. Deleting \`Application\` rows destroys the employer's statutory recruitment audit trail (required for defense against discriminatory hiring lawsuits), while deleting \`MatchLabel\` destroyed 50 hand-labelled ground truth evaluation pairs.
To resolve this, engineering implemented **tombstone soft deletion**:
\`AdminUserRepository.softDelete\` renames \`email\` to \`u_<id>@deleted.invalid\` (freeing the address for future registration), sets \`isActive = false\`, and timestamps \`deletedAt\`.
However, the user's physical PDF resume in Supabase storage, past applications, and recruiter notes currently remain in the database.

#### 2. Decision Options
* **Option A (Complete Relational Anonymization — The "Dual-Track" Purge):** Delete the physical resume PDF from Supabase, erase phone numbers, photos, and personal summaries, but retain the anonymized \`Application\` record (linking to an anonymous applicant tombstone) for the employer's audit defense.
* **Option B (Total Hard Delete Cascade):** Cascade hard-delete all database records, wiping the user, profile, resumes, applications, and offer records completely.
* **Option C (Tombstone with Employer Snapshot Freezing):** Retain the current soft-delete tombstone, purge cloud storage files, and freeze employer-facing application views into permanent read-only text archives.

#### 3. Comparative Evaluation
| Dimension | Option A — Dual-Track Anonymization (Recommended) | Option B — Total Hard Delete Cascade | Option C — Tombstone + Snapshot Freezing |
|---|---|---|---|
| **Legal Definition** | Irreversible anonymization satisfying GDPR Art. 17 while respecting labor retention. | Absolute erasure of all database records and foreign key associations. | Account deactivation with partial retention of operational records. |
| **Pros** | Satisfies Right to Erasure; preserves employer's legal defense audit trail. | Simplest implementation; leaves zero user residue in the database. | Zero risk of broken database references or missing hiring history. |
| **Cons** | Requires engineering a surgical multi-table scrubbing routine. | Destroys employer legal compliance records and AI ground truth datasets. | Retains encrypted PII in application rows; potential GDPR scrutiny. |
| **Technical Implementation** | Delete Supabase file $\\to$ zero PII columns in \`Profile\` $\\to$ set tombstone email. | Standard Prisma \`onDelete: Cascade\` on \`User\` model. | Maintain current soft delete; add automated Supabase storage delete trigger. |
| **Code Impact** | Implement \`UserAnonymizationService\` in \`user\` and \`admin\` modules. | Massive schema migration altering foreign key constraints. | Minor additions to \`AdminUserRepository.softDelete\`. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** Under GDPR Article 17(3)(e), the right to erasure does not apply to the extent that processing is necessary for the establishment, exercise, or defense of legal claims. Employers have a legitimate legal interest (and often a statutory duty under labor law) to maintain records of who applied and why hiring decisions were made for 1–3 years. Deleting the candidate's personal account and cloud resume files while preserving an anonymized application record satisfies privacy laws without compromising employer liability defenses.

#### 5. Concrete Code & Policy Deliverables
* In \`AdminUserRepository.softDelete\` and user self-deletion services:
  1. Call Supabase Storage API to permanently delete all uploaded files in \`resumes/<userId>/\`.
  2. Overwrite \`Profile.phone\`, \`Profile.bio\`, \`Profile.location\`, and \`Profile.fullName\` with \`"[Deleted User]"\`.
  3. Rename \`User.email\` to \`u_<id>@deleted.invalid\` (freeing the email for re-registration).
  4. Preserve \`Application.id\`, \`status\`, \`appliedAt\`, and \`employerNotes\` for the employer's historical pipeline view.
* In **Candidate Privacy Policy (§7.1)**: Disclose clearly: *"Upon account deletion, your profile, resumes, and personal identifiers are permanently destroyed. Anonymized records of past job applications are retained for employer regulatory compliance."*

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

### D13 — Subject Access Requests (SAR) & Recruiter Private Notes

#### 1. Context & Technical Facts
In \`jobfit-backend/src/modules/application\`, the \`Application\` model contains an \`employerNotes\` column (\`schema.prisma\` line 954), where recruiters record internal interview assessments, candidate weaknesses, compensation impressions, and disqualification rationales.
Under GDPR Article 15 and international privacy laws, individuals have the right to obtain a copy of all personal data concerning them processed by a platform (Subject Access Request - SAR). If a rejected candidate submits a SAR, recruiters expect their internal notes to remain strictly confidential. If JobFit discloses these notes, recruiters face embarrassment or labor disputes; if JobFit withholds them, candidates may file privacy complaints.

#### 2. Decision Options
* **Option A (Confidential Recruiter Work Product Exemption):** Legally classify \`employerNotes\` as confidential employer internal evaluation data exempt from candidate SAR disclosure.
* **Option B (Full Candidate Transparency):** Permit candidates to inspect all data associated with their applications, including recruiter notes and stage history.
* **Option C (Dual-Layer Segregation):** Distinguish between factual application timelines (disclosable) and subjective recruiter interview deliberations (redacted work product).

#### 3. Comparative Evaluation
| Dimension | Option A — Confidential Work Product (Recommended) | Option B — Full Transparency | Option C — Dual-Layer Segregation |
|---|---|---|---|
| **Legal Definition** | Internal business deliberation records exempt from personal data SAR. | Open-book recruitment records accessible under unconditional SAR. | Objective telemetry is disclosable; subjective notes are privileged. |
| **Pros** | Protects recruiter candor; prevents platform abandonment by employers. | Radical candidate transparency; eliminates regulatory non-compliance claims. | Balanced compromise between candidate rights and employer confidentiality. |
| **Cons** | Privacy regulators in certain EU jurisdictions may challenge total note redaction. | Devastating to recruiter trust; recruiters will stop writing notes on JobFit. | Complex redaction logic required when compiling user data export files. |
| **Technical Implementation** | Exclude \`employerNotes\` from \`GET /users/me/export\` and candidate DTOs. | Include all application rows and notes directly in candidate export JSON. | Include stage timestamps and status; redact raw \`employerNotes\` text. |
| **Code Impact** | Ensure candidate serializers never project \`employerNotes\`. | Expose \`employerNotes\` in \`ApplicationResponseDto\`. | Build dedicated \`DataExportService\` filtering out recruiter work product. |

#### 4. Recommended Strategy & Rationale
**Option A (implemented via the mechanics of Option C) is recommended.** Recruiter notes represent the proprietary internal thought process and work product of the hiring company, not personal data authored by the candidate. Disclosing raw interview commentary (e.g., *"candidate appeared nervous"*, *"salary expectation too high"*) would destroy employer confidence in JobFit. By law, SAR exports should provide the candidate's submitted materials, status history, and match scores, while strictly redacting private recruiter notes.

#### 5. Concrete Code & Policy Deliverables
* In \`DataExportService\`: Ensure that candidate data exports include \`jobTitle\`, \`companyName\`, \`status\`, and \`appliedAt\`, but strictly omit \`Application.employerNotes\`.
* In **Employer Master Services Agreement (§8.3)**: Guarantee to employers: *"Internal recruiter notes, interview evaluations, and stage feedback recorded within JobFit are treated as confidential employer work product and are not disclosed to candidates in routine data requests."*
* In **Candidate Privacy Policy (§8.2)**: Clarify that Subject Access Requests cover candidate-provided data and objective application records, excluding confidential third-party recruiter deliberations.

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

## Domain 4: Offline PWA, Local Storage & Multi-Device Security

---

### D14 — PWA Offline Storage, Dexie IndexedDB & Shared Device Exposure

#### 1. Context & Technical Facts
As documented in \`PWA_OFFLINE_AUDIT.md\`, \`jobfit-frontend\` is a Progressive Web App (PWA) powered by a Serwist service worker and a client-side Dexie IndexedDB database named \`jobfits-offline\`.
To provide a fast offline experience, IndexedDB caches:
- Candidate profile details, contact information, and resumes.
- User application records, tracked job cards, and interview notes.
- In-flight un-synced user mutations in a \`pendingActions\` queue.
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
| **Technical Implementation** | Hook \`authStore.logout()\` to \`db.delete()\` / \`db.tables.forEach(t => t.clear())\`. | Wrap Dexie table hooks with WebCrypto AES-GCM encrypt/decrypt routines. | Add toggle to login form; pass flag to skip Dexie persistent caching. |
| **Code Impact** | Add clean-up routines in \`use-auth.ts\` and \`offline-sync.service.ts\`. | Heavy architectural refactor of \`jobfits-offline\` Dexie schema and hooks. | Update login form DTO, auth store, and service worker caching rules. |

#### 4. Recommended Strategy & Rationale
**Option A combined with Option C is recommended.** Encrypting IndexedDB in the browser creates excessive performance latency and failure modes for PWA background sync. Instead, implementing a mandatory, robust client-side purge routine that completely empties IndexedDB upon logout, coupled with an explicit "Public Computer" toggle that forces in-memory storage, provides exemplary security and satisfies privacy duty-of-care standards.

#### 5. Concrete Code & Policy Deliverables
* In \`jobfit-frontend/src/features/auth/use-auth.ts\`: Guarantee that \`logout()\` systematically calls \`db.delete()\` to wipe \`jobfits-offline\` completely.
* In **Login UI**: Add an option: *"This is a shared / public computer"* (disabling persistent IndexedDB caching for that session).
* In **Job Seeker Terms of Service (§3.3)**: Instruct users: *"When accessing JobFit from shared or public computers, you must log out completely and close all browser windows to ensure your locally cached resume data is erased."*

#### 6. Management Decision
\`[ ] Option A + C (Recommended)    [ ] Option B    [ ] Option C Only\`  
*Decision Notes:* __________________________________________________

---

### D15 — Offline Sync Conflicts, Batch Mutations & Idempotency

#### 1. Context & Technical Facts
JobFit enables candidates to perform actions while offline (e.g., editing profile details, updating tracked job stages, drafting cover letters). In \`jobfit-backend/src/modules/sync\`, offline actions are queued in Dexie (\`pendingActions\`) and posted to \`POST /sync/batch\` or \`POST /sync/delta\` upon reconnection (\`PWA_SYNC_API.md\`).
To prevent duplicate execution (such as submitting two applications to the same job during a network flutter), the backend enforces an \`IdempotencyKey\` mechanism (\`schema.prisma\` line 1546). However, if a candidate updates their profile offline on a phone while simultaneously editing it on a laptop, synchronization conflicts emerge. Handling these conflicts incorrectly can result in lost job applications or corrupted user profile data.

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
| **Technical Implementation** | Maintain existing \`IdempotencyKey\` validation and \`delta.ts\` timestamp sweeps. | Return HTTP 409 Conflict with server snapshot; client renders diff modal. | Rewrite sync engine using Automerge or Yjs CRDT frameworks. |
| **Code Impact** | Existing backend code in \`sync.service.ts\` and \`batch.service.ts\`. | New conflict DTOs, frontend resolution dialogs, and rollback queues. | Complete rewrite of frontend Dexie schema and backend ORM models. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** JobFit is an individual career navigation tool, not a multi-user collaborative document editor like Google Docs. True multi-device concurrent conflicts represent less than 0.1% of mobile/desktop sync events. Server-authoritative Last-Write-Wins backed by client-generated idempotency keys provides 100% protection against duplicate submissions while keeping the user experience seamless.

#### 5. Concrete Code & Policy Deliverables
* In **Job Seeker Terms of Service (§5.4 — Offline Transactions & Synchronization)**: Specify that in the event of conflicting updates across multiple devices, the server's processed timestamp shall be authoritative and governing.
* In \`IdempotencyKeyService\`: Ensure that critical actions (e.g., job applications, offer acceptances) carry a 24-hour idempotent cache lifetime to prevent duplicate state transitions.

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

### D16 — Default Resume vs. Application-Specific Submitted Snapshot

#### 1. Context & Technical Facts
In \`MENTOR_REVIEW_2026-08-18.md\` §5, engineering resolved a critical defect regarding resume resolution:
- Previously, screening evaluated the user's *current default resume*, meaning if a candidate applied with a "Designer CV" and later set their default to "Developer CV", the recruiter screened the wrong document.
- As resolved in August 2026, \`Application.resumeId\` is now **fixed at the moment of submission** (\`application.service.ts\` line 81).
- Screening (\`ApplicationScreeningService.screen()\`) evaluates that exact submitted resume.
- However, \`MatchingEmbeddingService\` maintains only **one vector per user profile** (\`profiles.embedding\`), and the learning path (\`LearningPathService\`) legitimately evaluates the candidate's active CV to recommend next skills.
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
| **Cons** | Candidate cannot update outdated contact information without re-applying. | Candidate profile edits might confuse recruiters mid-interview. | High state machine complexity (\`ApplicationStage\` resets). |
| **Technical Implementation** | \`Application\` references immutable \`resumeId\` and snapshots contact details. | Recruiter views join live \`Profile\` table directly on every page load. | Add \`PATCH /applications/:id/update-resume\` with recruiter webhook. |
| **Code Impact** | Existing architecture verified in August 2026 post-mortem. | Revert August 2026 fix; expose live profile joins. | Add new application command handler, event, and notification listeners. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** In recruitment law and dispute resolution, an employer must be able to prove exactly what document and credentials were evaluated when a hiring or rejection decision was made. If candidate profiles dynamically mutate after submission, employers cannot establish an auditable record of their decision-making basis. The immutable snapshot model implemented in August 2026 is legally superior.

#### 5. Concrete Code & Policy Deliverables
* In **Job Seeker Terms of Service (§6.2)**: Clarify: *"When you submit an application, a frozen snapshot of your selected resume and profile is transmitted to the employer. Updates to your JobFit profile will not alter previously submitted applications."*
* In **Employer Terms of Service (§5.3)**: Inform employers that application views reflect the candidate's qualifications as submitted at the timestamp recorded on the application.

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________
`;
