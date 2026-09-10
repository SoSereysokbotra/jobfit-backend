// scratch/sections_domain7_8.js
module.exports = `
## Domain 7: Commercial Tiers, Billing, IP & Platform Content

---

### D25 — Subscription Tier Alignment & Feature Entitlement Enforcement

#### 1. Context & Technical Facts
In \`MENTOR_REVIEW_2026-08-18.md\` §2, §10 and the codebase, engineering exposed an architectural naming discrepancy:
- Database schema: \`enum SubscriptionTier { FREE, PREMIUM, PROFESSIONAL }\` (\`schema.prisma\` line 55).
- Frontend marketing and pricing table: \`Free ($0)\`, \`Pro ($19/mo)\`, \`Enterprise ($49/mo)\` (\`pricing.constants.ts\`).
- Entitlement enforcement: \`EntitlementService\` (\`jobfit-backend/src/modules/user/application/services/entitlement.service.ts\`) checks:
  \`hasPaidPlan() => account?.subscriptionTier === 'PREMIUM' || account?.subscriptionTier === 'PROFESSIONAL'\`.
- Gated features: AI Cover Letter generation, AI Interview Coaching, detailed ATS suggestions in Resume Builder, advanced match report exports.
If the commercial contracts and Stripe checkout describe "Pro" and "Enterprise", while the backend database stores "PREMIUM" and "PROFESSIONAL", legal ambiguity exists regarding what specific features each tier legally guarantees.

#### 2. Decision Options
* **Option A (Reconcile Code and Legal Tiers via Schema Migration):** Migrate \`SubscriptionTier\` in Prisma to match the public marketing terms: \`FREE\`, \`PRO\`, \`ENTERPRISE\`.
* **Option B (Codify Binding Mapping Table in Legal Agreements):** Retain current database enums; include an explicit definition table in the Commercial Terms stating: \`"Pro" corresponds to PREMIUM, and "Enterprise" corresponds to PROFESSIONAL\`.
* **Option C (Simplify to Binary Tiers):** Collapse platform tiers into two simple legal categories: \`STANDARD (Free)\` and \`JOBFIT_PRO (Paid)\`.

#### 3. Comparative Evaluation
| Dimension | Option A — Schema Migration to Pro/Enterprise | Option B — Binding Mapping Table (Recommended) | Option C — Binary Tiers |
|---|---|---|---|
| **Legal Definition** | Complete 1:1 linguistic parity between code, UI, and contract. | Contractual definition bridging technical taxonomy with commercial copy. | Simplified dual-tier commercial licensing model. |
| **Pros** | Eliminates all developer and customer confusion; pristine codebase. | Zero code changes; zero risk of breaking active database migrations. | Drastically simplifies entitlement rules across frontend and backend. |
| **Cons** | Requires a database migration on a populated PostgreSQL enum column. | Slight inelegance in legal contract drafting. | Removes the 3-tier price discrimination architecture. |
| **Technical Implementation** | Run Prisma migration renaming enum values across all tables. | Draft Definitions section in Terms of Sale with explicit mapping. | Update \`SubscriptionTier\` to \`FREE / PRO\`; refactor controllers. |
| **Code Impact** | Migration script affecting \`User\` and \`auth-cache\` keys. | None. Documentation only. | Refactor \`EntitlementService\` and frontend pricing tables. |

#### 4. Recommended Strategy & Rationale
**Option B is recommended** for immediate launch, transitioning to Option A during the next scheduled database maintenance window. The database mapping is fully encapsulated inside \`EntitlementService\`, which already treats \`PREMIUM\` and \`PROFESSIONAL\` as equivalent paid entitlements. Legally defining in the Terms of Sale that "Pro corresponds to database tier PREMIUM" provides complete enforceability without risking database migration locks.

#### 5. Concrete Code & Policy Deliverables
* In **Commercial Terms of Sale (§1.1 — Tier Definitions)**: Formally declare: *"References to 'JobFit Pro' correspond to the technical tier identifier PREMIUM, and references to 'JobFit Enterprise' correspond to PROFESSIONAL."*
* In **Entitlement Feature Matrix**: Clearly publish the exact limits per tier: Free (basic matching, 3 cover letters/mo); Pro (unlimited matching, 30 AI generations/mo, full ATS suggestions); Enterprise (multi-seat recruiter access, candidate scout alerts).

#### 6. Management Decision
\`[ ] Option A    [ ] Option B (Recommended)    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

### D26 — Payment Gateway Integration & Subscription Billing Terms

#### 1. Context & Technical Facts
In \`MENTOR_REVIEW_2026-08-18.md\` §10, engineering confirmed the operational reality of payments:
- \`PaymentService\` is currently an empty class (\`class PaymentService {}\`).
- \`StripeAdapter.createSubscription\` returns \`''\`.
- \`PaymentController\` has no active routes.
- The only way a user currently attains \`PREMIUM\` is through manual admin grant (\`PATCH /admin/users/:id/subscription\`).
- However, \`jobfit-frontend\` contains a Stripe billing checkout hook (\`src/features/payment/api/payment.api.ts\`), and Cambodia heavily relies on local mobile payments (Bakong KHQR, ABA PayWay).
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
| **Technical Implementation** | Wire Stripe webhooks (\`invoice.paid\`, \`customer.subscription.deleted\`). | Implement Stripe webhooks + Bakong KHQR transaction verification API. | Keep \`PaymentService\` stubbed; grant tiers via admin panel. |
| **Code Impact** | Complete implementation of \`payment\` module in backend. | Substantial engineering across \`payment\` module and webhooks. | None on backend. |

#### 4. Recommended Strategy & Rationale
**Option B is recommended** for the production launch. In Cambodia, consumers overwhelmingly pay via mobile banking apps scanning Bakong KHQR codes (prepaid fixed duration), whereas international users prefer auto-recurring credit card billing via Stripe. Designing legal terms that explicitly accommodate both auto-renewing subscriptions (Stripe) and non-renewing 30-day prepaid access passes (Bakong KHQR) reflects the reality of the market and maximizes conversion.

#### 5. Concrete Code & Policy Deliverables
* In **Terms of Sale (§3 — Payment Methods & Renewals)**:
  - Clause 3.1 (Stripe): Credit card subscriptions auto-renew monthly until cancelled via account settings.
  - Clause 3.2 (Bakong KHQR): Mobile QR purchases grant 30, 90, or 365 days of prepaid access with no auto-renewal.
* In **Refund Policy (§4.2)**: Digital service access is activated immediately. A 14-day refund is honored only if zero AI generations (\`cover_letter\`, \`interview\`) were consumed during the billing cycle.

#### 6. Management Decision
\`[ ] Option A    [ ] Option B (Recommended)    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

### D27 — Resume Builder Intellectual Property & Template Ownership

#### 1. Context & Technical Facts
JobFit provides an interactive Resume Builder (\`jobfit-backend/src/modules/resume-builder\`):
- Manages structured resume documents (\`ResumeDocument\`), experience, education, skills, and projects (\`schema.prisma\` lines 1616–1830).
- Renders ATS-optimized PDF documents via \`resume-pdf.renderer.ts\` and \`resume-export.service.ts\`.
- Provides pre-designed visual styling templates (\`ResumeTemplate\`) and color presets (\`color-presets.ts\`).
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
| **Technical Implementation** | Draft clear IP clauses in Job Seeker Terms of Service. | Legal assignment clause in Terms of Service. | Inject footer in \`resume-pdf.renderer.ts\`: *"Built with JobFit.com"*. |
| **Code Impact** | None on backend. | None. | Modify PDF canvas drawing commands in \`resume-pdf.renderer.ts\`. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** Dual-ownership is the universal legal standard for creative software tools. JobFit must protect its proprietary layout designs, CSS typography systems, and template structures (\`ResumeTemplate\`) from being copied or commercialized by rival recruitment platforms. Granting the candidate an unrestricted, perpetual license to use the exported PDF for any job search purpose provides total legal freedom to the user without compromising JobFit's core design IP.

#### 5. Concrete Code & Policy Deliverables
* In **Job Seeker Terms of Service (§10.1 — Intellectual Property & License)**: Formally declare: *"JobFit retains all rights, title, and interest in its software, templates, styling designs, and PDF layout structures. You retain full ownership of your personal career narrative and are granted a perpetual, royalty-free, irrevocable license to export, print, and distribute your generated resume for any personal employment purpose."*
* In \`ResumeExportService\`: Ensure exported PDFs include standard document metadata tagging author and generator attributes cleanly.

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

### D28 — Salary Intelligence, Percentile Benchmarking & Antitrust Compliance

#### 1. Context & Technical Facts
In \`jobfit-backend/src/modules/salary/salary.service.ts\`, JobFit computes real-time compensation intelligence for candidates and recruiters:
- \`getSalary(company, role)\` queries all \`PUBLISHED\` internal postings for that company, calculating:
  - 25th percentile (\`p25\`), 50th percentile (\`p50\`), 75th percentile (\`p75\`), and average total compensation.
- The service renders actionable negotiation tips: \`"Aim for $500–$800/mo based on 12 market data points."\`
- In \`MENTOR_REVIEW_2026-08-18.md\` §12, engineering resolved salary formatting defects by introducing \`salaryCurrency\` and \`salaryPeriod\` (\`ANNUAL\` vs \`MONTHLY\`).
Under antitrust and competition laws (including US FTC wage-fixing guidelines and Article 56 of the Cambodian Law on Competition), exchanging confidential, non-public wage information among competing employers can be scrutinized as **unlawful wage-fixing or compensation coordination**. Furthermore, companies may object to JobFit publicly exposing their internal salary bands.

#### 2. Decision Options
* **Option A (Public Aggregation Safe Harbor with Antitrust Disclaimers):** Generate salary statistics strictly from publicly advertised job postings (never confidential payroll data). Require a minimum threshold of data points ($N \\ge 5$) before displaying company-specific percentiles, and publish explicit wage-benchmarking disclaimers.
* **Option B (Industry-Wide Aggregation Only):** Suppress company-specific compensation breakdowns; calculate salary percentiles strictly across broad industry and occupational categories (e.g., *"Mid-Level Software Engineer in Phnom Penh"*).
* **Option C (Opt-In Employer Compensation Benchmarking):** Permit employers to opt out of public salary intelligence reporting on their company profiles.

#### 3. Comparative Evaluation
| Dimension | Option A — Minimum Data Threshold + Disclaimers (Recommended) | Option B — Industry-Wide Aggregation Only | Option C — Employer Opt-Out |
|---|---|---|---|
| **Legal Definition** | Public factual aggregation with statistical privacy thresholds. | Generalized macroeconomic compensation intelligence. | Voluntary publisher participation framework. |
| **Pros** | Highly engaging candidate feature; completely legal as data is drawn from public ads. | Zero risk of employer corporate complaints; immune from antitrust inquiry. | Avoids friction with large corporate recruiters who demand pay confidentiality. |
| **Cons** | Small companies with 1–2 postings may object to compensation visibility. | Removes the compelling feature of looking up specific target company pay. | Creates data gaps in the salary intelligence database. |
| **Technical Implementation** | In \`salary.service.ts\`, return \`null\` if \`mids.length < 5\` for company-level queries. | Refactor query to group by \`role\` and \`industry\`, ignoring \`companyId\`. | Add \`hideSalaryIntel: Boolean\` to \`Company\` model and filter queries. |
| **Code Impact** | Add guard \`if (rows.length < 5) return null;\` in \`salary.service.ts\`. | Modify \`fetchSalaryRows\` to aggregate across industry cohorts. | Add column in \`Company\` schema and toggle in employer settings. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** Compensation figures derived exclusively from publicly published job listings do not constitute illegal wage-fixing, because the information was already placed in the public domain by the employers themselves. Enforcing a minimum data threshold of $N \\ge 5$ postings ensures statistical anonymization and prevents an employer's single posting from being singled out unfairly.

#### 5. Concrete Code & Policy Deliverables
* In \`salary.service.ts\` line 38: Add a statistical threshold check:
  \`if (rows.length < 3) return null;\` (or fall back to role-wide averages across all companies).
* In **Salary Intelligence UI**: Display a persistent disclaimer: *"Compensation benchmarks are statistical estimates calculated from publicly advertised job listings on JobFit. Actual compensation is determined independently by employers."*
* In **Employer Terms of Service (§5.4)**: Clarify that salary figures included in public job postings may be aggregated into platform-wide compensation benchmarks.

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
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
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________

---

### D30 — Bilingual Supremacy, Khmer Consumer Protection & Language Discrepancies

#### 1. Context & Technical Facts
In \`MENTOR_REVIEW_2026-08-18.md\` §19, engineering identified a fundamental reality of JobFit's deployment:
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
| **Code Impact** | Add internationalization routing for \`/legal/*\` routes in \`jobfit-frontend\`. | None. English text only. | Requires full Khmer localization of legal route content. |

#### 4. Recommended Strategy & Rationale
**Option A is recommended.** Under Cambodian Consumer Protection Law, attempting to enforce an English-only clause against a Cambodian job seeker will likely fail in local dispute proceedings. By providing high-quality, professional Khmer translations for Candidate Terms and the Privacy Policy—while maintaining English supremacy for technical B2B Employer Agreements—JobFit ensures flawless domestic consumer protection compliance and institutional credibility.

#### 5. Concrete Code & Policy Deliverables
* In **Job Seeker Terms & Privacy Policy**: Include dual-language provisions: *"This document is executed in both Khmer and English. For domestic consumers in the Kingdom of Cambodia, the Khmer version reflects statutory consumer rights; for international interactions, the English text is authoritative."*
* In **Frontend Routing**: Provide full Khmer translations for \`/terms\`, \`/privacy\`, and \`/extension-privacy\` accessible via the existing language switcher.

#### 6. Management Decision
\`[ ] Option A (Recommended)    [ ] Option B    [ ] Option C\`  
*Decision Notes:* __________________________________________________
`;
