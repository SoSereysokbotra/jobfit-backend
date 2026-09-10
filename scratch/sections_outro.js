// scratch/sections_outro.js
module.exports = `
# 4. Engineering Action Items & Compliance Roadmap

Prior to the public publication of the JobFit Legal Suite, engineering must complete the following implementation tasks to ensure that production code strictly reflects the adopted legal policies:

| Priority | Component | Associated Decision | Engineering Deliverable | Target Repository | Verification Method |
|---|---|---|---|---|---|
| 🔴 **P0** | **AI Safety & Verbiage** | **D1, D2** | Replace prescriptive verdicts in \`match_reason_v2.txt\` (\`"clearly worth interviewing"\`) with objective alignment tiers (\`"comprehensive / partial / sparse"\`). | \`jobfits-ai-service\` | Inspect prompt output; run \`eval-generation.ts\`. |
| 🔴 **P0** | **Structural AI Boundary** | **D6, D7** | Remove \`cover_letter\` from \`KNOWN_TASKS\` in \`chat_router.py\`, locking candidate PII processing strictly to local Ollama models. | \`jobfits-ai-service\` | Run \`chat_router.spec.py\` asserting personal data never routes to DeepSeek. |
| 🔴 **P0** | **Shared Device PWA Hygiene** | **D14** | Ensure \`logout()\` in \`use-auth.ts\` completely wipes the Dexie \`jobfits-offline\` IndexedDB database to protect public terminal users. | \`jobfit-frontend\` | Verify IndexedDB is 100% empty after logout in Chrome DevTools. |
| 🟡 **P1** | **User Data Anonymization** | **D11, D12** | Wire Supabase Storage file deletion into \`AdminUserRepository.softDelete\`, ensuring physical PDF resumes are purged upon account closure. | \`jobfit-backend\` | Execute test soft-delete; verify Supabase S3 bucket file deletion. |
| 🟡 **P1** | **Recruiter CV Download Audit** | **D24** | Add \`RESUME_VIEWED\` to \`AuditActionType\` and log recruiter user ID whenever \`GET /employer/applications/:id/resume\` is called. | \`jobfit-backend\` | Run \`employer.controller.spec.ts\` asserting audit log entry generation. |
| 🟡 **P1** | **Salary Statistical Guard** | **D28** | Enforce a minimum threshold ($N \\ge 3$) in \`SalaryService.getSalary()\` before rendering company-specific percentile benchmarks. | \`jobfit-backend\` | Unit test asserting \`null\` return for companies with $<3$ salaried jobs. |
| 🟡 **P1** | **AI Degradation Telemetry** | **D8** | Verify that \`GenerationService\` emits \`generatedBy: 'template'\` on fallback and exempts the call from paid user quota decrements. | \`jobfit-backend\` | Run \`generation.service.spec.ts\` with mocked AI failure. |
| 🟢 **P2** | **Subject Access Export** | **D9, D13** | Deploy \`GET /users/me/export\` compiling user profile, resumes, and applications into a downloadable ZIP/JSON archive (redacting recruiter notes). | \`jobfit-backend\` | Test export endpoint with simulated candidate account. |
| 🟢 **P2** | **Extension Shadow DOM** | **D19** | Mount the extension floating badge inside a closed Shadow DOM root to prevent host DOM collisions and script detection. | \`jobfit-extension\` | Test on LinkedIn and Indeed in Chrome browser. |
| 🟢 **P2** | **Bilingual Legal Routing** | **D30** | Create localized Next.js legal routes (\`/terms\`, \`/privacy\`, \`/extension-privacy\`) supporting both Khmer and English language toggles. | \`jobfit-frontend\` | Verify language switching renders certified Khmer legal translations. |

---

# 5. Appendix: Code Reference Index

Every legal policy statement and decision in this framework is grounded in verified code artifacts across the four JobFit repositories:

### \`jobfit-backend\`
- **Prisma Data Models:** \`prisma/schema.prisma\` (\`User\`, \`Profile\`, \`Resume\`, \`Application\`, \`Offer\`, \`OfferMessage\`, \`SavedJob\`, \`TrackedJob\`, \`MatchLabel\`, \`AuditLog\`, \`SecurityEvent\`, \`IdempotencyKey\`, \`ResumeDocument\`).
- **Two-Dimensional Matching Logic:** \`src/modules/matching/domain/scoring/role-fit.calculator.ts\`, \`preference-fit.calculator.ts\`, \`two-dimensional-scoring.service.ts\`.
- **Screening & Resume Resolution:** \`src/modules/matching/application/services/application-screening.service.ts\`, \`src/modules/application/application.service.ts\`.
- **Salary Intelligence & Percentiles:** \`src/modules/salary/salary.service.ts\`, \`salary.dto.ts\`.
- **PWA Sync & Idempotency:** \`src/modules/sync/sync.service.ts\`, \`batch.service.ts\`, \`delta.ts\`.
- **GPU & AI Rate Limiting:** \`src/common/guards/ai-throttler.guard.ts\`, \`src/config/throttler.config.ts\`.
- **Entitlement & Subscription Tiers:** \`src/modules/user/application/services/entitlement.service.ts\`.
- **Employer Vetting & Company Claims:** \`src/modules/employer-request/employer-request.service.ts\`, \`src/modules/employer/application/services/employer.service.ts\`.
- **Admin Audit & Tombstone Deletion:** \`src/modules/admin/infrastructure/repositories/admin-user.repository.ts\`, \`audit-log.repository.ts\`.
- **Resume Builder & PDF Renderer:** \`src/modules/resume-builder/application/services/resume-pdf.renderer.ts\`, \`resume-export.service.ts\`.

### \`jobfits-ai-service\`
- **Multi-Provider Router & Privacy Boundary:** \`app/services/chat_router.py\`, \`chat_provider.py\`, \`deepseek_client.py\`, \`ollama_client.py\`.
- **AI Prompts & Screening Verdicts:** \`app/prompts/match_reason_v2.txt\`, \`resume_score.txt\`, \`cover_letter.txt\`, \`job_requirements_v1.txt\`.
- **Generative Services:** \`app/services/generate_service.py\`, \`job_requirements_service.py\`, \`resume_service.py\`.

### \`jobfit-frontend\`
- **PWA Service Worker & Offline Dexie Storage:** \`src/lib/offline/db.ts\` (\`jobfits-offline\`), \`src/features/auth/use-auth.ts\`.
- **Payment & Stripe Integration:** \`src/features/payment/api/payment.api.ts\`, \`pricing.constants.ts\`.
- **Job Tracker Kanban Board:** \`src/features/job-tracker/\`.
- **Resume Builder Workspace:** \`src/features/resume-builder/\`.
- **Offer & Negotiation Thread:** \`src/features/offer/\`.

### \`jobfit-extension\`
- **Manifest V3 Configuration & Host Permissions:** \`manifest.config.ts\`.
- **Extension Privacy Disclosures:** \`PRIVACY.md\`, \`docs/EXTENSION_PRIVACY_FACTS.md\`, \`docs/STORE_LISTING.md\`.
- **Injected DOM Content Scripts:** \`src/contentScript.ts\`, \`src/data/savedJobs.ts\`.

---

*Document End — JobFit Legal Decision Framework (30 Decisions).*
`;
