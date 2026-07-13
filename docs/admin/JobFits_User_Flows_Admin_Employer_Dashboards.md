# JobFits User Flows Guide - Admin & Employer Dashboards
**Document Version:** 2.1 (Simplified Scope)  
**Based on:** JobFits Admin & Employer Analysis  
**Last Updated:** July 2026  
**Status:** MVP Implementation Ready  
**Scope:** 6 Core Features (3 Admin + 3 Employer)

---

## Navigation Structure

### Admin Dashboard Sidebar (5 Sections)
```
┌─────────────────────────┐
│  JobFits Admin          │
│  [Logo]                 │
├─────────────────────────┤
│ 🏠 Dashboard            │
│ 👥 Users                │
│ 📊 System Health        │
│ 📧 Email Tracking       │
│ 🔐 Logout               │
└─────────────────────────┘
```

### Employer Dashboard Sidebar (5 Sections)
```
┌─────────────────────────┐
│  JobFits Employer       │
│  [Logo]                 │
├─────────────────────────┤
│ 🏢 Company Profile      │
│ 📋 Jobs                 │
│ 📝 Applications         │
│ 📊 Analytics            │
│ 🔐 Logout               │
└─────────────────────────┘
```

---

# PART 1: ADMIN DASHBOARD FLOWS

---

## Flow 1: Admin Login

### Screen: Login Page
```
┌────────────────────────────────────┐
│                                    │
│         JobFits Admin Login        │
│                                    │
│  Email:                            │
│  [________________________]         │
│                                    │
│  Password:                         │
│  [________________________]         │
│                                    │
│  [      LOG IN      ]              │
│                                    │
│  Forgot password? | Need help?     │
│                                    │
└────────────────────────────────────┘
```

### User Journey

**Step 1: Enter Credentials**
- Admin enters email
- Admin enters password
- Clicks [LOG IN]

**Step 2: Validation**
- System checks: valid email? ✓
- System checks: correct password? ✓
- System checks: is user admin role? ✓

**Step 3: Session Created**
- JWT token generated (60-minute expiry)
- Redirect to Dashboard

**Error Handling:**
- Email not found → "Email not registered"
- Wrong password → "Invalid password"
- Not admin role → "Access denied - not an admin account"
- Rate limit (5 attempts) → "Too many login attempts. Try again in 15 minutes"

**Success State:**
- Redirect to Dashboard
- Sidebar visible
- User sees: "Welcome, [Admin Name]"

---

### API Calls
```
POST /api/admin/login
├─ Body: { email, password }
├─ Returns: { token, expiresIn }
└─ Sets: JWT cookie (HTTP-only)
```

---

## Flow 2: Admin Dashboard (Main Hub)

### Screen: Dashboard Overview
```
┌────────────────────────────────────────────────────┐
│ Admin Dashboard          [Settings] [Logout]        │
├────────────────────────────────────────────────────┤
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ Uptime   │  │ API      │  │ Active   │          │
│  │ 99.8%    │  │ Latency  │  │ Users    │          │
│  │ ▲ +0.2%  │  │ 145ms    │  │ 245      │          │
│  └──────────┘  └──────────┘  └──────────┘          │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │ System Alerts (Last 24h)                      │  │
│  ├──────────────────────────────────────────────┤  │
│  │ ✓ All systems healthy                        │  │
│  │ • Last backup: 2 hours ago                   │  │
│  │ • Email delivery rate: 99.4%                 │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  Quick Actions:                                     │
│  [View All Alerts] [Reset Metrics] [Settings]      │
│                                                     │
└────────────────────────────────────────────────────┘
```

### User Journey

**Step 1: Dashboard Load**
- Page loads
- System calls:
  - GET /api/admin/system/health
  - GET /api/admin/system/metrics?period=24h
  - GET /api/admin/system/alerts

**Step 2: View Metrics**
- Uptime: 99.8% (green)
- API Latency: 145ms (green)
- Active Users: 245
- Email Delivery Rate: 99.4%

**Step 3: Review Alerts**
- If alerts exist: show in red/yellow
- If no alerts: show "All systems healthy"
- Each alert has: [Acknowledge] button

**Step 4: Navigation**
- Click sidebar to navigate to other sections
- Or click quick action buttons

---

### API Calls
```
GET /api/admin/system/health
├─ Returns: { uptime, api_latency, active_users, email_delivery_rate }
└─ Refresh: every 30 seconds

GET /api/admin/system/metrics?period=24h
├─ Returns: { time_series_data }
└─ For charts/graphs

GET /api/admin/system/alerts
├─ Returns: [ { alert_id, severity, message, created_at } ]
└─ Limit: 10 most recent

POST /api/admin/system/alerts/:id/acknowledge
├─ Body: {}
└─ Returns: { acknowledged_at, acknowledged_by }
```

---

## Flow 3: System Health Monitoring

### Screen: System Health Detailed View
```
┌────────────────────────────────────────────────────┐
│ System Health                                       │
├────────────────────────────────────────────────────┤
│                                                     │
│ Overall Status: 🟢 HEALTHY                          │
│ Last Updated: Just now                              │
│ [Auto-refresh ON] [Manual Refresh]                  │
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │ Performance Metrics                          │   │
│ ├──────────────────────────────────────────────┤   │
│ │ Uptime (Month):     99.8%  [████████░]       │   │
│ │ API Latency (p99):  145ms  [█░░░░░░░░]       │   │
│ │ Database CPU:       32%    [███░░░░░░]       │   │
│ │ Memory Usage:       54%    [█████░░░░]       │   │
│ │ Email Delivery:     99.4%  [████████░]       │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ ┌──────────────────────────────────────────────┐   │
│ │ Alerts (Last 24h)                            │   │
│ ├──────────────────────────────────────────────┤   │
│ │ ✓ All systems healthy                        │   │
│ │                                              │   │
│ │ Recent alerts (if any):                      │   │
│ │ None in last 24 hours                        │   │
│ └──────────────────────────────────────────────┘   │
│                                                     │
│ Period: [1h] [24h] [7d]                             │
│ [Show Chart]                                        │
│                                                     │
└────────────────────────────────────────────────────┘
```

### User Journey

**Step 1: Navigate to System Health**
- Admin clicks 📊 System Health in sidebar
- Page loads system metrics

**Step 2: View Metrics**
- Uptime: 99.8% (trend: ↑ +0.2%)
- API Latency: 145ms (green = < 500ms)
- Database CPU: 32% (green = < 80%)
- Memory: 54% (green = < 80%)
- Email Delivery: 99.4% (green = > 99%)

**Step 3: Review Alerts**
- Section shows: "All systems healthy"
- If alerts: list with severity color
- Each alert has: [Acknowledge] button

**Step 4: Change Time Period**
- Click [1h] [24h] [7d] tabs
- Data refreshes for selected period
- Chart updates

**Step 5: Optional - View Chart**
- Click [Show Chart]
- Time-series graph appears
- Shows trend over selected period

---

### API Calls
```
GET /api/admin/system/health
├─ Returns: {
│    uptime_percent: 99.8,
│    api_latency_ms: 145,
│    database_cpu_percent: 32,
│    memory_percent: 54,
│    email_delivery_rate: 99.4
│  }

GET /api/admin/system/metrics?period=24h
├─ Returns: {
│    timestamps: [1625097600, 1625098200, ...],
│    api_latency: [140, 145, 142, ...],
│    error_rate: [0.1, 0.2, 0.1, ...],
│    active_users: [200, 210, 220, ...]
│  }

GET /api/admin/system/alerts
├─ Returns: [
│    {
│      id: "alert-123",
│      type: "api_latency_high",
│      severity: "warning",
│      message: "API latency above threshold",
│      created_at: "2026-07-10T14:30:00Z",
│      acknowledged: false
│    }
│  ]

POST /api/admin/system/alerts/:id/acknowledge
└─ Returns: { acknowledged_at, acknowledged_by_id }
```

---

## Flow 4: User Management

### Screen: User List & Search
```
┌────────────────────────────────────────────────────┐
│ User Management                                     │
├────────────────────────────────────────────────────┤
│                                                     │
│ Search: [_______________________] [Search]          │
│ Filters: [Active] [Inactive] [Verified Email]      │
│                                                     │
│ Showing: 1-20 of 1,245 users                        │
│                                                     │
│ ┌────────────────────────────────────────────────┐ │
│ │ Name            Email               Last Login  │ │
│ ├────────────────────────────────────────────────┤ │
│ │ John Smith      john@example.com    2h ago      │ │
│ │ Jane Doe        jane@example.com    5m ago      │ │
│ │ Bob Johnson     bob@example.com     Yesterday   │ │
│ │ Alice Cooper    alice@example.com   3d ago      │ │
│ │                                                 │ │
│ └────────────────────────────────────────────────┘ │
│                                                     │
│ [< Previous] [1] [2] [3] ... [Next >]              │
│                                                     │
└────────────────────────────────────────────────────┘
```

### User Journey

**Step 1: Search Users**
- Admin enters email or name in search box
- Clicks [Search]
- System calls: GET /api/admin/users?email=X&offset=0&limit=20

**Step 2: View Results**
- List shows matching users with:
  - Name
  - Email
  - Last login time
  - Status (active/inactive)

**Step 3: Click User Row**
- Admin clicks on user row
- Navigate to User Detail view

---

### Screen: User Detail View
```
┌────────────────────────────────────────────────────┐
│ User Detail: John Smith                             │
│ [< Back]                                            │
├────────────────────────────────────────────────────┤
│                                                     │
│ Account Information                                 │
│ ├─ Name: John Smith                                │
│ ├─ Email: john@example.com                         │
│ ├─ Status: Active ✓                                │
│ ├─ Email Verified: Yes ✓                           │
│ ├─ Signup Date: Jan 15, 2026                       │
│ └─ Last Login: 2 hours ago                         │
│                                                     │
│ Profile Information                                 │
│ ├─ Location: San Francisco, CA                     │
│ ├─ Salary Expectation: $100K - $150K               │
│ ├─ Profile Completeness: 85%                       │
│ └─ Applications Submitted: 12                       │
│                                                     │
│ Resumes                                             │
│ ├─ Resume_v1.pdf (uploaded Jan 15)                 │
│ ├─ Resume_v2.pdf (uploaded Feb 1) [Current]        │
│ └─ [Download] [View Details]                       │
│                                                     │
│ Actions                                             │
│ [Reset Password] [Unlock Account] [Delete] [Close] │
│                                                     │
└────────────────────────────────────────────────────┘
```

### User Journey (Admin Actions)

**Step 1: Search & Select User**
- Search for user (see previous flow)
- Click user row → User Detail view

**Step 2: View Profile**
- Admin sees:
  - Account info (email, status, last login)
  - Profile info (location, salary expectations)
  - Resumes uploaded
  - Applications count

**Step 3: Take Action**

**Option A: Reset Password**
- User forgot password
- Admin clicks [Reset Password]
- Confirmation dialog: "Send reset email to john@example.com?"
- Confirmation: Yes
- System sends reset email
- Toast: "Password reset email sent"
- Log entry in audit_logs

**Option B: Unlock Account**
- User account locked after failed login attempts
- Admin clicks [Unlock Account]
- Confirmation: "Unlock account for John Smith?"
- Account unlocked immediately
- User can now log in
- Log entry in audit_logs

**Option C: Delete Account (GDPR)**
- Admin clicks [Delete]
- Warning modal:
  ```
  ⚠️ WARNING - This action cannot be undone
  
  This will:
  - Mark account as deleted
  - Anonymize personal data
  - Archive all applications & resumes
  - Send confirmation email to user
  
  Type "DELETE" to confirm:
  [________________________]
  
  [Cancel] [Confirm Delete]
  ```
- Admin types "DELETE"
- Click [Confirm Delete]
- System:
  1. Soft delete user (mark deleted_at timestamp)
  2. Anonymize: email → deleted_[timestamp]@deleted.jobfits
  3. Archive applications & resumes
  4. Send confirmation email to original email
  5. Log entry in audit_logs
- Toast: "Account deleted successfully"

---

### API Calls
```
GET /api/admin/users?email=john&offset=0&limit=20
├─ Returns: [
│    {
│      id, email, name, last_login,
│      email_verified, created_at, status
│    }
│  ]

GET /api/admin/users/:id
├─ Returns: {
│    id, email, name, location, salary_expectation,
│    profile_completeness, applications_count,
│    resumes: [ { id, filename, uploaded_at } ],
│    last_login, created_at, deleted_at
│  }

POST /api/admin/users/:id/reset-password
├─ Body: {}
├─ Sends email with reset link
└─ Returns: { success: true }

POST /api/admin/users/:id/unlock
├─ Body: {}
├─ Clears login_failure_count
└─ Returns: { unlocked_at }

DELETE /api/admin/users/:id
├─ Body: {}
├─ Soft delete (GDPR compliant)
└─ Returns: { deleted_at }
```

---

## Flow 5: Email Delivery Tracking

### Screen: Email Metrics Dashboard
```
┌────────────────────────────────────────────────────┐
│ Email Delivery Tracking                             │
│ Period: Last 24 hours [1d] [7d] [30d]              │
├────────────────────────────────────────────────────┤
│                                                     │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐             │
│ │ SENT     │ │ DELIVERED│ │ BOUNCED  │             │
│ │ 1,234    │ │ 1,227    │ │ 7        │             │
│ │ emails   │ │ (99.4%)  │ │ (0.6%)   │             │
│ └──────────┘ └──────────┘ └──────────┘             │
│                                                     │
│ Email Type Breakdown:                               │
│ ├─ Recommendation digest: 567 sent, 99.6% delivered│
│ ├─ Application updates: 345 sent, 99.1% delivered  │
│ ├─ Interview reminders: 234 sent, 100% delivered   │
│ ├─ Offer notifications: 88 sent, 100% delivered    │
│ └─ Password resets: 45 sent, 100% delivered        │
│                                                     │
│ Recent Bounces:                                     │
│ ┌────────────────────────────────────────────────┐ │
│ │ Email              Type      Reason   Actions   │ │
│ ├────────────────────────────────────────────────┤ │
│ │ john@oldjob.com    Hard      Invalid   [Suppress]│
│ │ jane@company.com   Soft      Temp      [Retry]   │
│ │ bob@test.com       Hard      Invalid   [Suppress]│
│ └────────────────────────────────────────────────┘ │
│                                                     │
│ Chart: Delivery Rate Trend (Last 7 Days)           │
│                                                     │
└────────────────────────────────────────────────────┘
```

### User Journey

**Step 1: Navigate to Email Tracking**
- Admin clicks 📧 Email Tracking in sidebar
- Page loads with last 24h data

**Step 2: View Metrics**
- Sent: 1,234 emails
- Delivered: 1,227 (99.4%) - green
- Bounced: 7 (0.6%) - yellow

**Step 3: Review Email Types**
- Breakdown by type (recommendations, applications, etc.)
- Delivery rate for each type

**Step 4: Handle Bounced Emails**

**Hard Bounces (Permanent):**
- Email: john@oldjob.com
- Reason: "Invalid recipient"
- Admin actions:
  - [Suppress] → Add to suppression list
  - Confirmation: "This email will never receive emails"
  - Toast: "Email suppressed"
  - Next attempt to send: email_events shows "suppressed"

**Soft Bounces (Temporary):**
- Email: jane@company.com
- Reason: "Mailbox temporarily unavailable"
- Admin actions:
  - [Retry] → Resend email
  - Confirmation: "Retry sending email?"
  - System retries immediately
  - Toast: "Email resent"

**Step 5: Change Time Period**
- Click [1d] [7d] [30d]
- Data refreshes
- Chart updates with trend

---

### API Calls
```
GET /api/admin/email/metrics?period=24h
├─ Returns: {
│    sent_count: 1234,
│    delivered_count: 1227,
│    bounced_count: 7,
│    delivery_rate: 99.4,
│    by_type: {
│      recommendations: { sent: 567, delivered: 564 },
│      applications: { sent: 345, delivered: 342 },
│      interviews: { sent: 234, delivered: 234 },
│      offers: { sent: 88, delivered: 88 },
│      password_resets: { sent: 45, delivered: 45 }
│    }
│  }

GET /api/admin/email/bounces?type=hard|soft
├─ Returns: [
│    {
│      id, recipient_email, event_type,
│      reason, bounced_at, action_taken
│    }
│  ]

POST /api/admin/email/suppress?email=john@oldjob.com
├─ Body: { reason: "hard_bounce" }
├─ Updates: email_suppressed = true
└─ Returns: { suppressed_at }

POST /api/admin/email/:eventId/retry
├─ Body: {}
├─ Resend email
└─ Returns: { retry_at }
```

---

# PART 2: EMPLOYER DASHBOARD FLOWS

---

## Flow 1: Employer Company Profile Setup

### Screen: Company Search & Claim
```
┌────────────────────────────────────────────────────┐
│ Set Up Your Company                                 │
│                                                     │
│ Step 1 of 3: Find Your Company                      │
├────────────────────────────────────────────────────┤
│                                                     │
│ Search for your company:                            │
│ [_____________________________] [Search]             │
│                                                     │
│ Results:                                            │
│ ┌────────────────────────────────────────────────┐ │
│ │ ☑ TechCorp Inc                                  │ │
│ │   2,500 employees | Technology | San Francisco  │ │
│ │   Logo [image]                                  │ │
│ │   [Select This Company]                         │ │
│ │                                                 │ │
│ │ ☐ TechCorp Solutions                            │ │
│ │   500 employees | Consulting | Boston           │ │
│ │   Logo [image]                                  │ │
│ │   [Select This Company]                         │ │
│ │                                                 │ │
│ │ ☐ TechCorp Labs                                 │ │
│ │   100 employees | Research | Cambridge          │ │
│ │   Logo [image]                                  │ │
│ │   [Select This Company]                         │ │
│ │                                                 │ │
│ │ [Don't see your company? Create new]            │ │
│ └────────────────────────────────────────────────┘ │
│                                                     │
└────────────────────────────────────────────────────┘
```

### User Journey

**Step 1: Search for Company**
- Employer enters "TechCorp Inc"
- Clicks [Search]
- System returns matching companies

**Step 2: Select Company**
- Employer finds their company
- Clicks [Select This Company]
- Proceed to Step 2 (Email Verification)

---

### Screen: Email Domain Verification
```
┌────────────────────────────────────────────────────┐
│ Set Up Your Company                                 │
│                                                     │
│ Step 2 of 3: Verify Your Company                   │
├────────────────────────────────────────────────────┤
│                                                     │
│ Selected Company: TechCorp Inc                      │
│ Logo: [________] (optional)                        │
│                                                     │
│ Email Domain Verification:                          │
│                                                     │
│ Enter an email address at your company domain:     │
│ [employer@techcorp.com] [Verify Email]             │
│                                                     │
│ We'll send a 6-digit verification code to this    │
│ email. Use it to confirm you work at TechCorp Inc. │
│                                                     │
│ [Already verified? Sign in with another account]   │
│                                                     │
└────────────────────────────────────────────────────┘
```

### User Journey (Email Verification)

**Step 1: Enter Company Email**
- Employer enters: employer@techcorp.com
- Clicks [Verify Email]

**Step 2: System Sends Code**
- Email sent to employer@techcorp.com
- Contains: 6-digit verification code
- Code valid for 30 minutes

**Step 3: Enter Verification Code**
```
┌────────────────────────────────────────────────────┐
│ Set Up Your Company                                 │
│                                                     │
│ Step 2 of 3: Verify Your Company                   │
├────────────────────────────────────────────────────┤
│                                                     │
│ Check your email (employer@techcorp.com)           │
│ Enter the 6-digit code:                             │
│                                                     │
│ [_] [_] [_] [_] [_] [_] [Verify]                   │
│                                                     │
│ Code expires in: 28 minutes                         │
│                                                     │
│ [Resend Code]                                       │
│                                                     │
└────────────────────────────────────────────────────┘
```

**Step 4: Code Verified**
- Employer enters code
- System verifies: matches code in database
- Proceed to Step 3 (Profile Setup)

---

### Screen: Company Profile Setup
```
┌────────────────────────────────────────────────────┐
│ Set Up Your Company                                 │
│                                                     │
│ Step 3 of 3: Complete Your Profile                 │
├────────────────────────────────────────────────────┤
│                                                     │
│ Company Name: TechCorp Inc                          │
│ Verification Status: ✓ Verified (Jan 15, 2026)    │
│                                                     │
│ Company Logo:                                       │
│ [Choose File] or [Drag & Drop]                      │
│ [Upload Logo]                                       │
│                                                     │
│ Company Description:                                │
│ [____________________________________________]    │
│ [____________________________________________]    │
│ [____________________________________________]    │
│                                                     │
│ Industries:                                         │
│ ☐ Technology ☑ Software ☐ Consulting               │
│ ☐ Services ☐ Other                                 │
│                                                     │
│ Company Size:                                       │
│ ☐ Startup (1-50) ☐ Small (51-200)                 │
│ ☑ Mid-Size (201-1000) ☐ Enterprise (1000+)        │
│                                                     │
│ Website: [https://techcorp.com]                     │
│                                                     │
│ [Cancel] [Save & Continue]                          │
│                                                     │
└────────────────────────────────────────────────────┘
```

### User Journey (Profile Setup)

**Step 1: Enter Company Info**
- Company name (auto-filled from previous step)
- Description: "Leading software company focused on AI"
- Industries: Software, Technology
- Company size: Mid-Size
- Website: https://techcorp.com

**Step 2: Upload Logo**
- Drag logo file or click [Choose File]
- System uploads to S3
- Preview shows logo

**Step 3: Save Profile**
- Click [Save & Continue]
- System calls: PATCH /api/companies/:id
- Redirect to: Employer Dashboard

---

### API Calls
```
POST /api/companies/search?q=TechCorp
├─ Returns: [
│    {
│      id, name, logo_url, size, location,
│      industries, verified
│    }
│  ]

POST /api/companies/:id/claim
├─ Body: { employer_email: "employer@techcorp.com" }
├─ Sends email with verification code
└─ Returns: { email_sent: true, code_expires_in: 1800 }

POST /api/companies/:id/verify-email
├─ Body: { code: "123456" }
├─ Verifies code matches
└─ Returns: { verified: true }

PATCH /api/companies/:id
├─ Body: {
│    logo_url, description, industries,
│    company_size, website
│  }
└─ Returns: { id, updated_at, verification_status }
```

---

## Flow 2: Job Posting

### Screen: Job List
```
┌────────────────────────────────────────────────────┐
│ My Jobs                                             │
│ [+ Create New Job]                                  │
├────────────────────────────────────────────────────┤
│                                                     │
│ Showing: 1-5 of 5 jobs                              │
│                                                     │
│ ┌────────────────────────────────────────────────┐ │
│ │ Title              Status    Posted    Apps    │ │
│ ├────────────────────────────────────────────────┤ │
│ │ Senior Software    Published  Jan 15    23     │ │
│ │ Engineer                                        │ │
│ │ [View] [Edit] [Close] [Archive]                │ │
│ │                                                 │ │
│ │ Product Manager    Draft      Jan 20    0      │ │
│ │ [View] [Edit] [Publish] [Delete]               │ │
│ │                                                 │ │
│ │ Data Scientist     Published  Dec 20    45     │ │
│ │ [View] [Edit] [Close] [Archive]                │ │
│ │                                                 │ │
│ └────────────────────────────────────────────────┘ │
│                                                     │
└────────────────────────────────────────────────────┘
```

### User Journey

**Step 1: View Job List**
- Employer navigates to 📋 Jobs
- Sees list of all posted jobs
- Shows: title, status, posted date, application count

**Step 2: Create New Job**
- Click [+ Create New Job]
- Navigate to Job Creation form

---

### Screen: Job Creation Form
```
┌────────────────────────────────────────────────────┐
│ Create New Job                                      │
│ Status: DRAFT (Save as Draft)                       │
├────────────────────────────────────────────────────┤
│                                                     │
│ Job Title:                                          │
│ [Senior Software Engineer]                          │
│                                                     │
│ Job Description:                                    │
│ [________________________________________]        │
│ [________________________________________]        │
│ [________________________________________]        │
│ [Rich Text Editor: Bold, Italic, Lists, etc.]     │
│                                                     │
│ Requirements:                                       │
│ [________________________________________]        │
│ [________________________________________]        │
│                                                     │
│ Salary Range:                                       │
│ Min: [$150,000] Max: [$190,000]                    │
│                                                     │
│ Location:                                           │
│ [San Francisco, CA] [Add Location]                 │
│                                                     │
│ Employment Type:                                    │
│ ☑ Full-time ☐ Part-time ☐ Contract ☐ Internship  │
│                                                     │
│ Remote Type:                                        │
│ ☐ On-site ☑ Hybrid ☐ Remote                        │
│                                                     │
│ Required Skills:                                    │
│ [Python ___] [SQL ___] [AWS ___] [+ Add Skill]     │
│                                                     │
│ Experience Level:                                  │
│ ☐ Entry ☐ Mid ☑ Senior ☐ Lead                    │
│                                                     │
│ [Preview] [Save Draft] [Publish]                   │
│                                                     │
└────────────────────────────────────────────────────┘
```

### User Journey (Job Creation)

**Step 1: Fill Out Job Details**
- Title: "Senior Software Engineer"
- Description: "We're looking for a talented engineer..."
- Requirements: "5+ years experience, strong Python skills"
- Salary: $150K - $190K
- Location: San Francisco, CA
- Full-time, Hybrid
- Skills: Python, SQL, AWS
- Experience: Senior

**Step 2: Save as Draft** (Option A)
- Click [Save Draft]
- Status: DRAFT
- Job not visible to candidates yet
- Employer can edit later

**Step 3: Publish Job** (Option B)
- Click [Publish]
- Confirmation: "Publish job and make visible to candidates?"
- Job becomes visible in candidate job search
- Candidates can apply
- Status: PUBLISHED
- Posted date recorded

---

### Screen: Job Detail & Analytics
```
┌────────────────────────────────────────────────────┐
│ Senior Software Engineer                            │
│ Status: Published | Posted: Jan 15, 2026            │
│ [Edit] [Close] [Archive] [Back]                     │
├────────────────────────────────────────────────────┤
│                                                     │
│ Job Information                                     │
│ ├─ Title: Senior Software Engineer                 │
│ ├─ Location: San Francisco, CA                     │
│ ├─ Salary: $150K - $190K                           │
│ ├─ Type: Full-time, Hybrid                         │
│ └─ Skills: Python, SQL, AWS                        │
│                                                     │
│ Analytics                                           │
│ ├─ Views: 456 (↑ 12 today)                         │
│ ├─ Applications: 23 (↑ 2 today)                    │
│ ├─ Apply Rate: 5% (views → applies)                │
│ ├─ Avg Match Score: 82%                            │
│ └─ Last Updated: 2 hours ago                       │
│                                                     │
│ Recent Applicants                                   │
│ ┌────────────────────────────────────────────────┐ │
│ │ Candidate Name    Match  Applied   Actions    │ │
│ ├────────────────────────────────────────────────┤ │
│ │ John Smith        92%    1h ago    [View]     │ │
│ │ Jane Doe          87%    3h ago    [View]     │ │
│ │ Bob Johnson       78%    Yesterday [View]     │ │
│ │                                                 │ │
│ │ [View All 23 Applicants]                       │ │
│ └────────────────────────────────────────────────┘ │
│                                                     │
│ Actions                                             │
│ [Close Job] [Archive] [Edit Job] [Duplicate]       │
│                                                     │
└────────────────────────────────────────────────────┘
```

### User Journey (View Job Analytics)

**Step 1: Click on Job**
- From job list, click job row
- Job detail page loads

**Step 2: Review Analytics**
- Views: 456 (↑ 12 new today)
- Applications: 23 (↑ 2 new today)
- Apply rate: 5%
- Avg match score: 82%

**Step 3: Review Recent Applicants**
- See top 3 most recent applicants
- Match score for each
- Click [View All 23 Applicants] to see full list

**Step 4: Close/Archive Job** (Optional)
- Click [Close Job]
- Confirmation: "Stop accepting applications?"
- Job status: CLOSED
- No new applications accepted
- Existing applicants still visible

---

### API Calls
```
POST /api/employer/jobs
├─ Body: {
│    title, description, requirements, salary_min,
│    salary_max, location, employment_type,
│    remote_type, required_skills, experience_level
│  }
├─ Creates job with status: DRAFT
└─ Returns: { job_id, status, created_at }

GET /api/employer/jobs
├─ Returns: [
│    {
│      id, title, status, posted_at,
│      application_count, views
│    }
│  ]

PATCH /api/employer/jobs/:id
├─ Body: { title, description, ... (any field) }
└─ Returns: { id, updated_at }

POST /api/employer/jobs/:id/publish
├─ Body: {}
├─ Status: DRAFT → PUBLISHED
└─ Returns: { published_at }

GET /api/employer/jobs/:id/analytics
├─ Returns: {
│    views, applications, apply_rate,
│    avg_match_score, recent_applicants
│  }
```

---

## Flow 3: Application Pipeline Management

### Screen: Application List/Kanban
```
┌──────────────────────────────────────────────────────┐
│ Applications                                          │
│ Filter: [All Jobs ▼] [All Stages ▼]                 │
├──────────────────────────────────────────────────────┤
│                                                       │
│ View: [List] [Kanban ▼]                              │
│                                                       │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐         │
│ │ APPLIED    │ │ INTERVIEW  │ │ OFFER      │         │
│ │ (5)        │ │ (3)        │ │ (1)        │         │
│ ├────────────┤ ├────────────┤ ├────────────┤         │
│ │            │ │            │ │            │         │
│ │ ┌────────┐ │ │ ┌────────┐ │ │ ┌────────┐ │         │
│ │ │John    │ │ │ │Jane    │ │ │ │Bob     │ │         │
│ │ │92%     │ │ │ │87%     │ │ │ │85%     │ │         │
│ │ │1h ago  │ │ │ │Applied │ │ │ │Applied │ │         │
│ │ │[View]  │ │ │ │5d ago  │ │ │ │2d ago  │ │         │
│ │ │        │ │ │ │[View]  │ │ │ │[View]  │ │         │
│ │ └────────┘ │ │ └────────┘ │ │ └────────┘ │         │
│ │            │ │            │ │            │         │
│ │ ┌────────┐ │ │ ┌────────┐ │ └────────────┘         │
│ │ │Alice   │ │ │ │Charlie │ │                        │
│ │ │78%     │ │ │ │80%     │ │ ┌────────────┐         │
│ │ │3h ago  │ │ │ │Applied │ │ │ HIRED      │         │
│ │ │[View]  │ │ │ │3d ago  │ │ │ (2)        │         │
│ │ │        │ │ │ │[View]  │ │ ├────────────┤         │
│ │ └────────┘ │ │ └────────┘ │ │            │         │
│ │            │ │            │ │ ┌────────┐ │         │
│ │ [+3 more]  │ │            │ │ │David   │ │         │
│ └────────────┘ └────────────┘ │ │88%     │ │         │
│                                │ │[View]  │ │         │
│ Drag to move between stages   │ │        │ │         │
│                                │ └────────┘ │         │
│                                │            │         │
│                                └────────────┘         │
└──────────────────────────────────────────────────────┘
```

### User Journey (Kanban View)

**Step 1: View Applications**
- Employer clicks 📝 Applications
- Shows Kanban board with stages

**Step 2: Drag Application to Move Stage**
- Employer sees "Jane Doe" in APPLIED column (87% match)
- Employer wants to move to INTERVIEW
- Drag card from APPLIED → INTERVIEW
- System updates: application_stage_history logged
- Confirmation toast: "Moved Jane Doe to Interview stage"

**Step 3: Click Application for Details**
- Click on "John Smith" card (92% match)
- Navigate to Application Detail view

---

### Screen: Application Detail
```
┌────────────────────────────────────────────────────┐
│ Application Detail: John Smith                      │
│ Job: Senior Software Engineer | [← Back]            │
│ Status: APPLIED | Updated: 1h ago                   │
├────────────────────────────────────────────────────┤
│                                                     │
│ Candidate Information                               │
│ ├─ Name: John Smith                                │
│ ├─ Email: john@example.com                         │
│ ├─ Location: San Francisco, CA                     │
│ ├─ Availability: Immediately                       │
│ └─ LinkedIn: [View Profile]                        │
│                                                     │
│ Match Analysis                                      │
│ ├─ Overall Match: 92% ☑                            │
│ ├─ Skills: 95% match                               │
│ │  ✓ Python (5 yrs)                                │
│ │  ✓ SQL (4 yrs)                                   │
│ │  ✓ AWS (3 yrs)                                   │
│ │  ⚠ Kubernetes (not listed)                       │
│ ├─ Experience: 88% match (6 yrs as engineer)       │
│ └─ Location: 95% match (San Francisco)             │
│                                                     │
│ Submitted Materials                                 │
│ ├─ Resume: Resume_v2.pdf [Download] [View]         │
│ ├─ Cover Letter: "I'm very interested..."          │
│ └─ Applied: Jan 15, 2026 at 2:30 PM                │
│                                                     │
│ Stage Tracking                                      │
│ Current: APPLIED (1h ago)                           │
│ [Move to: [INTERVIEW ▼]]                            │
│                                                     │
│ Notes:                                              │
│ [Add notes about this application...]               │
│ [________________________________________]        │
│ [Save Notes]                                        │
│                                                     │
│ Actions                                             │
│ [Move to Interview] [Reject] [Message Candidate]   │
│ [Schedule Interview] (external tool)                │
│                                                     │
└────────────────────────────────────────────────────┘
```

### User Journey (Application Detail)

**Step 1: View Application**
- Click on application card
- See full details

**Step 2: Review Candidate**
- Name: John Smith
- Email: john@example.com
- Match: 92% (skills, experience, location all strong)
- Skills: Python ✓, SQL ✓, AWS ✓

**Step 3: Review Submitted Materials**
- Resume: Download/View
- Cover Letter: Read

**Step 4: Move to Next Stage**
- Click [Move to Interview]
- Dropdown: [INTERVIEW ▼]
- Confirm: "Move John Smith to Interview stage?"
- System logs to application_stage_history
- Candidate sees status update (optional notification)

**Step 5: Add Notes**
- Employer types: "Strong Python background, perfect fit for team"
- Click [Save Notes]
- Notes saved to applications.employer_notes

**Step 6: Reject Application** (Alternative)
- Click [Reject]
- Confirmation: "Reject John Smith's application?"
- Status: REJECTED
- Application moved out of pipeline
- Log entry created

---

### API Calls
```
GET /api/employer/applications?job_id=X&offset=0&limit=20
├─ Returns: [
│    {
│      id, candidate_name, match_score,
│      status, applied_at, job_id
│    }
│  ]

GET /api/employer/applications/:id
├─ Returns: {
│    id, candidate_name, email, location,
│    match_score, match_breakdown,
│    resume_url, cover_letter,
│    current_stage, applied_at,
│    employer_notes
│  }

PATCH /api/employer/applications/:id/status
├─ Body: { status: "interview" }
├─ Updates application_stage_history
└─ Returns: { updated_at, new_stage }

POST /api/employer/applications/:id/notes
├─ Body: { notes: "Great candidate..." }
└─ Returns: { updated_at }
```

---

# PART 3: UI/UX DESIGN STANDARDS

---

## Admin Dashboard Design

### Color Scheme
- Primary: Blue (alerts, CTAs)
- Success: Green (healthy metrics)
- Warning: Yellow (degraded service)
- Error: Red (critical issues)
- Neutral: Gray (inactive, secondary)

### Typography
- Heading: 18px, weight 500
- Body: 14px, weight 400
- Small: 12px, weight 400
- Mono: 12px (for code, errors)

### Components
- Button: Min width 120px, padding 8px 16px
- Input: Full width of container, min height 40px
- Card: 12px border radius, shadow 0 2px 8px rgba(0,0,0,0.1)
- Badge: 4px border radius, padding 4px 8px

---

## Employer Dashboard Design

Same design system as Admin (consistency)

### Additional Components
- Kanban card: Draggable, 240px width
- Form: Multi-step with progress indicator
- Rich text editor: Full toolbar, 300px min height

---

# PART 4: RESPONSIVE DESIGN

All dashboards responsive:
- Desktop: 1024px+ (full features)
- Tablet: 768px-1023px (simplified Kanban)
- Mobile: <768px (list view only, no Kanban)

---

# PART 5: ACCESSIBILITY

- All buttons: min 44px clickable area
- Color not only method to convey info (icon + text)
- ARIA labels on inputs
- Focus states visible
- Keyboard navigation supported

---

**Document Version:** 2.1  
**Status:** Ready for Design & Development  
**Next Step:** Create wireframes & high-fidelity mockups based on these flows
