erDiagram

  %% ================== USERS & AUTH ==================
  users {
    uuid id PK
    string email
    string passwordHash
    string firstName
    string lastName
    string profilePhotoUrl
    boolean isEmailVerified
    string emailVerificationCode
    timestamp emailVerificationCodeExpiry
    enum role "USER|PREMIUM|PROFESSIONAL|ADMIN"
    timestamp lastLoginAt
    timestamp createdAt
    timestamp updatedAt
    timestamp deletedAt
  }

  refresh_tokens {
    uuid id PK
    uuid userId FK
    string token
    timestamp expiresAt
    timestamp createdAt
  }

  users ||--o{ refresh_tokens : "has"

  %% ================== PROFILE ==================
  profiles {
    uuid id PK
    uuid userId FK "unique"
    text bio
    string location
    enum remotePreference "remote_only|hybrid|on_site|flexible"
    int expectedSalaryMin
    int expectedSalaryMax
    json preferredRoles "array of role names"
    string linkedinUrl
    string githubUrl
                  string portfolioUrl
    string phoneNumber
    date dateOfBirth
    enum profileVisibility "public|private"
    timestamp createdAt
    timestamp updatedAt
  }

  users ||--|| profiles : "has"

  %% ================== RESUME ==================
  resumes {
    uuid id PK
    uuid userId FK
    string fileName
    string fileUrl
    boolean isDefault
    json parsedData "skills, experience, education, certifications"
    int atsScore "0-100"
    int resumeScore "0-100"
    enum parsingStatus "pending|success|failed"
    int version
    timestamp uploadedAt
    timestamp createdAt
    timestamp updatedAt
    timestamp deletedAt
  }

  users ||--o{ resumes : "uploads"

  %% ================== SKILLS ==================
  skills {
    uuid id PK
    uuid userId FK
    string name
    enum proficiency "beginner|intermediate|advanced|expert"
    int yearsOfExperience
    int endorsements
    timestamp createdAt
    timestamp updatedAt
  }

  users ||--o{ skills : "has"

  %% ================== EXPERIENCE ==================
  experiences {
    uuid id PK
    uuid userId FK
    string company
    string position
    date startDate
    date endDate
    text responsibilities
    json technologiesUsed "array of tech tags"
    text achievements
    timestamp createdAt
    timestamp updatedAt
  }

  users ||--o{ experiences : "has"

  %% ================== EDUCATION ==================
  education {
    uuid id PK
    uuid userId FK
    string institution
    enum degreeLevel "high_school|bachelor|master|phd|bootcamp|certificate"
    string fieldOfStudy
    int graduationYear
    float gpa
    string honors
    timestamp createdAt
    timestamp updatedAt
  }

  users ||--o{ education : "has"

  %% ================== CERTIFICATIONS ==================
  certifications {
    uuid id PK
    uuid userId FK
    string name
    string organization
    date issuedDate
    date expirationDate
    string credentialId
    string credentialUrl
    timestamp createdAt
    timestamp updatedAt
  }

  users ||--o{ certifications : "has"

  %% ================== PROJECTS ==================
  projects {
    uuid id PK
    uuid userId FK
    string name
    text description
    json technologiesUsed "array of tech tags"
    string githubUrl
    string demoUrl
    json images "array of image URLs"
    timestamp createdAt
    timestamp updatedAt
  }

  users ||--o{ projects : "has"

  %% ================== MEDIA ==================
  media {
    uuid id PK
    string fileId
    string path
    string mimeType
    int width
    int height
    int size
    enum mediaType "IMAGE|PDF|VIDEO"
    enum ownerType "USER|RESUME|JOB|COMPANY|INTERVIEW_NOTE"
    uuid ownerId
    json metadata
    timestamp createdAt
    timestamp updatedAt
    timestamp deletedAt
  }

  users ||--o{ media : "uploads"
  resumes ||--o{ media : "has"


  %% ================== COMPANIES ==================
  companies {
    uuid id PK
    string name
    string logoUrl
    string website
    string industry
    int employeeCount
    float glassdoorRating "0-5"
    int reviewCount
    int founded
    enum fundingStage "bootstrap|seed|series_a|series_b|series_c|ipo"
    enum hiringVelocity "low|medium|high"
    text description
    timestamp createdAt
    timestamp updatedAt
  }

  %% ================== JOBS ==================
  jobs {
    uuid id PK
    string externalId
    enum externalSource "linkedin|indeed|glassdoor"
    string title
    uuid companyId FK
    text description
    json requirements "array of required skills"
    json responsibilities "array of responsibilities"
    json benefits "array of benefits"
    json salary "{ min, max, currency }"
    string location
    enum remoteType "remote|hybrid|on_site"
    timestamp postedAt
    timestamp deadline
    int applicantCount
    string externalUrl
    timestamp createdAt
    timestamp updatedAt
    timestamp deletedAt
  }

  companies ||--o{ jobs : "posts"

  %% ================== SAVED JOBS ==================
  saved_jobs {
    uuid id PK
    uuid userId FK
    uuid jobId FK
    string folderName
    timestamp deadline
    text notes
    timestamp createdAt
    timestamp updatedAt
  }

  users ||--o{ saved_jobs : "saves"
  jobs ||--o{ saved_jobs : "is_saved"

  %% ================== RECOMMENDATIONS ==================
  recommendations {
    uuid id PK
    uuid userId FK
    uuid jobId FK
    int matchScore "0-100"
    int skillsMatch "0-100"
    int experienceMatch "0-100"
    int locationMatch "0-100"
    int salaryMatch "0-100"
    int cultureMatch "0-100"
    text reasonExplanation
    enum userAction "applied|saved|skipped|not_interested|null"
    timestamp createdAt
    timestamp updatedAt
  }

  users ||--o{ recommendations : "receives"
  jobs ||--o{ recommendations : "is_recommended"

  %% ================== APPLICATIONS ==================
  applications {
    uuid id PK
    uuid userId FK
    uuid jobId FK
    enum status "saved|applied|interview|offer|accepted|rejected"
    timestamp appliedAt
    timestamp interviewDate
    int offerSalary
    text notes
    uuid contactPersonId "nullable"
    timestamp createdAt
    timestamp updatedAt
    timestamp deletedAt
  }

  users ||--o{ applications : "submits"
  jobs ||--o{ applications : "receives"

  %% ================== APPLICATION TIMELINE ==================
  application_timeline {
    uuid id PK
    uuid applicationId FK
    enum eventType "applied|first_contact|interview_scheduled|interview_completed|offer_received|offer_accepted|offer_rejected|rejected"
    timestamp eventDate
    text notes
    timestamp createdAt
  }

  applications ||--o{ application_timeline : "has_events"

  %% ================== CONTACT PERSONS ==================
  contact_persons {
    uuid id PK
    uuid userId FK
    string name
    string title
    string email
    string phone
    uuid companyId FK
    string linkedinUrl
    timestamp lastContactAt
    text notes
    timestamp createdAt
    timestamp updatedAt
  }

  users ||--o{ contact_persons : "knows"
  companies ||--o{ contact_persons : "employs"
  applications ||--o{ contact_persons : "has_contact"

  %% ================== NOTIFICATIONS ==================
  notifications {
    uuid id PK
    uuid userId FK
    enum notificationType "resume_parsed|new_recommendation|interview_reminder|application_deadline|status_update|weekly_digest|new_feature"
    string title
    text message
    json metadata "{ jobId, applicationId, etc }"
    boolean isRead
    timestamp readAt
    enum channel "in_app|email|push"
    timestamp createdAt
  }

  users ||--o{ notifications : "receives"


  %% ================== NOTIFICATION PREFERENCES ==================
  notification_preferences {
    uuid id PK
    uuid userId FK "unique"
    enum frequency "real_time|daily|weekly"
    json channels "array of channel types"
    json enabledTypes "array of notification types"
    time quietHoursStart
    time quietHoursEnd
    timestamp updatedAt
  }

  users ||--|| notification_preferences : "has"

  %% ================== LEARNING HUB ==================
  learning_paths {
    uuid id PK
    string skillName
    text description
    int estimatedWeeks
    int jobsRequiringSkill
    json resources "array of { type, title, url, free }"
    json practiceProjects "array of project ideas"
    enum difficulty "beginner|intermediate|advanced"
    timestamp createdAt
    timestamp updatedAt
  }

  learning_progress {
    uuid id PK
    uuid userId FK
    uuid pathId FK
    enum status "not_started|in_progress|completed"
    int coursesCompleted
    int certificatesEarned
    timestamp completedAt
    timestamp createdAt
    timestamp updatedAt
  }

  users ||--o{ learning_progress : "tracks"
  learning_paths ||--o{ learning_progress : "has_progress"

  %% ================== REFERRAL PROGRAM ==================
  referrals {
    uuid id PK
    uuid referrerId FK
    uuid referredUserId FK "nullable"
    string referralCode
    string referralLink
    enum status "pending|converted|rewarded"
    timestamp referredAt
    timestamp convertedAt
    int bonusAmount
    timestamp createdAt
    timestamp updatedAt
  }

  users ||--o{ referrals : "creates"

  %% ================== INTERVIEW PREPARATION ==================
  interview_tips {
    uuid id PK
    string title
    text content
    string category
    enum difficulty "beginner|intermediate|advanced"
    timestamp createdAt
    timestamp updatedAt
  }

  interview_questions {
    uuid id PK
    string question
    text answerGuidance
    string category "behavioral|technical|salary"
    enum difficulty "beginner|intermediate|advanced"
    timestamp createdAt
    timestamp updatedAt
  }

  %% ================== SALARY DATA ==================
  salary_data {
    uuid id PK
    uuid companyId FK
    string role
    string location
    int salaryMin
    int salaryMax
    int bonus
    json equity "{ shares, vestingYears }"
    int totalComp
    int dataPoints "number of salary submissions"
    timestamp lastUpdatedAt
    timestamp createdAt
  }

  companies ||--o{ salary_data : "has_salary_data"

  %% ================== SETTINGS ==================
  user_settings {
    uuid id PK
    uuid userId FK "unique"
    enum theme "light|dark|system"
    enum language "en|es|fr|de|zh"
    string timezone
    boolean twoFactorEnabled
    timestamp updatedAt
  }

  users ||--|| user_settings : "has_settings"

  %% ================== ANALYTICS ==================
  user_analytics {
    uuid id PK
    uuid userId FK
    int totalApplications
    int totalInterviews
    int totalOffers
    float interviewRate "percentage"
    float offerRate "percentage"
    timestamp lastApplicationDate
    timestamp lastInterviewDate
    timestamp updatedAt
  }

  users ||--|| user_analytics : "has_analytics"

  %% ================== HELP & SUPPORT ==================
  faqs {
    uuid id PK
    string question
    text answer
    string category
    int helpfulCount
    timestamp createdAt
    timestamp updatedAt
  }

  knowledge_base {
    uuid id PK
    string title
    string slug
    json content
    enum status "draft|published"
    timestamp publishedAt
    timestamp createdAt
    timestamp updatedAt
    timestamp deletedAt
  }

  help_center {
    uuid id PK
    string title
    string slug
    json content
    enum status "draft|published"
    timestamp publishedAt
    timestamp createdAt
    timestamp updatedAt
    timestamp deletedAt
  }
    

  %% ================== CAREERS (COMPANY HIRING) ==================
  job_listings {
    uuid id PK
    string title
    text description
    string location
    enum jobType "full_time|part_time|contract|internship"
    enum status "draft|open|closed"
    timestamp createdAt
    timestamp updatedAt
  }

  job_forms {
    uuid id PK
    uuid jobListingId FK
    json schema "form structure with fields and types"
    timestamp createdAt
    timestamp updatedAt
  }

  job_form_responses {
    uuid id PK
    uuid formId FK
    uuid userId FK
    json answers
    enum status "submitted|reviewed|rejected|accepted"
    timestamp submittedAt
    timestamp reviewedAt
    timestamp createdAt
    timestamp updatedAt
  }

  job_listings ||--|| job_forms : "has_form"
  job_forms ||--o{ job_form_responses : "collects"
  users ||--o{ job_form_responses : "submits"

  %% ================== PAYMENTS & SUBSCRIPTIONS ==================
  subscriptions {
    uuid id PK
    uuid userId FK
    enum tier "free|premium|professional|enterprise"
    string stripeCustomerId
    string stripeSubscriptionId
    timestamp billingCycleStart
    timestamp billingCycleEnd
    enum status "active|paused|cancelled"
    timestamp createdAt
    timestamp updatedAt
  }

  payments {
    uuid id PK
    uuid subscriptionId FK
    string stripePaymentIntentId
    int amount
    enum status "pending|succeeded|failed"
    timestamp processedAt
    timestamp createdAt
  }

  users ||--o{ subscriptions : "has"
  subscriptions ||--o{ payments : "receives"
