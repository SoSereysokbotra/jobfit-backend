# JobFits Updated ER Diagram - Simplified Scope
**Version 2.0 - 4 New Tables Only** | July 2026

---

## Key Changes

**From 8 new tables → 4 new tables (-50% database complexity)**

Removed tables (pushed to Phase 2+):
- ❌ job_quality_flags (job moderation)
- ❌ recommendation_metrics (quality tracking)
- ❌ resume_parsing_issues (resume issues)
- ❌ company_admins (team invitations)

Kept tables (simplified):
- ✅ system_events (health monitoring)
- ✅ email_events (delivery tracking)
- ✅ audit_logs (basic logging)
- ✅ application_stage_history (Phase 2)

---

## Simplified Schema

### 1. EXTEND users Table

```sql
ALTER TABLE users ADD COLUMN (
  role ENUM('CANDIDATE', 'EMPLOYER', 'ADMIN') DEFAULT 'CANDIDATE',
    -- Simplified: single admin role (no hierarchy)
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL
    -- Nullable: for employer & admin users only
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_company_id ON users(company_id);
```

**Why Simplified:**
- Single `ADMIN` role (no super-admin, content-moderator, support tiers)
- No role-based permissions matrix
- All admins have equal access

---

### 2. EXTEND companies Table

```sql
ALTER TABLE companies ADD COLUMN (
  is_verified BOOLEAN DEFAULT false,
    -- Company ownership verified
  verification_method ENUM('email_domain', 'admin_review') DEFAULT 'email_domain',
    -- Simple: two methods only (removed 'documents')
  verified_at TIMESTAMP
    -- When verification completed
);

CREATE INDEX idx_companies_verified ON companies(is_verified);
```

**Why Simplified:**
- Only email domain + manual admin review
- No document upload flow

---

### 3. EXTEND applications Table

```sql
ALTER TABLE applications ADD COLUMN (
  reviewed_by_employer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Which employer reviewed this
  employer_notes TEXT
    -- Simple text notes only (Phase 2)
);

CREATE INDEX idx_applications_reviewed_by_employer ON applications(reviewed_by_employer_id);
```

---

### 4. EXTEND jobs Table

```sql
ALTER TABLE jobs ADD COLUMN (
  posted_by_employer_id UUID REFERENCES users(id) ON DELETE SET NULL
    -- Phase 2: if posted by employer (null = external job)
);

CREATE INDEX idx_jobs_posted_by_employer ON jobs(posted_by_employer_id);
```

---

## NEW Tables (4 Only)

### Table 1: system_events

```sql
CREATE TABLE system_events (
  id UUID PRIMARY KEY,
  event_type ENUM(
    'health_check',
    'api_latency_high',
    'error_rate_high',
    'queue_backed_up',
    'email_delivery_low',
    'database_error'
  ) NOT NULL,
  severity ENUM('info', 'warning', 'critical') DEFAULT 'info',
  message TEXT NOT NULL,
  details JSONB,
    -- Structured data: latency_ms, error_count, etc.
  acknowledged_at TIMESTAMP,
  acknowledged_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_system_events_severity ON system_events(severity);
CREATE INDEX idx_system_events_created_at ON system_events(created_at DESC);
```

**Purpose:** Real-time platform health alerts

**Example Alert:**
```json
{
  "event_type": "api_latency_high",
  "severity": "warning",
  "message": "API latency above threshold",
  "details": {
    "endpoint": "POST /api/applications",
    "latency_ms": 1250,
    "threshold_ms": 1000
  },
  "created_at": "2026-07-10 14:30:00"
}
```

---

### Table 2: email_events

```sql
CREATE TABLE email_events (
  id UUID PRIMARY KEY,
  recipient_email VARCHAR(255) NOT NULL,
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  event_type ENUM(
    'sent',
    'delivered',
    'bounced_soft',
    'bounced_hard',
    'complained',
    'unsubscribed'
  ) NOT NULL,
  reason TEXT,
    -- For bounces: why it bounced
  external_event_id VARCHAR(255),
    -- SendGrid/SES event ID
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_events_recipient ON email_events(recipient_email);
CREATE INDEX idx_email_events_created_at ON email_events(created_at DESC);
CREATE INDEX idx_email_events_event_type ON email_events(event_type);
```

**Purpose:** Track email delivery from SendGrid/SES webhooks

**Example Events:**
```
1. Email sent → event_type: 'sent'
2. SendGrid delivers → event_type: 'delivered'
3. OR SendGrid bounces → event_type: 'bounced_hard', reason: "Invalid recipient"
```

---

### Table 3: audit_logs

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type ENUM(
    'user_reset_password',
    'user_account_deleted',
    'user_unlocked',
    'email_suppressed'
  ) NOT NULL,
  resource_type ENUM('user', 'email', 'system') NOT NULL,
  resource_id UUID,
    -- user_id or email id
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

**Purpose:** Basic tracking of admin actions for compliance

**Example Log:**
```json
{
  "admin_id": "admin-456",
  "action_type": "user_reset_password",
  "resource_type": "user",
  "resource_id": "user-789",
  "created_at": "2026-07-10 14:30:00"
}
```

**Not Tracking (Phase 2):**
- old_value / new_value
- IP address
- Detailed reason field

---

### Table 4: application_stage_history (Phase 2)

```sql
CREATE TABLE application_stage_history (
  id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  previous_stage ENUM('applied', 'interview', 'offer', 'hired', 'rejected'),
  new_stage ENUM('applied', 'interview', 'offer', 'hired', 'rejected') NOT NULL,
  moved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_app_stage_history_application_id ON application_stage_history(application_id);
CREATE INDEX idx_app_stage_history_created_at ON application_stage_history(created_at DESC);
```

**Purpose:** Track how applications move through employer pipeline

**Example:**
```
Application 123 → Applied (auto)
Application 123 → Interview (employer moved, 2026-07-05)
Application 123 → Offer (employer moved, 2026-07-10)
Application 123 → Hired (employer moved, 2026-07-12)
```

---

## Complete SQL Migration Script

```sql
-- MIGRATION: Simplified Admin & Employer Support

-- 1. Extend users table
ALTER TABLE users ADD COLUMN (
  role ENUM('CANDIDATE', 'EMPLOYER', 'ADMIN') DEFAULT 'CANDIDATE',
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_company_id ON users(company_id);

-- 2. Extend companies table
ALTER TABLE companies ADD COLUMN (
  is_verified BOOLEAN DEFAULT false,
  verification_method ENUM('email_domain', 'admin_review'),
  verified_at TIMESTAMP
);

CREATE INDEX idx_companies_verified ON companies(is_verified);

-- 3. Extend applications table
ALTER TABLE applications ADD COLUMN (
  reviewed_by_employer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  employer_notes TEXT
);

CREATE INDEX idx_applications_reviewed_by_employer ON applications(reviewed_by_employer_id);

-- 4. Extend jobs table
ALTER TABLE jobs ADD COLUMN (
  posted_by_employer_id UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_jobs_posted_by_employer ON jobs(posted_by_employer_id);

-- 5. Create system_events table
CREATE TABLE system_events (
  id UUID PRIMARY KEY,
  event_type ENUM(
    'health_check', 'api_latency_high', 'error_rate_high',
    'queue_backed_up', 'email_delivery_low', 'database_error'
  ) NOT NULL,
  severity ENUM('info', 'warning', 'critical') DEFAULT 'info',
  message TEXT NOT NULL,
  details JSONB,
  acknowledged_at TIMESTAMP,
  acknowledged_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_system_events_severity ON system_events(severity);
CREATE INDEX idx_system_events_created_at ON system_events(created_at DESC);

-- 6. Create email_events table
CREATE TABLE email_events (
  id UUID PRIMARY KEY,
  recipient_email VARCHAR(255) NOT NULL,
  notification_id UUID REFERENCES notifications(id) ON DELETE SET NULL,
  event_type ENUM(
    'sent', 'delivered', 'bounced_soft', 'bounced_hard',
    'complained', 'unsubscribed'
  ) NOT NULL,
  reason TEXT,
  external_event_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_events_recipient ON email_events(recipient_email);
CREATE INDEX idx_email_events_created_at ON email_events(created_at DESC);
CREATE INDEX idx_email_events_event_type ON email_events(event_type);

-- 7. Create audit_logs table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type ENUM(
    'user_reset_password', 'user_account_deleted', 'user_unlocked',
    'email_suppressed'
  ) NOT NULL,
  resource_type ENUM('user', 'email', 'system') NOT NULL,
  resource_id UUID,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_admin_id ON audit_logs(admin_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- 8. Create application_stage_history table (Phase 2)
CREATE TABLE application_stage_history (
  id UUID PRIMARY KEY,
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  previous_stage ENUM('applied', 'interview', 'offer', 'hired', 'rejected'),
  new_stage ENUM('applied', 'interview', 'offer', 'hired', 'rejected') NOT NULL,
  moved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_app_stage_history_application_id ON application_stage_history(application_id);
CREATE INDEX idx_app_stage_history_created_at ON application_stage_history(created_at DESC);
```

---

## Database Scope Summary

| Item | Before | After | Change |
|------|--------|-------|--------|
| New Tables | 8 | 4 | -50% |
| Modified Tables | 5 | 4 | -20% |
| Total Indexes | 30+ | 12+ | -60% |
| Enum Values | 50+ | 20 | -60% |
| Complexity | High | Low | Much simpler |

---

## Migration Checklist

- [ ] Backup production database
- [ ] Test migration on staging
- [ ] Verify all existing data intact
- [ ] Check index performance
- [ ] Test rollback procedure
- [ ] Deploy during low-traffic window
- [ ] Monitor error rates post-deployment
- [ ] Confirm admin features working
- [ ] Verify email tracking live

---

## Performance Notes

**Small scope = better performance:**
- Fewer tables = simpler queries
- Basic audit logging = low write overhead
- email_events indexed well = fast lookup
- system_events limited = low storage

**Expected performance:**
- Admin dashboard load: <2 seconds
- User search: <1 second
- Email tracking lookup: <500ms

---

## Why This Simplified Schema Is Better

1. **Less to maintain** - 4 tables vs 8
2. **Easier to understand** - Clear purpose for each table
3. **Fewer migration risks** - Less to coordinate
4. **Better performance** - Simpler queries
5. **Easier to extend** - Phase 2 additions straightforward
6. **Team can focus** - On getting MVP right vs overengineering

---

**Document Version:** 2.0 Simplified  
**Date:** July 2026  
**Migration Effort:** ~2-4 hours (with testing)
