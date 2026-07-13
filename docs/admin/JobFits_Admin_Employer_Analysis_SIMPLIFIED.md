# JobFits Admin & Employer Module Analysis - Simplified Scope
**Version 2.0 - Reduced to 6 Core Features** | July 2026

---

## Overview

**Scope Reduction: 11 features → 6 core features (-45%)**

This is the simplified version focusing on MVP essentials only.

---

## Part 1: Admin Module - 3 Core Features (MVP)

### Feature 1: System Health Monitoring & Alerting

**Description:**  
Dashboard showing real-time system metrics and automated alerts for critical issues.

**Why Essential:**
- Visibility into platform health (you won't know if it's broken until users complain)
- Monitor: API latency, uptime, database performance, email delivery rate
- Essential for SLA compliance (99.5% uptime target)

**Dashboard Shows:**
```
Status: 99.8% Uptime
├─ API Latency: 145ms (avg p99)
├─ Database CPU: 32%
├─ Active Users: 245 concurrent
├─ Job Queue: 234 pending
└─ Email Delivery: 99.4%

Alerts:
├─ 🔴 CRITICAL: (none right now)
├─ 🟡 WARNING: (none right now)
└─ ℹ️ INFO: (none right now)
```

**Admin Actions:**
- View metrics over time (1h, 24h, 7d)
- Acknowledge alerts
- Basic monitoring dashboard

**Database Needed:**
- `system_events` table (simple alert log)

**API Requirements:**
- GET /api/admin/system/health
- GET /api/admin/system/metrics?period=1h|24h|7d
- GET /api/admin/system/alerts
- POST /api/admin/system/alerts/:id/acknowledge

---

### Feature 2: User Management

**Description:**  
Search, view, and manage candidate accounts. Support user assistance and compliance.

**Why Essential:**
- Users will forget passwords, need account help
- Support team needs tools to assist
- GDPR requires ability to delete user data on request

**Admin Capabilities:**
```
Search: by email, name, signup date range

User Detail View:
├─ Account: email, signup date, last login
├─ Profile: name, location, applications count
├─ Actions:
│  ├─ [Reset Password] - Send reset email
│  ├─ [Unlock Account] - If locked after failed login attempts
│  └─ [Delete Account] - GDPR soft delete
```

**Database Needed:**
- Use existing: users, applications, resumes

**API Requirements:**
- GET /api/admin/users?email=X (search)
- GET /api/admin/users/:id (view details)
- POST /api/admin/users/:id/reset-password
- POST /api/admin/users/:id/unlock
- DELETE /api/admin/users/:id (GDPR soft delete)

---

### Feature 3: Email Delivery Tracking

**Description:**  
Track email delivery status and manage bounced addresses.

**Why Essential:**
- Emails are critical for user engagement
- Bounced emails = users miss important notifications
- Visibility into delivery issues (SendGrid/SES)
- Can suppress bad addresses

**Admin Sees:**
```
Last 24 hours:
├─ Sent: 1,234 emails
├─ Delivered: 1,227 (99.4%)
└─ Bounced: 7 (0.6%)

Bounced Emails:
├─ john@oldjob.com - Hard bounce (invalid)
├─ jane@company.com - Soft bounce (temporary)
└─ Actions: [Retry] [Suppress]
```

**Database Needed:**
- `email_events` table (webhook from SendGrid/SES)

**API Requirements:**
- GET /api/admin/email/metrics
- GET /api/admin/email/bounces
- POST /api/admin/email/suppress?email=X

---

## Admin Authentication (Simplified)

**Login:**
- Email + password (no 2FA for MVP)
- 60-minute JWT session
- Logout

**Authorization:**
- Check: is user admin?
- If yes: allow access
- If no: return 403

**Database:**
- Extend users table: add role enum (CANDIDATE | EMPLOYER | ADMIN)
- No role hierarchy (all admins = same permissions)

**API Requirements:**
- POST /api/admin/login
- POST /api/admin/logout

---

## Admin Audit Logging (Basic)

**Track:**
- Admin ID
- Action type (reset_password, delete_user, suppress_email, unlock_user)
- Resource (user_id, email)
- Timestamp

**Not tracked (Phase 2+):**
- old_value / new_value
- IP address
- Detailed reason

**Database:**
- `audit_logs` table (simple version)

**API:**
- GET /api/admin/audit-logs (view)

---

## Part 2: Employer Module - 3 Core Features (Phase 2)

### Feature 1: Company Profile Management

**Description:**  
Employers claim/verify their company.

**Why Essential (Phase 2):**
- Companies want control over branding
- Verification prevents impersonation
- Foundation for job posting

**Onboarding:**
```
1. Search company ("TechCorp")
2. Claim company
3. Email domain verification (user@techcorp.com)
4. Company profile (logo, description)
5. Ready to post jobs
```

**Database:**
- Extend `companies` table: add is_verified, verification_method, verified_at

**API:**
- POST /api/companies/claim
- POST /api/companies/:id/verify-email
- PATCH /api/companies/:id

---

### Feature 2: Job Posting

**Description:**  
Employers post jobs directly to platform.

**Why Essential (Phase 2):**
- Gives employers incentive to use platform
- Increases job supply (more jobs = better recommendations)

**Job Creation:**
```
Form fields:
├─ Title, description, salary range
├─ Location, remote type
├─ Employment type (full-time, part-time)
├─ Skills (searchable autocomplete)
└─ Publish/draft/close workflow

Analytics:
├─ Views, applications
├─ Average match score
└─ Simple metrics
```

**Database:**
- Extend `jobs` table: add posted_by_employer_id

**API:**
- POST /api/employer/jobs (create)
- PATCH /api/employer/jobs/:id (edit)
- POST /api/employer/jobs/:id/publish
- GET /api/employer/jobs/:id/analytics

---

### Feature 3: Application Pipeline (Simplified)

**Description:**  
Employers track candidate progress through pipeline.

**Why Essential (Phase 2):**
- Core value: employers see candidates
- Simple workflow management

**Pipeline Stages:**
```
Applied → Interview → Offer → Hired

Employer sees:
├─ Kanban board (drag to move stage)
├─ Candidate name, match score
├─ Simple notes field
└─ Status transitions
```

**Not Included (Phase 2+):**
- Interview scheduling (use Calendly)
- Candidate messaging
- Offer calculator
- Track hired candidates

**Database:**
- Extend `applications` table: add employer_notes, reviewed_by_employer_id
- Create `application_stage_history` table

**API:**
- GET /api/employer/applications?job_id=X
- PATCH /api/employer/applications/:id/status
- POST /api/employer/applications/:id/notes

---

## Removed Features (Pushed to Phase 2+)

### Admin (3 Removed)
- ❌ **Job Quality Moderation** - Complex: auto-flagging, approval queue, merging duplicates
- ❌ **Admin Role Hierarchy** - Not needed: all admins have same permissions in MVP
- ❌ **Detailed Audit Logging** - Simplified: basic logging only, no old/new values or IP tracking

### Employer (5 Removed)
- ❌ **Team Member Invitations** - MVP: single admin account per company
- ❌ **Billing & Subscription** - Phase 3: revenue model not finalized
- ❌ **Interview Scheduling** - Use external tools (Calendly, Google Calendar)
- ❌ **Candidate Messaging** - Phase 2+: adds unnecessary complexity
- ❌ **Offer Calculator** - Too complex: simple form sufficient for MVP

---

## Database Schema (Simplified)

### New Tables (4 Only)

1. **system_events** - Health alerts
   - event_type, severity, message, created_at

2. **email_events** - Delivery tracking
   - recipient_email, event_type, created_at

3. **audit_logs** - Admin action log
   - admin_id, action_type, resource_id, created_at

4. **application_stage_history** - Pipeline tracking (Phase 2)
   - application_id, new_stage, moved_by_user_id, created_at

### Modified Tables (3 Only)

1. **users** - Add: role (enum), company_id (FK)
2. **companies** - Add: is_verified, verification_method, verified_at
3. **applications** - Add: employer_notes, reviewed_by_employer_id

### Total Scope
- **4 new tables** (vs 8 before: -50%)
- **3 modified tables** (vs 5 before: -40%)
- **12+ indexes** (vs 30+ before: -60%)

---

## Implementation Timeline

### Admin MVP (Weeks 1-3)

**Week 1: Planning & Design**
- Update SRS with 3 features
- Design ER Diagram
- Approve API spec

**Weeks 2-3: Development**
- Database migrations (4 tables)
- Backend APIs (14 endpoints)
- Frontend dashboard
- Testing & deployment

**Total:** 2-3 weeks | 1-2 developers

### Phase 2 Employer (3-4 weeks after MVP)

**Week 1: Company Profile**
- Claim flow
- Email verification
- Company dashboard

**Weeks 2-3: Job Posting & Pipeline**
- Job creation form
- Job list & analytics
- Application Kanban
- Status transitions

**Total:** 3-4 weeks | 1-2 developers

---

## API Count (Simplified)

### Admin APIs: 14 endpoints
```
Authentication:
- POST /api/admin/login
- POST /api/admin/logout

System Health (6 endpoints):
- GET /api/admin/system/health
- GET /api/admin/system/metrics
- GET /api/admin/system/alerts
- POST /api/admin/system/alerts/:id/acknowledge

User Management (5 endpoints):
- GET /api/admin/users (search)
- GET /api/admin/users/:id
- POST /api/admin/users/:id/reset-password
- POST /api/admin/users/:id/unlock
- DELETE /api/admin/users/:id

Email Tracking (3 endpoints):
- GET /api/admin/email/metrics
- GET /api/admin/email/bounces
- POST /api/admin/email/suppress

Audit Logs (1 endpoint):
- GET /api/admin/audit-logs
```

### Employer APIs: 9 endpoints (Phase 2)
```
Company (3 endpoints):
- POST /api/companies/claim
- POST /api/companies/:id/verify-email
- PATCH /api/companies/:id

Jobs (4 endpoints):
- POST /api/employer/jobs
- PATCH /api/employer/jobs/:id
- POST /api/employer/jobs/:id/publish
- GET /api/employer/jobs/:id/analytics

Applications (2 endpoints):
- GET /api/employer/applications
- PATCH /api/employer/applications/:id/status
```

**Total: 23 APIs** (vs 35+ before: -34% reduction)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Admin dashboard load | <2 seconds |
| User search response | <1 second |
| System uptime | 99.5% |
| Email delivery visibility | <5 min latency |
| Admin team satisfaction | >4/5 |
| Job posting time | <10 min |
| Employer onboarding | <15 min |

---

## Key Decisions

1. **Single admin role** - No hierarchy initially
2. **Basic audit logging** - No complex old/new value tracking
3. **Simple email tracking** - Webhook from SendGrid/SES only
4. **One company admin** - No team invitations in MVP
5. **External scheduling** - Use Calendly, don't build calendar tool
6. **Simple pipeline** - Drag-to-move status, no complex workflows

---

## Comparison: Original vs Simplified

| Aspect | Original | Simplified | Reduction |
|--------|----------|-----------|-----------|
| Admin features | 8 | 3 | -62% |
| Employer features | 4 | 3 | -25% |
| Database tables | 8 new | 4 new | -50% |
| Modified tables | 5 | 3 | -40% |
| API endpoints | 35+ | 23 | -34% |
| Admin dev time | 4-6 weeks | 2-3 weeks | -50% |
| Employer dev time | 6-8 weeks | 3-4 weeks | -50% |
| Total effort | 10-14 weeks | 5-7 weeks | -50% |

---

## Recommendation

**This simplified scope is MUCH BETTER for MVP launch:**
- ✅ Achievable in 2-3 weeks (not 6 weeks)
- ✅ Focus on quality vs quantity
- ✅ Ship MVP with confidence
- ✅ Get user feedback
- ✅ Build Phase 2 based on real needs

**Avoid over-engineering. Launch simple and iterate.**

---

**Document Version:** 2.0 Simplified  
**Date:** July 2026  
**Next Step:** Review with team and approve scope
