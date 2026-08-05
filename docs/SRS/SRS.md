JobFits: Software Requirements Specification (SRS)
Document Version: 2.0
Last Updated: July 2026
Status: In Development
Project: JobFits












Table of Contents
JobFits: Software Requirements Specification (SRS)	1
Table of Contents	1
Executive Summary	4
Core Value Proposition	4
Scope Definition	5
2.1 In Scope (MVP)	5
Core Features	5
Platform Specifications	5
User Types (MVP)	5
2.2 Not In Scope (MVP)	6
2.3 Phase 2 (Post-MVP)	6
User Requirements	6
3.1 Document Conventions	6
3.2 Product Perspective	6
A. JobFits Website	6
B. Chrome Extension	7
3.3 User Personas	7
Persona 1: Sarah - Active Job Seeker	7
Persona 2: Marcus - Passive Job Seeker	7
Persona 3: Alex - Career Changer	8
Persona 4: Nina - Recent Graduate	8
Functional Requirements	9
4.1 Authentication & Authorization	9
FR-AUTH-001: User Authentication	9
FR-AUTH-002: Authorization & Access Control	9
4.2 Candidate Profile Management	10
FR-PROFILE-001: Profile Creation & Management	10
FR-PROFILE-002: Experience Management	10
FR-PROFILE-003: Education Management	11
FR-PROFILE-004: Skills Management	11
FR-PROFILE-005: Certification Management	11
4.3 Resume Management	12
FR-RESUME-001: Resume Upload	12
FR-RESUME-002: Resume Parsing	12
FR-RESUME-003: Resume Optimization	13
FR-RESUME-004: ATS Compatibility Analysis	13
4.4 Job Data Management	14
FR-JOBS-001: Job Ingestion	14
FR-JOBS-002: Job Data Enrichment	15
FR-JOBS-003: Job Search	15
FR-JOBS-004: Job Filtering & Sorting	16
4.5 Job Recommendations	16
FR-RECS-001: Recommendation Generation	16
FR-RECS-002: Recommendation Explanation	17
FR-RECS-003: Recommendation Filtering & Sorting	17
FR-RECS-004: Recommendation Feedback	18
4.6 Applications	18
FR-APP-001: Apply for Job	18
FR-APP-002: Draft Applications	19
FR-APP-003: Application Tracking	19
FR-APP-004: Application Withdrawal	20
4.7 Saved Jobs	20
FR-SAVED-001: Save Jobs	20
FR-SAVED-002: Manage Saved Jobs	20
FR-SAVED-003: Saved Search Alerts	21
4.8 Notifications	21
FR-NOTIF-001: Email Notifications	21
FR-NOTIF-002: In-App Notifications	22
FR-NOTIF-003: Notification Preferences	22
4.9 Interview & Preparation	23
FR-INTERVIEW-001: Interview Prep Resources	23
FR-INTERVIEW-002: Interview Reminders	23
4.10 Salary Intelligence	24
FR-SALARY-001: Salary Benchmarks	24
FR-SALARY-002: Offer Analysis	24
Non-Functional Requirements	25
5.1 Performance	25
NFR-PERF-001: Page Load Times	25
NFR-PERF-002: API Response Times	25
NFR-PERF-003: Database Performance	26
NFR-PERF-004: Frontend Performance	26
NFR-PERF-005: Search Performance	26
5.2 Scalability	26
NFR-SCALE-001: Concurrent Users	26
NFR-SCALE-002: Data Growth	26
NFR-SCALE-003: Background Jobs	26
5.3 Security	26
NFR-SEC-001: Authentication Security	27
NFR-SEC-002: Data Encryption	27
NFR-SEC-003: Authorization	27
NFR-SEC-004: Compliance	27
NFR-SEC-005: Input Validation	27
NFR-SEC-006: Rate Limiting	27
5.4 Availability & Reliability	28
NFR-AVAIL-001: Uptime	28
NFR-AVAIL-002: Disaster Recovery	28
NFR-AVAIL-003: Monitoring & Alerting	28
NFR-AVAIL-004: Graceful Degradation	28
5.5 Usability	28
NFR-USAB-001: User Interface	28
NFR-USAB-002: Localization	29
NFR-USAB-003: Error Messages	29
NFR-USAB-004: Documentation	29
5.6 Maintainability	29
NFR-MAINT-001: Code Quality	29
NFR-MAINT-002: Logging & Observability	29
NFR-MAINT-003: Version Control	29
NFR-MAINT-004: Deployment	30
User Journeys	30
Journey 1: Signup → First Recommendation (Onboarding)	30
Journey 2: Finding a Job (Discovery → Application)	30
Journey 3: Tracking Application → Interview → Offer	30
Journey 4: Learning Missing Skills	31
Technical Architecture	31
7.1 Technology Stack	31
Backend	31
Frontend	32
AI Service	32
Database Schema	33
Entity-Relationship Diagram Overview	33
Deployment Architecture	34
8.1 Local Development Environment	34
8.2 Production Deployment	35
8.3 Deployment Locations	35
8.4 Production Request Flow	36
8.5 Why Ollama Uses Localhost	36
Backend Architecture	37
9.1 NestJS Modular Monolith	37
Folder Structure	37
Key Principles	38
Module Structure Example: Job Module	39
9.2 Supabase Integration	39
9.3 Scaling Roadmap	40
Frontend Architecture	40
10.1 Next.js App Router Structure	40
Design Principles	41
Full Folder Structure	41
10.2 State Management Strategy	43
10.3 Feature Example: Matching	44
10.4 Auth & Route Protection	44
10.5 Performance Optimizations	44
Conclusion	45












Executive Summary
JobFits is a next-generation job discovery and matching platform that helps job seekers find the best career opportunities based on their professional background, skills, and career preferences. Unlike traditional job boards that prioritize job listings, JobFits prioritizes personalized recommendations, transparent matching explanations, and comprehensive tools to support candidates throughout their job search journey.
Core Value Proposition
For Candidates:
Find better-matched jobs
Spend less time searching
Increase interview conversion rates
For Job Boards & Employers:
Access pre-qualified candidates
Reduce time-to-hire
For Market:
Reduce hiring friction
Improve outcomes for both sides
Scope Definition
2.1 In Scope (MVP)
Core Features
Candidate account management (signup, profile, onboarding)
Resume upload, parsing, and extraction
Job data ingestion from multiple sources
Job recommendation engine (rule-based → ML-based over time)
Job search and discovery
Application tracking
Saved jobs management
Email notifications
Basic interview preparation resources
ATS compatibility analysis
Resume optimization suggestions
Platform Specifications
Web Application: Responsive design, mobile-friendly
Backend API: REST architecture
Database: PostgreSQL
Search Engine: Elasticsearch
Job Queue: Background processing with asynchronous tasks
User Types (MVP)
Job Seekers: Primary candidates using the platform
Admin Users: JobFits team managing the system
2.2 Not In Scope (MVP)
Employer job posting
Employer candidate search/screening
Social features (referrals, networking)
Mobile native apps (web only)
Video interview tools
Advanced analytics dashboards
Salary comparison marketplace
Career coaching marketplace
2.3 Phase 2 (Post-MVP)
Employer/recruiter features (job posting, candidate search)
Skill learning path recommendations
Advanced employer analytics
User Requirements
3.1 Document Conventions
Key Definitions:
Term
Definition
User
Job seeker using JobFits
Admin
Administrator managing the system
Resume
User's CV containing education, skills, and experience
Match Score
AI-generated percentage indicating compatibility between resume and job posting
Chrome Extension
Browser extension analyzing job postings on supported job websites

3.2 Product Perspective
JobFits consists of two integrated components:
A. JobFits Website
The website allows users to:
Register and log in
Upload resumes
Receive AI-generated job recommendations
Search jobs
Save jobs
Track applications
Improve resumes
B. Chrome Extension
The Chrome Extension enhances users' experience while browsing job portals:
Detect job descriptions
Compare them with uploaded resume
Display compatibility scores
Highlight matching and missing skills
Save jobs
Redirect users to JobFits for more recommendations
Both systems communicate using secure REST APIs and share the same database.
3.3 User Personas
Persona 1: Sarah - Active Job Seeker
Background: Senior Software Engineer, 5 years experience
Motivation: Seeking new opportunity with growth potential

Pain Points:
Spends 10+ hours/week browsing multiple job boards
Most jobs aren't good fits
Unsure about salary expectations
Anxious about interviews
Key Needs:
Personalized recommendations (not all jobs)
Understanding why a job is a good fit
Resume tailoring advice
Interview preparation
Salary guidance
Persona 2: Marcus - Passive Job Seeker
Background: Product Manager, 8 years experience
Motivation: Open to new opportunities but not actively searching
Pain Points:
Doesn't want to spend time on job search
Only wants really good matches
Prefers to be approached with relevant opportunities
Key Needs:
High-quality recommendations only
Minimal setup required
Infrequent checking (1-2x per month)
One-click apply
Persona 3: Alex - Career Changer
Background: 3 years as product manager, transitioning to data science
Motivation: Changing careers, wants guidance
Pain Points:
Worried about gaps in technical skills
Unsure if background is relevant
Needs to learn new skills quickly
May need salary adjustment

Key Needs:
Skill gap identification
Learning resources
Entry/mid-level role recommendations
Realistic timeline expectations
Persona 4: Nina - Recent Graduate
Background: BS Computer Science, no professional experience
Motivation: First job search
Pain Points:
Overwhelmed by options
Unsure how to present self
Worried about skill gaps
Interview anxiety
Key Needs:
Entry-level position filtering
Resume help
Interview preparation
Mentorship/guidance
Functional Requirements
4.1 Authentication & Authorization
FR-AUTH-001: User Authentication
Description: System shall support multiple authentication methods for candidates
Requirements:
Email/password authentication with secure password hashing (bcrypt, minimum 10 rounds)
OAuth 2.0 with Google and LinkedIn providers
Email verification required before account activation
Password reset via email with token expiration (24 hours)
Session management: JWT tokens with 30-day expiration
Secure password requirements: minimum 8 characters, uppercase, lowercase, number, special character
Acceptance Criteria:
✓ Signup completes within 2 minutes
✓ Email verification prevents access until completed
✓ Password reset email arrives within 1 minute
✓ OAuth flow completes within 10 seconds
✓ Session valid for 30 days or until explicit logout
✓ All passwords hashed server-side
✓ No passwords ever logged or stored in plain text
FR-AUTH-002: Authorization & Access Control
Description: System shall enforce role-based access control
Requirements:
User roles: Candidate, Admin
Candidates can only access their own profile and data
Candidates cannot access other candidate profiles
Admin users can access system administration tools
API endpoints protected with authentication/authorization
Acceptance Criteria:
✓ Unauthenticated users cannot access protected pages
✓ Candidates cannot view other candidate profiles
✓ API returns 401 for missing auth, 403 for insufficient permissions
✓ Admin tools only accessible to admin users
4.2 Candidate Profile Management
FR-PROFILE-001: Profile Creation & Management
Requirements:
Profile sections: basic info, summary, contact, social links, experience, education, skills, certifications
Required fields on signup: name, email, password
Profile completeness tracking (0-100%)
Auto-save functionality with conflict resolution
Profile visibility toggle (public/private)
Acceptance Criteria:
✓ All profile fields editable
✓ Changes persisted to database
✓ Completeness % calculated correctly
✓ Public/private toggle controls visibility
✓ Profile loads within 2 seconds
✓ Concurrent edits handled gracefully
FR-PROFILE-002: Experience Management
Requirements:
Add/edit/delete job experiences
Fields: company, title, location, start date, end date, description, technologies
Current job indicated by optional end date
Experiences displayed in reverse chronological order
Acceptance Criteria:
✓ Can add unlimited experiences
✓ Start date required, end date optional
✓ Current role indicated correctly
✓ Descriptions support rich text formatting
✓ Changes reflected in recommendations immediately
✓ Can reorder experiences manually
FR-PROFILE-003: Education Management
Requirements:
Add/edit/delete education entries
Fields: institution, degree, field, graduation date, GPA (optional), honors, coursework
Graduation date or expected graduation required
Acceptance Criteria:
✓ Can add unlimited education entries
✓ Degree field has predefined options with other
✓ GPA validated (0.0-4.0)
✓ Date validation (not in future unless expected graduation)
✓ Changes reflected in recommendations
FR-PROFILE-004: Skills Management
Requirements:
Add/edit/remove skills
Proficiency levels: Beginner (0-1 yr), Intermediate (1-3 yrs), Advanced (3-5 yrs), Expert (5+ yrs)
Skills matched to standardized skill taxonomy
Skills searchable (autocomplete from database)
Up to 50 skills per candidate
Skills reorderable by importance
Acceptance Criteria:
✓ Can add skills via search/autocomplete
✓ Proficiency level required
✓ Skills persisted and retrievable
✓ Skill suggestions shown from resume
✓ Can reorder skills
✓ Skill changes reflected in recommendations within 1 hour
✓ Skill taxonomy contains skills
FR-PROFILE-005: Certification Management
Requirements:
Add/edit/delete certifications
Fields: certification name, issuer, issue date, expiry date, credential ID, credential URL
Expiry date optional (some certs don't expire)
Acceptance Criteria:
✓ Can add unlimited certifications
✓ Issue date required, expiry date optional
✓ Dates validated
✓ Can link to credential verification URL
✓ Expired certs indicated visually
✓ Non-expired certs used in matching
4.3 Resume Management
FR-RESUME-001: Resume Upload
Description: System shall allow candidates to upload resumes in multiple formats
Requirements:
Supported formats: PDF, DOCX, DOC
Maximum file size: 10MB
Drag-and-drop and file picker both supported
Multiple resumes per candidate (up to 5)
One resume designated as "primary"
Resume versioning (stores old versions for 12 months)
File stored in S3 with encrypted keys
Acceptance Criteria:
✓ Upload completes within 10 seconds for typical resume
✓ File size validation prevents >10MB uploads
✓ Invalid formats rejected with clear error
✓ Multiple resumes can be uploaded
✓ Primary resume can be changed
✓ Old resumes archived, not deleted
✓ Files stored securely in S3
FR-RESUME-002: Resume Parsing
Description: System shall parse resume content into structured data
Requirements:
Parsing via third-party API (Lever, Parseur, or Claude API in Phase 2)
Extracted data: full text, skills, experience, education, contact info
Confidence score provided (0-100%)
Parsing queued asynchronously
Results returned within 30 seconds for standard resumes
Parsed data saved to database
Acceptance Criteria:
✓ Parsing starts automatically after upload
✓ Status shown to user (pending, processing, complete, failed)
✓ Parsed data returned and displayed for verification
✓ Confidence score <60% flags for human review
✓ User can accept, modify, or reject parsed data
✓ Email sent when parsing complete
✓ Error handling for failed parses
✓ Fallback to manual entry if parsing fails
FR-RESUME-003: Resume Optimization
Description: System shall provide suggestions for tailoring resume to specific jobs
Requirements:
Available on job detail page ("Optimize for this job")
Analyzes: job description, candidate resume, candidate profile
Suggestions include: add missing skills, emphasize relevant experience, remove outdated tech
Each suggestion includes: current text, recommendation, estimated impact
User can accept, edit, or skip suggestions
Optimized resume preview generated
Match score recalculated based on suggestions
Can save optimized resume as new version
Can download optimized resume (PDF or DOCX)
Acceptance Criteria:
✓ Optimization suggestions generated within 10 seconds
✓ Each suggestion includes impact metric
✓ At least 3 suggestions provided when available
✓ User can preview optimized resume
✓ Optimized resume download works
✓ New match score reflects optimizations
✓ Process completes within 2 minutes
FR-RESUME-004: ATS Compatibility Analysis
Description: System shall analyze resume for ATS (Applicant Tracking System) compatibility
Requirements:
Analysis scans for: formatting issues, tables, images, unusual fonts, special characters
Scoring: 0-100 points based on compatibility
Issues highlighted with severity (critical, warning, info)
Recommendations provided for each issue
Analysis completes within 10 seconds
Before/after comparison if fixes applied
ATS-optimized version can be generated
Acceptance Criteria:
✓ ATS score calculated correctly
✓ Issues identified and categorized
✓ Recommendations clear and actionable
✓ Report includes: score, findings, fixes, download option
✓ Analysis available from profile and resume upload
✓ Results shareable (export to PDF)
4.4 Job Data Management
FR-JOBS-001: Job Ingestion
Description: System shall ingest job data from multiple sources
Requirements:
Data sources: Partner APIs, web scraping (where legal), direct employer postings (Phase 2)
Ingestion frequency: every 6 hours minimum
Deduplication: identify same job posted multiple times
Data format standardization: normalize all job data to internal schema
External ID tracking: maintain source job ID for updates/deletes
Data quality checks: validate required fields
Error handling: log and alert on ingestion failures
Acceptance Criteria:
✓ Jobs ingested every 6 hours
✓ Duplicate jobs deduplicated with 95%+ accuracy
✓ All jobs have required fields (title, company, description, location)
✓ Ingestion failures logged and alerted
✓ Data freshness maintained (no jobs >30 days without update)
✓ Ingestion history viewable in admin panel
✓ Rollback capability for bad ingestions
FR-JOBS-002: Job Data Enrichment
Description: System shall enrich job data with additional information
Requirements:
Extract skills from job descriptions using NLP/regex
Standardize job titles to internal taxonomy
Estimate seniority level (entry, mid, senior, lead)
Categorize by industry
Calculate skills importance scores
Identify remote-friendly vs on-site requirements
Embedding generation for semantic search
Acceptance Criteria:
✓ Skills extracted from descriptions with 80%+ accuracy
✓ All jobs have seniority level assigned
✓ Industry categorization assigned
✓ Skills importance scores calculated
✓ Remote vs on-site detected with 90%+ accuracy
✓ Embeddings generated for all jobs


FR-JOBS-003: Job Search
Description: System shall allow candidates to search for jobs
Requirements:
Search queries matched against: title, company, description, location
Exact match and fuzzy matching (Levenshtein distance)
Search results ranked by relevance
Search autocomplete with suggestions
Search history saved (last 5 searches)
Search filters: location, salary, company, industry, posted date
Search results paginated (20, 50, 100 per page)
Search performance: <1 second for typical queries
Powered by Elasticsearch
Acceptance Criteria:
✓ Search finds relevant jobs
✓ Autocomplete suggests jobs as user types
✓ Results ranked by relevance
✓ Filters work correctly
✓ Pagination works correctly
✓ Search completes within 1 second
✓ Search history saved and accessible
FR-JOBS-004: Job Filtering & Sorting
Description: System shall allow candidates to filter and sort job results
Requirements:
Filter dimensions: location (single/multiple), salary range, company size, industry, posted date, employment type, remote flexibility
Sort options: relevance, match score, salary (high-low, low-high), posted date (newest, oldest), location (proximity)
Filters applied without page reload
Active filters shown as removable pills
Result count updates with filters
Filters persist during session
Acceptance Criteria:
✓ All filter types work correctly
✓ Multi-select filters function properly
✓ Range filters (salary, date) work
✓ Filters combine with AND logic
✓ Sort options work correctly
✓ Results update within 500ms of filter change
✓ UI clearly shows active filters
4.5 Job Recommendations
FR-RECS-001: Recommendation Generation
Description: System shall generate personalized job recommendations for candidates
Requirements:
Recommendations generated per candidate nightly (batch process)
Algorithm: rule-based (MVP) → ML-based (Phase 2)
Factors considered: skills match, experience match, location, salary, preferences, seniority level, industry
Top 20 recommendations stored in database
Match score (0-100) calculated
Recommendations expire after 7 days (refreshed nightly)
Caching: recommendations cached in Redis for fast retrieval
Acceptance Criteria:
✓ Recommendations generated daily for all candidates
✓ Top 20 recommendations per candidate
✓ Match score calculated for each
✓ Dashboard shows recommendations instantly (from cache)
✓ Recommendations relevant (manual QA sample: 80%+ are good fits)
✓ No stale recommendations shown (>7 days old)
✓ When profile updated, recommendations regenerated within 1 hour
FR-RECS-002: Recommendation Explanation
Description: System shall explain why a job is recommended
Requirements:
Explanation generated alongside recommendation
Explanation format: "You matched because: [Skill match: 95%, Experience: 85%, ...]"
Breakdown of match factors with % scores
Simple language used (avoid jargon)
Explanation includes: what matched well, what gaps exist, growth potential
Acceptance Criteria:
✓ Explanations clear and understandable
✓ Explanations mention specific user skills/experience
✓ Explanations highlight gaps
✓ Explanations factor in user preferences
✓ Explanations trust-building (honest about gaps)
FR-RECS-003: Recommendation Filtering & Sorting
Description: System shall allow candidates to filter and sort recommendations
Requirements:
Filter by: match score range (60-100%), company, location, salary range
Sort by: match score (high-low), recently recommended, salary (high-low)
Filters applied without reload
Active filters shown
Acceptance Criteria:
✓ Filters work correctly
✓ Sort options function properly
✓ Results update within 500ms
✓ Can clear all filters with one click
FR-RECS-004: Recommendation Feedback
Description: System shall collect candidate feedback on recommendations
Requirements:
Candidates can: apply, save, dismiss, report
Dismissal reason: (optional) not interested, not qualified, salary, location, etc.
Feedback used to improve future recommendations
Dismissals prevent similar jobs from being recommended
Acceptance Criteria:
✓ Dismiss button available on recommendations
✓ Optional reason collection works
✓ Feedback stored in database
✓ Similar jobs not recommended after dismissal
✓ Feedback used to train ML model (Phase 2)
4.6 Applications
FR-APP-001: Apply for Job
Description: System shall allow candidates to apply for jobs
Requirements:
Apply button available on job detail page
Application form: resume selection, optional cover letter
Application validation: resume required, cover letter optional
Application submission: takes <5 seconds
Success confirmation with next steps
Application recorded with timestamp
Email confirmation sent to candidate
Email sent to admin for monitoring
Acceptance Criteria:
✓ Application form loads quickly
✓ All fields validated
✓ Application submitted within 5 seconds
✓ Confirmation email sent within 2 minutes
✓ Application appears in tracking page immediately
✓ Application can only be submitted once per job per candidate
✓ Can't apply if resume is missing
FR-APP-002: Draft Applications
Description: System shall allow candidates to save draft applications
Requirements:
Candidates can save application as draft without submitting
Drafts show in applications list with "Draft" status
Drafts can be resumed and completed later
Drafts auto-save every 30 seconds
Drafts expire after 30 days of inactivity
Drafts can be manually deleted
Drafts never submitted without explicit action
Acceptance Criteria:
✓ Draft applications saved
✓ Drafts appear in applications list
✓ Drafts can be resumed
✓ Auto-save works without user action
✓ Drafts don't auto-submit
✓ Expired drafts removed after 30 days
FR-APP-003: Application Tracking
Description: System shall track applications and their status
Requirements:
Application status tracking: Draft, Submitted, Viewed, Interview, Rejected, Offer
Timeline displayed: applied date, viewed date, interview dates, offer date
Application detail view shows all relevant information
Statuses updated: some automated, some manual
Search and filter: by status, company, date, match score
Acceptance Criteria:
✓ Applications appear in tracking after submission
✓ Statuses accurate and up-to-date
✓ Timeline shows key events
✓ Filters work correctly
✓ Application detail page complete and informative
✓ Can withdraw applications
FR-APP-004: Application Withdrawal
Description: System shall allow candidates to withdraw applications
Requirements:
Withdraw button available on submitted applications
Confirmation required before withdrawal
Application marked as "Withdrawn"
Employer notified of withdrawal (Phase 2)
Can't withdraw if interview scheduled (warning shown)
Acceptance Criteria:
✓ Withdrawal confirmation shown
✓ Application status updated to Withdrawn
✓ Withdrawn applications hidden from main list but still viewable
✓ Withdrawal timestamp recorded




4.7 Saved Jobs
FR-SAVED-001: Save Jobs
Description: System shall allow candidates to save jobs for later review
Requirements:
Save button on job detail page (heart icon)
Toggle saved state without page reload
Saved jobs accessible from navigation
Saved jobs list shows: title, company, save date, match score, tag
Can save unlimited jobs
Saved jobs persist across sessions
Acceptance Criteria:
✓ Save button toggles saved state
✓ Saved jobs accessible from sidebar
✓ Heart icon reflects saved state
✓ Count of saved jobs shown
✓ Saved jobs list loads quickly
FR-SAVED-002: Manage Saved Jobs
Description: System shall allow candidates to organize and manage saved jobs
Requirements:
View saved jobs in list or grid
Filter by: tags, match score, date saved
Sort by: match score, date saved, salary
Can unsave jobs
Can tag jobs (custom or predefined: "Interested", "Dream Job", "Backlog")
Can add notes to saved jobs (Phase 2)
Bulk operations: apply to multiple, change tags, remove multiple
Acceptance Criteria:
✓ Saved jobs list functional
✓ Filters work correctly
✓ Sort options function
✓ Can unsave jobs
✓ Tags work (create, assign, filter)
✓ Bulk operations work
FR-SAVED-003: Saved Search Alerts
Description: System shall allow candidates to save searches and get alerts for new matching jobs
Requirements:
Save search button after job search
Saved searches show: search criteria, number of matching jobs
Option to email matching jobs: never, weekly, daily
Emails sent with new matching jobs
Can delete saved searches
Unlimited saved searches
Acceptance Criteria:
✓ Search save functionality works
✓ Saved searches retrievable
✓ Alert emails sent on schedule
✓ New matching jobs included in alerts
✓ Can disable/delete saved searches
4.8 Notifications
FR-NOTIF-001: Email Notifications
Description: System shall send email notifications for important events
Requirements:
Notification types: recommendation digest, application viewed, interview scheduled, offer received, interview reminder, skill gap insight
Emails sent within 5 minutes of event
Email templates responsive MJML + plain text fallback
Unsubscribe link in every email
Email authentication: SPF, DKIM configured
Email delivery monitoring: track bounces, complaints, opens (Phase 2)
Can manage email preferences
Acceptance Criteria:
✓ All notification types send correctly
✓ Emails arrive within 5 minutes
✓ Emails display correctly in major clients
✓ Unsubscribe link works
✓ MJML and plain text versions both render
✓ Email preferences respected
FR-NOTIF-002: In-App Notifications
Description: System shall show in-app notifications for events
Requirements:
Notification bell icon shows unread count
Notification dropdown shows recent notifications
Notifications types: new recommendations, application updates, interview reminders, insights
Can dismiss notifications
Can mark as read/unread
Notifications persist across sessions
Can clear all notifications
Acceptance Criteria:
✓ Bell icon shows correct unread count
✓ Notification dropdown loads quickly
✓ Can dismiss and mark as read
✓ Notifications appear in real-time
✓ Notifications persist
FR-NOTIF-003: Notification Preferences
Description: System shall allow candidates to control notification settings
Requirements:
Preference center in settings
Toggles for: email, in-app, push (future)
Frequency options: immediately, daily, weekly, never
Can save and update preferences
Preferences applied immediately
Acceptance Criteria:
✓ Preference center accessible
✓ All notification types controllable
✓ Frequency options work
✓ Preferences saved and respected
✓ Changes apply immediately

4.9 Interview & Preparation
FR-INTERVIEW-001: Interview Prep Resources
Description: System shall provide interview preparation materials
Requirements:
Company research: overview, news, culture, hiring trends, links to sources
Role-specific questions: technical, behavioral, domain-specific
Format-specific tips: phone, video, on-site
Questions to ask interviewer
Thank you email template
Post-interview checklist
Content available in multiple formats (text, downloadable PDF)
Acceptance Criteria:
✓ All prep materials load quickly
✓ Content is relevant to user's role and company
✓ Mobile-optimized layout
✓ Content is actionable and specific
✓ Templates can be customized
✓ All links work
FR-INTERVIEW-002: Interview Reminders
Description: System shall remind candidates about scheduled interviews
Requirements:
Email reminder 1 day before
Email reminder 1 hour before (optional, configurable)
In-app notification 1 hour before
Can customize reminder times
Can add to calendar (iCal/Google Calendar integration)
Reminders included interview details: date, time, location, link
Acceptance Criteria:
✓ Reminders sent at specified times
✓ Reminder includes all necessary details
✓ Can customize reminder times
✓ Calendar integration works
✓ Can disable reminders
4.10 Salary Intelligence
FR-SALARY-001: Salary Benchmarks
Description: System shall provide salary benchmark data
Requirements:
Benchmarks by: role, location, experience level, industry
Data shown: 25th, 50th, 75th, 90th percentile
User's expected salary compared to market
Impact factors shown: location, experience, industry
Data updated monthly
Sources: JobFits applications, job postings, (later: salary surveys)
Acceptance Criteria:
✓ Benchmark data accurate
✓ Percentiles calculated correctly
✓ Impact factors shown
✓ Data updates monthly
✓ User comparison helpful
✓ Mobile-friendly display
FR-SALARY-002: Offer Analysis
Description: System shall analyze job offers against market data
Requirements:
Input fields: salary, bonus, stock options, benefits
Analysis: market percentile, recommendation, negotiation talking points
Total compensation calculation
Can compare multiple offers side-by-side
Results saved to application
Downloadable report option
Acceptance Criteria:
✓ Offer analysis accurate
✓ Total compensation calculated correctly
✓ Market comparison helpful
✓ Can save/export analysis
✓ Multi-offer comparison works
Non-Functional Requirements
5.1 Performance
NFR-PERF-001: Page Load Times
Page
Target
Homepage/Dashboard
<2s (first load), <1s (cached)
Job detail page
<2s
Search results
<1s
Application page
<2s
Profile page
<2s

NFR-PERF-002: API Response Times
Request Type
Target (99th percentile)
GET requests
<500ms
POST requests
<1000ms
Search queries
<1000ms
Recommendation generation
<30s for resume parsing

NFR-PERF-003: Database Performance
Query response time: <100ms at 99th percentile
Connection pooling: 50-100 connections
Database optimization: indexes on frequently queried columns
Query caching: 5-minute TTL for expensive queries
NFR-PERF-004: Frontend Performance
Lighthouse score: >80 on desktop, >70 on mobile
Bundle size: <500KB initial JS
Time to interactive: <3 seconds on 4G
Core Web Vitals: LCP <2.5s, FID <100ms, CLS <0.1
NFR-PERF-005: Search Performance
Elasticsearch query time: <500ms for typical queries
Index size: <10GB for 500K jobs
Indexing latency: new jobs searchable within 5 minutes
5.2 Scalability
NFR-SCALE-001: Concurrent Users
Support 1,000+ concurrent users on web
Database: PostgreSQL with read replicas for read-heavy queries
Cache: Redis for recommendations, sessions, rate limiting
CDN: CloudFront for static assets
Load balancing: ELB across multiple API instances
NFR-SCALE-002: Data Growth
100K+ candidates in MVP
500K+ jobs in MVP
1M+ applications/month by Year 1
Resume storage: S3 (unlimited, cost-based scaling)
Database: Partition recommendations by candidate_id
NFR-SCALE-003: Background Jobs
100K+ recommendations/night
Resume parsing: 100 resumes/hour concurrent
Email sending: 10K emails/hour
Job ingestion: 10K jobs/hour
5.3 Security
NFR-SEC-001: Authentication Security
Passwords hashed with bcrypt (minimum 10 rounds)
No plain-text passwords logged or stored
JWT tokens signed with HS256 or RS256
Token expiration: 30 days
Refresh token rotation
Secure password reset: 24-hour token expiration
NFR-SEC-002: Data Encryption
HTTPS/TLS 1.2+ for all communication
Database encryption at rest (AWS RDS encryption, or database-level)
Resume files encrypted in S3
Sensitive PII: email, phone encrypted in database (at-rest encryption)
API keys and secrets: stored in secrets manager, not in code
NFR-SEC-003: Authorization
Role-based access control (RBAC): Candidate, Admin
Candidates cannot access other candidate data
API endpoint authorization: token validation + role check
Audit logging: all admin actions logged
NFR-SEC-004: Compliance
GDPR compliance: data deletion, portability, consent
CCPA compliance: applicable in California
Privacy policy: clear, updated
Data processing agreements: with vendors
Incident response plan: documented
NFR-SEC-005: Input Validation
All user inputs validated: length, format, type
SQL injection prevention: parameterized queries
XSS prevention: input sanitization + output encoding
CSRF protection: token-based
File upload validation: type, size, virus scanning (Phase 2)
NFR-SEC-006: Rate Limiting
Endpoint
Limit
API rate limits
100 requests/minute per user
Signup
5 new accounts/IP/hour
Login
10 attempts/IP/hour
Email sending
100 emails/hour per recipient

5.4 Availability & Reliability
NFR-AVAIL-001: Uptime
Target uptime: 99.5% (calculated monthly)
Maintenance window: <4 hours/month, during low-traffic hours
SLA: 99.5% or service credits offered
NFR-AVAIL-002: Disaster Recovery
Database backups: daily, retained for 30 days
Backup restoration tested monthly
RTO (Recovery Time Objective): <1 hour
RPO (Recovery Point Objective): <1 hour
NFR-AVAIL-003: Monitoring & Alerting
Application monitoring: error rates, latency, traffic
Database monitoring: CPU, memory, query performance
Infrastructure monitoring: disk space, network
Alerting: Slack alerts for critical issues
On-call rotation: for production issues
NFR-AVAIL-004: Graceful Degradation
If recommendation engine fails: show all jobs
If search unavailable: fall back to database search
If email unavailable: queue messages and retry
Partial outages don't block critical flows
5.5 Usability
NFR-USAB-001: User Interface
Responsive design: works on desktop, tablet, mobile
Mobile-first approach for design
Accessibility: WCAG 2.1 AA compliance
Color contrast: minimum 4.5:1 for text
Keyboard navigation: all features accessible without mouse
Screen reader compatible: semantic HTML, ARIA labels
NFR-USAB-002: Localization
MVP: English only
Future: Spanish, French, German, Mandarin (Phase 2+)
Timezone support: show times in user's timezone
NFR-USAB-003: Error Messages
Error messages clear and actionable
Field validation: inline error messages
Form submission errors: clear explanation of what went wrong
Network errors: retry guidance
NFR-USAB-004: Documentation
User documentation: help center articles
API documentation: OpenAPI/Swagger
Admin documentation: internal wiki
5.6 Maintainability
NFR-MAINT-001: Code Quality
Language: Python (backend), JavaScript/TypeScript (frontend)
Code style: automated formatting (Black for Python, Prettier for JS)
Testing: >80% code coverage for critical paths
Linting: ESLint (JS), Pylint (Python)
Type checking: TypeScript (frontend), type hints (Python)
NFR-MAINT-002: Logging & Observability
Application logging: structured logs (JSON) with levels (debug, info, warning, error)
Request tracing: correlation IDs for request tracking
Metrics: Prometheus for infrastructure metrics
Distributed tracing: OpenTelemetry integration (Phase 2)
Log aggregation: CloudWatch, ELK, or Datadog
Retention: 30 days
NFR-MAINT-003: Version Control
Git workflow: feature branches, pull requests, code review
Commit messages: conventional commits format
Release strategy: semantic versioning (MAJOR.MINOR.PATCH)
Changelog: maintained for each release
NFR-MAINT-004: Deployment
CI/CD pipeline: GitHub Actions or GitLab CI
Automated testing: unit, integration tests run on every PR
Staging environment: identical to production
Blue-green deployment: zero-downtime deploys
Rollback capability: automatic rollback on failures
User Journeys
Journey 1: Signup
User lands on homepage
Clicks "Sign up with Google"
OAuth flow (60 seconds)
Redirected to "Upload Resume" screen
Drag-drop resume (PDF/DOCX)
System parses resume (async, 30-60 seconds)
"Quick Setup" form (role, location, salary)
"Your first matches!" page shows 3 top recommendations
CTA: "View all recommendations" or "Install extension"
Success Metric: Time from signup to first recommendation: <10 minutes
Journey 2: Finding a Job
User browses Job Recommendations tab
Sees job card with match score explanation
Clicks "View Job" → Detailed job page
Reads description, sees match analysis
Clicks "Quick Apply" → Application form auto-filled from resume
Submits application
Application automatically added to tracker
Receives confirmation email with application link
Success Metric: Time from recommendation to application: <3 minutes
Journey 3: Tracking Application → Interview → Offer
User views Application Tracker
Drags application from "Applied" to "Interview" stage
Adds interview date, interviewer name, prep notes
Receives reminder 24 hours before interview
After interview, updates status with notes
Receives offer notification
Uses comparison tool to evaluate offer
Accepts and updates profile with new role
Success Metric: % of tracked applications that reach interview stage
Journey 4: Learning Missing Skills
User sees job requires "Kubernetes" (missing skill)
Clicks "Learn Kubernetes" in recommendation
Redirected to Learning Hub
System shows:
Why learn it (20 jobs need this)
Time estimate (4 weeks)
Curated courses (Udemy, Coursera, free resources)
Practice projects
User completes course
Updates resume with new skill
System shows: "12 new matching jobs available"
Success Metric: % of users who complete recommended learning path
Technical Architecture
7.1 Technology Stack
Backend
Component
Technology
Language
Node.js (TypeScript)
Framework
Express.js or NestJS
Database
PostgreSQL (primary)
Cache
Redis
ORM
Prisma or TypeORM
Authentication
JWT + refresh tokens
Password Hashing
bcryptjs
Logging
Winston or Pino
Task Queue
Bull (Redis-based)
Email
SendGrid or AWS SES

Recommended Stack: Supabase + Prisma
Database: Supabase PostgreSQL (hosting)
OAuth: Supabase Auth (built-in login)
Queries: Prisma (type-safe database access)
Frontend
Component
Technology
Framework
Next.js 14+ (App Router)
Language
TypeScript
Styling
Tailwind CSS
State Management
TanStack Query + Zustand
UI Components
Custom + shadcn/ui
Testing
Vitest + React Testing Library

AI Service
Component
Technology
Framework
FastAPI
Language
Python
LLM
Ollama (local)
Models
Qwen 3, BGE-M3
Embeddings
BGE-M3


Database Schema
Entity-Relationship Diagram Overview
The database includes the following major entities:
Authentication & Users
users
refresh_tokens
Profiles & Information
profiles
resumes
skills
experiences
education
certifications
projects
media
contact_persons
Company & Jobs
companies
jobs
saved_jobs
Matching & Recommendations
recommendations
Applications
applications
application_timeline
Notifications
notifications
notification_preferences
Learning
learning_paths
learning_progress
Salary Data
salary_data
Settings & Admin
user_settings
user_analytics
faqs
knowledge_base
help_center
Referral Program
referrals
Interview Preparation
interview_tips
interview_questions
Employer Features
job_listings
job_forms
job_form_responses
Payments
subscriptions
payments

Deployment Architecture
8.1 Local Development Environment
During development, every component runs on the developer's laptop:
Developer Laptop
├── Next.js Frontend (localhost:3000)
├── NestJS Backend (localhost:3001)
├── FastAPI AI Service (localhost:8000)
└── Ollama (localhost:11434)
    ├── Qwen 3
    └── BGE-M3

Local Request Flow Example - Resume Upload:
Browser uploads PDF to localhost:3000
Frontend sends file to backend (POST localhost:3001/api/resume)
Backend stores file and sends to AI Service (POST localhost:8000/api/resume/parse)
AI Service builds prompt and calls Ollama (POST localhost:11434/api/chat)
Ollama loads model and performs analysis
Model returns structured JSON to AI Service
AI Service validates and returns response to Backend
Backend stores parsed data in PostgreSQL
Backend returns result to Frontend
8.2 Production Deployment
After development, application is deployed to cloud providers:


Internet
├── jobfits.com (Vercel)
│   └── Next.js Frontend
│
├── api.jobfits.com (Railway)
│   ├── NestJS Backend
│   ├── PostgreSQL
│   └── Redis
│
└── ai.jobfits.com (RunPod GPU Server)
    └── FastAPI AI Service
        └── Ollama
            ├── Qwen 3
            └── BGE-M3

8.3 Deployment Locations
Component
Platform
URL
Frontend
Vercel
https://jobfits.com
Backend
Railway
https://api.jobfits.com
AI Service
RunPod GPU Server
https://ai.jobfits.com

8.4 Production Request Flow
Browser uploads PDF to https://jobfits.com
Frontend sends file to backend via HTTPS (https://api.jobfits.com)
Backend stores file and requests resume parsing (POST https://ai.jobfits.com/api/resume/parse)
AI Service receives request, extracts text, creates prompts
AI Service calls Ollama locally (http://localhost:11434/api/chat) — never exposed to internet
Ollama loads model and performs inference using GPU
Ollama returns result to FastAPI
FastAPI validates and returns JSON to backend
Backend stores processed information in PostgreSQL
Frontend displays final result to user


8.5 Why Ollama Uses Localhost
FastAPI and Ollama run on the same GPU server:
RunPod GPU Server
├── FastAPI
│   └── Internal call to localhost:11434
├── Ollama (NOT exposed to internet)
│   └── Qwen 3, BGE-M3
└── GPU (shared resource)

Benefits:
Performance: requests don't leave the server
Security: Ollama is never directly accessible from the internet
Simplicity: internal communication between two applications
Backend Architecture
9.1 NestJS Modular Monolith
The JobFits backend follows a feature-based modular architecture inspired by best practices from Domain-Driven Design (DDD).
Folder Structure
jobfit-backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── common/ # cross-cutting concerns
│   │   ├── decorators/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── filters/
│   │   └── pipes/
│   │
│   ├── config/
│   │   ├── app.config.ts
│   │   ├── database.config.ts
│   │   ├── supabase.config.ts
│   │   ├── redis.config.ts
│   │   └── env.validation.ts
│   │
│   ├── core/ # DDD building blocks
│   │   ├── domain/
│   │   ├── application/
│   │   └── repository/
│   │
│   ├── events/
│   │   ├── event-bus.module.ts
│   │   ├── domain-events.registry.ts
│   │   └── event-names.const.ts
│   │
│   ├── infra/
│   │   ├── prisma/
│   │   ├── supabase/
│   │   ├── storage/
│   │   ├── mailer/
│   │   ├── queue/
│   │   └── search/
│   │
│   ├── shared-kernel/
│   │   ├── skills/
│   │   ├── industries/
│   │   └── value-objects/
│   │
│   ├── modules/
│   │   ├── auth/
│   │   ├── user/
│   │   ├── company/
│   │   ├── job/
│   │   ├── resume/
│   │   ├── application/
│   │   ├── matching/
│   │   ├── notification/
│   │   ├── payment/
│   │   └── admin/
│   │
│   └── types/
│       └── express.d.ts
│
├── scripts/
├── docs/
│   └── adr/ # Architecture Decision Records
└── test/

Key Principles
Feature-Based Modules: Each business capability (job, user, matching) has its own module
Layered Architecture: Modules are internally layered with presentation, application, domain, and infrastructure
Domain-Driven Design: Business rules are explicit in domain entities and value objects
Event-Driven: Domain events connect modules without tight coupling
Repository Pattern: All data access goes through repository interfaces, not direct database calls
Dependency Injection: NestJS handles DI; services never instantiate their dependencies
Module Structure Example: Job Module
modules/job/
├── job.module.ts
├── presentation/
│   ├── controllers/
│   │   ├── job.controller.ts
│   │   └── job-management.controller.ts
│   └── dto/
├── application/
│   ├── use-cases/
│   │   ├── create-job.use-case.ts
│   │   ├── publish-job.use-case.ts
│   │   └── search-jobs.use-case.ts
│   ├── job.mapper.ts
│   └── job.service.ts
├── domain/
│   ├── entities/
│   │   └── job.entity.ts
│   ├── value-objects/
│   │   ├── job-status.vo.ts
│   │   ├── remote-type.vo.ts
│   │   └── salary-range.vo.ts
│   ├── events/
│   │   └── job-published.event.ts
│   └── job.repository.interface.ts
├── infrastructure/
│   └── repositories/
│       └── prisma-job.repository.ts
└── listeners/
    └── application-submitted.listener.ts

9.2 Supabase Integration
Authentication:
Supabase Auth issues JWT tokens
NestJS verifies tokens using JWT secret
Role-based access via custom claims
Database:
Prisma connects directly to Supabase PostgreSQL
Connection pooling for efficiency
Migrations managed by Prisma
Storage:
Three buckets: resumes (private), company-logos (public), job-attachments (private)
All access through infra/storage/storage.service.ts
Signed URLs for private file access
Security:
Row-Level Security (RLS) as defense-in-depth
Primary authorization in guards/use-cases
API keys in secrets manager
9.3 Scaling Roadmap
Phase 1 - MVP (Current):
Modular monolith
Rule-based job matching
Synchronous resume upload
Phase 2 - Async & Search:
Resume parsing moved to background queue (BullMQ)
Job search upgraded to Meilisearch/Typesense
Recommendation recomputation async
Phase 3 - Notification & Payments:
Event-driven notification system
Payment module with Stripe adapter
Digest batching (daily/weekly)
Phase 4 - Extract Heavy Services:
ML-based matching as separate service
Advanced NLP resume parsing pipeline
Separate deployment/scaling
Frontend Architecture
10.1 Next.js App Router Structure
The JobFits frontend is built with Next.js 14+ using the App Router pattern. The architecture prioritizes feature ownership and scalable organization.
Design Principles
Feature-Based Organization: Each business domain (job, resume, matching) owns its UI, hooks, and API calls
Route Groups by Role: Separate route groups for job seekers, employers, and admins
Server Components by Default: Only use Client Components where interactivity is needed
Single API Client Layer: All backend calls go through lib/api/
No Cross-Feature Imports: Features communicate through routes or shared/
Full Folder Structure
jobfit-frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx # root layout
│   │   ├── page.tsx # landing page
│   │   ├── globals.css
│   │   │
│   │   ├── (marketing)/ # public pages
│   │   │   ├── pricing/page.tsx
│   │   │   ├── about/page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (auth)/ # login/signup
│   │   │   ├── login/page.tsx
│   │   │   ├── signup/page.tsx
│   │   │   ├── verify-email/page.tsx
│   │   │   ├── onboarding/
│   │   │   │   ├── resume/page.tsx
│   │   │   │   ├── profile/page.tsx
│   │   │   │   └── recommendations/page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (seeker)/ # job seeker dashboard
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── profile/page.tsx
│   │   │   ├── resumes/page.tsx
│   │   │   ├── jobs/page.tsx
│   │   │   ├── recommendations/page.tsx
│   │   │   ├── saved-jobs/page.tsx
│   │   │   ├── applications/page.tsx
│   │   │   ├── insights/page.tsx
│   │   │   ├── learning/page.tsx
│   │   │   └── notifications/page.tsx
│   │   │
│   │   ├── (employer)/ # employer dashboard
│   │   │   ├── layout.tsx
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── company/page.tsx
│   │   │   ├── jobs/page.tsx
│   │   │   └── settings/page.tsx
│   │   │
│   │   ├── (admin)/ # admin panel
│   │   │   ├── layout.tsx
│   │   │   ├── users/page.tsx
│   │   │   ├── companies/page.tsx
│   │   │   ├── jobs/page.tsx
│   │   │   └── reports/page.tsx
│   │   │
│   │   └── api/ # route handlers
│   │       └── webhooks/
│   │           └── stripe/route.ts
│   │
│   ├── features/ # business logic
│   │   ├── auth/
│   │   │   ├── components/
│   │   │   ├── hooks/
│   │   │   └── api/
│   │   ├── user-profile/
│   │   ├── resume/
│   │   ├── job/
│   │   ├── matching/ # core differentiator
│   │   ├── saved-jobs/
│   │   ├── application/
│   │   ├── company/
│   │   ├── insights/
│   │   ├── learning/
│   │   ├── notification/
│   │   └── payment/
│   │
│   ├── shared/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── layout/
│   │   │   └── data-display/
│   │   ├── hooks/
│   │   ├── types/
│   │   └── utils/
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts
│   │   │   └── query-keys.ts
│   │   ├── supabase/
│   │   └── utils/
│   │
│   ├── stores/ # Zustand
│   │   ├── ui-store.ts
│   │   └── job-compare-store.ts
│   │
│   ├── providers/
│   │   ├── query-provider.tsx
│   │   ├── auth-provider.tsx
│   │   └── theme-provider.tsx
│   │
│   └── middleware.ts
│
└── package.json




Server State (TanStack Query):
Jobs, applications, recommendations, profile data
Automatic caching, refetching, synchronization
No Zustand for server data — single source of truth
Client-Only UI State (Zustand):
Sidebar collapsed/open state
Theme preference
Multi-select for "compare jobs"
Intentionally minimal (2 files, not 15)
Form State:
Local useState/react-hook-form per form
Not stored globally
10.3 Feature Example: Matching
The matching feature demonstrates the core differentiator — transparent match explanations.
Components:
recommendation-card.tsx — Server Component, renders job + score
match-score-breakdown.tsx — Client Component, expandable "why 92%?" panel
swipe-deck.tsx — Client Component, mobile swipe interaction
Integration:
Hooks manage data fetching and feedback submission
API layer provides typed calls to backend matching routes
TanStack Query handles caching and refetching
10.4 Auth & Route Protection
middleware.ts:
Checks Supabase session cookie
Validates user role claim
Redirects to appropriate route group (seeker/employer/admin)
providers/auth-provider.tsx:
Wraps app
Exposes useSession() for client components
Manages session state
Server Components:
Fetch session directly via lib/supabase/server.ts
No client-side waterfall on initial page load
10.5 Performance Optimizations
Server Components:
Rendered on server, no JS shipped to browser
Direct database access without client-side fetch
Used for display-only content
Client Components:
Only for interactive features (forms, filters, drag-and-drop)
Minimal bundle size
Code Splitting:
Route-based automatic splitting
Dynamic imports for heavy features
Image Optimization:
Next.js Image component for all images
Automatic resizing and format conversion
Conclusion
JobFits is designed as a scalable, maintainable platform with clear separation of concerns. The architecture supports rapid MVP development while providing clear paths for scaling as the product and team grow.
The modular structure, event-driven communication, and domain-driven design principles ensure that the codebase remains manageable even as features are added and requirements evolve.
Document Prepared By: JobFits Development Team
Last Reviewed: July 2026
Next Review Date: October 2026

