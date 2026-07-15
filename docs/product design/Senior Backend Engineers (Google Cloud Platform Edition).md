# Production Monitoring & Debugging Architecture
## A Comprehensive Guide for Senior Backend Engineers (Google Cloud Platform Edition)

---

## Table of Contents
1. [Why Production Applications Need Logging and Monitoring](#section-1)
2. [Logger vs console.log() - Fundamental Differences](#section-2)
3. [Log Levels and Strategic Usage](#section-3)
4. [Logger Implementation in Node.js](#section-4)
5. [Centralized Logging in Production](#section-5)
6. [Slack Integration for Critical Alerts](#section-6)
7. [Sentry: Internal Architecture and Capabilities](#section-7)
8. [Complete Error Lifecycle](#section-8)
9. [Production Project Folder Structure](#section-9)
10. [Error Handling Patterns in Express.js and NestJS](#section-10)
11. [Development vs Production Logging](#section-11)
12. [Protecting Sensitive Information](#section-12)
13. [Enterprise Logging, Monitoring, and Incident Response](#section-13)
14. [Production-Ready Architecture on GCP](#section-14)

---

## Overview: Why GCP for This Architecture?

**Google Cloud Platform** is ideal for the production monitoring architecture because:

1. **Built-in Services** (No external tools needed for basic logging/monitoring)
   - Cloud Logging: Free centralized logging (50GB/month free)
   - Error Reporting: Free error tracking (replaces Sentry for basic needs)
   - Cloud Monitoring: Free metrics and dashboards
   - Cloud Trace: Free distributed tracing

2. **Lower Costs** than Oracle Cloud with external services
   - GCP logging: Free (vs $100+/month for Elasticsearch)
   - GCP error tracking: Free (vs $300/month for Sentry)
   - Compute Engine: $10-30/month
   - Cloud SQL: $15-40/month

3. **Integrated Ecosystem** - All services work together automatically
   - Logs flow to Cloud Logging automatically
   - Errors appear in Error Reporting automatically
   - Metrics collected automatically
   - No manual setup required

4. **Same Code, Different Platform**
   - Your Winston logger works exactly the same
   - Your Sentry integration works the same
   - Your Slack webhooks work the same
   - Only infrastructure configuration changes

---

<a name="section-1"></a>
## Section 1: Why Production Applications Need Logging and Monitoring

### The Business Case for Production Monitoring

When your application goes live, you lose direct visibility into what users are experiencing. Unlike development, where you're right there watching the code execute, production is a black box—until you implement proper logging and monitoring.

#### The Core Problems Production Monitoring Solves

**Invisibility Problem**: Users report issues, but you have no way to see what happened on their screen, in your backend, or across your microservices. Without logs, it's like trying to diagnose a patient in complete darkness.

**Time-to-Resolution Crisis**: When an outage occurs, every minute costs money. The difference between a 2-minute fix and a 2-hour fix is often determined by how quickly you can:
- Identify that a problem exists (detection)
- Understand what went wrong (diagnosis)
- Isolate the root cause (investigation)
- Deploy a fix (remediation)

Without structured logging and monitoring, you're searching through mountains of data or relying on user reports—both approaches are slow and error-prone.

**Blind Scaling**: As your application scales, complexity explodes exponentially. You might have hundreds of instances running simultaneously. A single failed request might not repeat enough times to notice in console logs, but it could indicate a critical systemic issue affecting thousands of users. Monitoring detects these patterns.

**Compliance and Auditing**: Regulated industries (financial services, healthcare, SaaS) require comprehensive audit trails. You must prove that data was accessed, modified, or deleted by specific users at specific times. Logging isn't optional—it's legally required.

### The Cost of Not Monitoring

Let's quantify why companies invest heavily in monitoring:

- **Amazon estimates 1 hour of downtime = $1.6 million in losses**
- **Industry average MTTR (Mean Time To Resolution) without proper monitoring = 4-8 hours**
- **Industry average MTTR with proper monitoring = 15-30 minutes**
- **That's a 15-30x difference in incident response time**

A single production bug that goes undetected for 8 hours, affecting 10,000 users, could cost hundreds of thousands of dollars in:
- Revenue loss (users can't use your service)
- Reputation damage (churn increases)
- Compliance penalties (if data is compromised)
- Engineering time (incident response at scale)

### What Production Monitoring Enables

When implemented correctly, logging and monitoring provide:

1. **Real-time Alerting**: Critical errors notify on-call engineers immediately (within seconds of occurrence)
2. **Root Cause Analysis**: Stack traces, context about the request, and state of the system when the error occurred
3. **Performance Visibility**: Track how your application behaves under different load conditions
4. **User Experience Insights**: Understand which features cause errors, how users hit edge cases
5. **Trend Detection**: Identify emerging issues before they become critical (error rate trending up 2% per day)
6. **Compliance Proof**: Detailed audit trails for regulatory requirements
7. **Debugging Without Reproduction**: Not all issues are reproducible locally. Logs from production are your only window into the real problem

### The Architecture Perspective

From an architecture standpoint, logging and monitoring are infrastructure concerns, not features. They should be:

- **Decoupled from business logic** (one service can change without affecting another)
- **Highly available** (monitoring system failures shouldn't crash your app)
- **Scalable** (handle millions of log entries per second)
- **Cost-effective** (don't bankrupt you with storage and ingestion costs)
- **Queryable** (you should be able to find "all errors for customer X on 2024-01-15")

This is why enterprise companies use systems like:
- **Centralized log aggregation** (all logs in one place, searchable)
- **Error tracking systems** (Sentry, Datadog, New Relic)
- **Observability platforms** (tracing, metrics, logs—the three pillars)

**On GCP**, you get most of this for free with Cloud Logging, Error Reporting, and Cloud Monitoring.

---

<a name="section-2"></a>
## Section 2: Logger vs console.log() - Fundamental Differences

### Why console.log() is Inadequate for Production

Many junior developers first learn with `console.log()`, and it seems fine during local development:

```javascript
console.log("User logged in:", user.id);
console.error("Database connection failed");
```

This works for development, but it's architecturally naive for production. Here's why:

#### Problem 1: No Structured Data

`console.log()` produces unstructured text output:
```
User logged in: 12345
Database connection failed
```

This is for human reading. But in production, you have millions of log lines. How do you:
- Find all logs where the error was "database connection failed"?
- Count how many times each error occurred?
- Correlate logs from different services?
- Alert when a specific error appears 10+ times in an hour?

You can't do any of this without structured data. Unstructured logs are like writing medical records in freeform paragraphs instead of standardized forms—impossible to aggregate or analyze.

#### Problem 2: No Context Capture

When a user reports "I got an error at 3:45 PM", you need:
- Exact timestamp with timezone
- Request ID (to trace this request through multiple services)
- User ID
- HTTP method and path
- Query parameters (if safe to log)
- Response time
- Error stack trace
- Code version/deployment information
- Which server/container it ran on
- Memory usage at time of failure

`console.log()` captures none of this automatically. You'd need to manually include all this information in every log statement—which nobody does, so critical context is always missing.

#### Problem 3: No Levels or Filtering

`console.log()`, `console.error()`, `console.warn()` exist, but there's no standardized way to:
- Log at different severity levels (is this a minor warning or a critical error?)
- Filter logs by level when reviewing
- Alert only on critical errors, not on debug logs
- Change log level at runtime without redeploying

#### Problem 4: No Destination Control

`console.log()` writes to stdout/stderr. In production:
- Your terminal isn't attached (you're not SSHed into the server)
- Logs might get lost if the container restarts
- You have 50 containers running—which one am I looking at?
- Logs rotate and get deleted after a few days
- There's no central place to search across all logs

**On GCP**: Cloud Logging automatically captures stdout/stderr from all containers.

#### Problem 5: No Integration Capabilities

`console.log()` just prints. It can't:
- Automatically send critical errors to Slack
- Send error data to Sentry with stack traces
- Track error trends and alert when thresholds are crossed
- Correlate logs with performance metrics
- Sample logs intelligently (reduce costs for high-volume scenarios)

### What a Professional Logger Provides

A production-grade logger (Winston, Pino, Bunyan) solves all these problems:

#### 1. Structured Logging
Instead of:
```
User login failed for john@example.com
```

A logger produces:
```json
{
  "timestamp": "2024-01-15T14:23:45.123Z",
  "level": "warn",
  "logger": "auth.service",
  "message": "User login failed",
  "userId": "usr_abc123",
  "email": "john@example.com",
  "reason": "invalid_password",
  "attemptNumber": 3,
  "ipAddress": "192.168.1.1",
  "requestId": "req_xyz789"
}
```

This is JSON—machines can parse it, search it, aggregate it, analyze it.

#### 2. Automatic Context Injection
Professional loggers bind context that flows through your application:
- Request ID (traced from entry point through every microservice call)
- User ID (automatically included in logs, no need to pass it around)
- Correlation IDs (linking logs from different services)
- Environment (dev/staging/production)
- Version/deployment info (which code is running)

#### 3. Configurable Levels
Log levels standardize severity:
- **DEBUG**: Development-only details ("parsing request body", "executing query")
- **INFO**: Normal operational events ("user logged in", "payment processed")
- **WARN**: Unexpected but recoverable issues ("retry attempt 1/3", "deprecated API called")
- **ERROR**: Something failed but the system continues ("failed to send email", "database timeout")
- **FATAL**: System is broken and can't continue ("out of memory", "database unreachable")

You configure your application to only show WARN and above in production, while showing DEBUG and INFO in development.

#### 4. Multiple Destinations Simultaneously
Professional loggers can send to:
- Console (for local development)
- Files on disk (for local access)
- **GCP Cloud Logging** (for centralized analysis)
- Error tracking system (Sentry or GCP Error Reporting)
- Slack/webhooks (for critical errors)
- Metrics system (for trending)

All in parallel. One log statement triggers multiple destinations.

#### 5. Integration with Enterprise Systems
Professional loggers integrate with:
- **Slack**: Critical errors automatically notify the team
- **PagerDuty**: Escalates to on-call engineer if not acknowledged
- **Sentry**: Deduplicates errors and tracks trends
- **GCP Cloud Logging**: Aggregates logs for searching and analysis
- **GCP Cloud Monitoring**: Correlates logs with performance metrics

#### 6. Performance Optimization
Professional loggers are optimized for production:
- Asynchronous writes (logging doesn't block your request)
- Batching (collects logs and sends them in bulk)
- Sampling (reduces volume for high-frequency events)
- Filtering (only logs what's needed, based on configuration)
- Redaction (automatically removes sensitive information)

### The Architectural Difference

**With console.log():**
Your application → stdout/stderr → (captured by GCP but hard to search)

**With professional logging:**
Your application → Logger → {Console | GCP Cloud Logging | Sentry | Slack | Metrics} → All available for analysis

The logger is the central hub that enables visibility into production.

---

<a name="section-3"></a>
## Section 3: Log Levels and Strategic Usage

### Understanding Log Levels

Log levels are a hierarchy of severity, designed to let you dial log verbosity up or down based on context (environment, application state, debugging a specific issue).

#### The Five Standard Levels (Ascending Severity)

**1. DEBUG (Lowest Severity)**
- **Purpose**: Development and troubleshooting only
- **Audience**: Developers debugging a problem
- **Never shown in production** (except during active investigation)
- **Examples**:
  - SQL query details: `SELECT * FROM users WHERE id = $1` with parameter values
  - Function entry/exit: "Entering validateEmail()"
  - Conditional branches taken: "Request lacked auth header, treating as anonymous"
  - Variable values at key points: "Parsed JWT, userId=123, roles=[admin, user]"

**Why DEBUG exists**: When you're debugging an issue, you want to see EVERYTHING the code is doing. But in production, this noise is useless—it's 10GB+ of logs per day.

**When to enable DEBUG in production**: Only during active incident investigation, and only for a limited time. Set a deadline: "Enable DEBUG logging for the auth service for 15 minutes starting now" to avoid forgetting and filling your disk.

---

**2. INFO (Normal Operation)**
- **Purpose**: Track normal application lifecycle events
- **Audience**: Operations team / DevOps / product analytics
- **Always collected in production**
- **Examples**:
  - User lifecycle: "User registered (id=usr_123)"
  - Business transactions: "Payment processed (amount=$99.99, paymentId=pay_xyz)"
  - Service startup: "Server started on port 3000"
  - Configuration: "Connected to database prod-db-01 in us-east-1"
  - Feature usage: "Feature flag 'new_checkout' enabled for user id=456"

**Why INFO exists**: You need to know what your system is doing, at a glance. "Are users signing up?" "How many payments today?" "Did the deployment succeed?" INFO answers these questions.

**Volume**: 1,000-10,000 INFO messages per hour is typical. This is manageable in production.

---

**3. WARN (Warning - Unexpected but Recoverable)**
- **Purpose**: Something unexpected happened, but the system handled it gracefully
- **Audience**: DevOps / on-call engineer / technical leadership
- **Always collected, always investigated** (these are early warning signs)
- **Examples**:
  - Retry scenarios: "Failed to reach payment gateway (attempt 1/3), retrying in 5 seconds"
  - Falling back to defaults: "Redis cache unavailable, using in-memory cache as fallback"
  - Deprecated usage: "Client called deprecated API endpoint /api/v1/users, please upgrade to v2"
  - Resource constraints: "Memory usage 85% of limit, may need to increase instance size"
  - Rate limiting: "Rate limit exceeded for IP 192.168.1.1, throttling requests"
  - Data quality: "Received user signup with no email, treating as invalid"

**Why WARN exists**: Warnings are usually symptoms of emerging problems. Maybe your database response time is slow (one warning). Maybe it's happening every few seconds (problem). Warnings let you detect patterns before they become critical.

**Volume**: 10-100 WARN per hour is typical. Anything more suggests something is wrong.

---

**4. ERROR (Error - Something Failed)**
- **Purpose**: An operation failed and affected at least one user/request
- **Audience**: On-call engineer, immediately
- **Automatically alerts**, even in the middle of the night
- **Examples**:
  - Operation failure: "Failed to send password reset email (userId=123, error=SMTP_TIMEOUT)"
  - Data corruption: "Attempted to insert user with duplicate email, violating uniqueness constraint"
  - Missing dependencies: "Payment gateway API key not configured"
  - Business logic violation: "Refund amount $150 exceeds original payment $99.99"
  - Integration failure: "Third-party API returned 500, unable to sync customer data"

**Why ERROR exists**: Errors mean something is broken. Your job is to fix it. Errors deserve immediate attention.

**Alert threshold**: Many companies alert when ERROR rate exceeds 1% of requests (if 1 in 100 requests produces an error, that's a problem).

**Volume**: Should be <1% of all requests. If you see 100+ ERRORs per hour on a normal day, something is broken.

---

**5. FATAL (Highest Severity - System Broken)**
- **Purpose**: The application cannot continue operating
- **Audience**: On-call engineer, CTO, may trigger automated remediation
- **Always alerts with highest priority**
- **Examples**:
  - Database connection impossible (no connection string, all replicas down)
  - Out of memory (garbage collection can't free enough space)
  - Unrecoverable state (core data structure corrupted)
  - Security breach (encrypted secrets are compromised)

**Why FATAL exists**: Some failures are so severe that there's no point continuing. The only response is to:
1. Stop accepting requests (prevent more damage)
2. Alert every engineer available
3. Potentially trigger automatic failover / restart

**Volume**: Should be zero in normal operation. If you see a FATAL log, your app probably crashed.

---

### Decision Tree: Which Level to Use

When writing a log statement, ask yourself these questions in order:

1. **Is this something I need to debug my code during development?**
   - Yes → **DEBUG**
   - No → Continue

2. **Is this a normal, expected event that happened?**
   - Yes → **INFO**
   - No → Continue

3. **Is something unexpected, but the system handled it gracefully?**
   - Yes → **WARN**
   - No → Continue

4. **Did an operation fail and affect at least one user?**
   - Yes → **ERROR**
   - No → Continue

5. **Is the entire application unable to continue?**
   - Yes → **FATAL**
   - No → You probably shouldn't log this at all

---

### Volume Expectations by Level

Here's what a healthy production system looks like:

| Level | Volume | Action |
|-------|--------|--------|
| DEBUG | N/A (disabled) | Disabled in production unless debugging |
| INFO | 1,000-100,000/hour | Normal operation, archive for analytics |
| WARN | 10-1,000/hour | Monitor trends, investigate spikes |
| ERROR | 1-100/hour (1% of requests) | Alert immediately, page on-call engineer |
| FATAL | 0-1/hour | Critical alert, potential automatic remediation |

If your volume patterns differ dramatically, something is likely wrong:
- Too much INFO? You're logging non-events or too verbosely.
- Too much WARN? Your system is in a degraded state.
- Too much ERROR? Critical business logic is broken.

---

### Strategic Log Level Usage in Different Scenarios

**During development** (local machine):
Set log level to DEBUG. See everything. Use this to understand how your code works.

**During integration testing** (staging/QA environment):
Set log level to INFO or DEBUG. Test teams need to see detailed behavior to validate functionality.

**During normal production operation**:
Set log level to INFO. You see normal operations and can understand what the system is doing. Warnings and errors alert automatically.

**During incident investigation**:
Temporarily lower to DEBUG for the affected service only. This gives you the visibility needed to diagnose the problem. **Set a 15-30 minute deadline to re-enable INFO** to avoid disk space issues.

**For high-volume services** (payment processing, analytics):
Consider INFO + ERROR only, skipping WARN. Warnings for millions of events per hour would be too noisy.

**For business-critical services**:
Include WARN because early detection of degradation is worth the extra volume.

---

<a name="section-4"></a>
## Section 4: Logger Implementation in Node.js

### Overview of Popular Logger Libraries

The Node.js ecosystem has several excellent logging libraries, each with different philosophies:

#### 1. Winston
**Philosophy**: Feature-rich, plugin-based logging
**Best for**: Applications needing multiple transports (files, databases, APIs simultaneously)
**Enterprise usage**: Widely used in larger organizations

Key characteristics:
- Multiple transports (destinations) simultaneously
- Flexible formatting
- Child loggers with bound context
- Built-in error handling
- Integrates well with Sentry, GCP Cloud Logging, monitoring tools

---

#### 2. Pino
**Philosophy**: Extremely fast, minimal overhead, JSON-first
**Best for**: High-performance applications, microseconds matter
**Enterprise usage**: Growing, especially in performance-critical systems

Key characteristics:
- Faster than Winston (optimized for speed)
- JSON logging only (no human-readable plain text)
- Streaming API (results in smaller memory footprint)
- Built-in pretty-printing for development

---

#### 3. Bunyan (Legacy)
**Philosophy**: JSON logging, simple API
**Best for**: Mature systems that have used it for years
**Enterprise usage**: Still used, but newer projects prefer Pino or Winston

---

### Architectural Requirements of a Production Logger

Before discussing implementation specifics, understand what a production logger must provide:

#### 1. Context Propagation
When a request enters your system, it should automatically carry context through:
- Service boundaries (between microservices)
- Async operations (callbacks, promises)
- Different threads/workers

Without automatic propagation, you lose the request ID that ties all logs together.

```
User makes request (requestId = req_123abc)
  → API Gateway logs: "request received" (requestId included automatically)
  → Auth service logs: "validating token" (requestId included automatically)
  → Database logs: "executing query" (requestId included automatically)
  → Response sent: "request completed in 45ms" (requestId included automatically)

All logs have the same requestId, so you can query "show me all logs for req_123abc" 
and see the entire request flow across all services.
```

Without this, you'd have to manually pass requestId to every function call, every promise, every log statement—which doesn't happen in practice.

#### 2. Asynchronous Writing
Logging must be non-blocking. If writing to a file or sending to a remote service takes 50ms, your request handler can't wait for it.

Instead:
- Log statement puts data in an in-memory queue
- Separate worker thread/process writes data asynchronously
- Request handler continues immediately

If the logger is full or the destination is slow, you have a strategy:
- Drop old logs (acceptable for development)
- Block the application (acceptable for critical logs only)
- Queue to disk then retry (acceptable for important logs)

#### 3. Structured Output
Logs must be JSON by default, not human-readable text. The JSON is for machines to parse, query, and analyze. Pretty-printing is for developers during development only.

#### 4. Configurable Destinations
The same logger should output to:
- Console (for local development)
- Files (for local disk access)
- **GCP Cloud Logging** (for centralized analysis)
- Specialized transports (for Sentry, Slack, etc.)

#### 5. Error Tracking
The logger must capture:
- Full stack traces (all frames)
- Error types (what kind of error is this?)
- Error context (what was the request, what was being processed?)
- Request/user information (whose request caused this?)

This data feeds into error tracking systems that deduplicate and trend errors.

#### 6. Performance Optimization
The logger should:
- Avoid creating unnecessary objects in the hot path
- Use buffer pooling to reduce garbage collection
- Support sampling (log 1% of high-frequency events)
- Batch writes for efficiency

---

### Best Practices for Logger Design

#### 1. Child Logger Pattern
Instead of passing the logger as a parameter everywhere:

```javascript
// BAD - logger parameter everywhere
function processPayment(logger, paymentId) {
  logger.info("Processing payment", { paymentId });
}

// GOOD - use child logger
const paymentLogger = logger.child({ service: "payment-processor" });
function processPayment(paymentId) {
  paymentLogger.info("Processing payment", { paymentId });
}
```

Child loggers automatically include their context (service name) in all their logs.

---

#### 2. Correlation IDs / Request Tracking
Every request that enters your system should get a unique ID that follows it everywhere:

```javascript
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || generateUUID();
  req.logger = logger.child({ requestId: req.id });
  next();
});

// Later, in any handler or middleware:
// req.logger automatically includes requestId
req.logger.info("Processing user request", { userId: 123 });
// Output: { ..., requestId: "req_abc123", userId: 123 }
```

This single practice enables powerful debugging—you can query "all logs for this request ID" and see the entire flow.

---

#### 3. Caller Context
When an ERROR occurs, the logger should automatically include:
- File name where the error was logged
- Line number
- Function name

Professional loggers capture this automatically (it's in the JavaScript stack trace), no need to manually include it.

---

#### 4. Bound Context
Logger should support binding context that persists across multiple log statements:

```javascript
const userLogger = logger.child({ userId: 123, email: "user@example.com" });

userLogger.info("User logged in"); // Includes userId and email
userLogger.info("User clicked checkout"); // Includes userId and email
userLogger.error("Payment failed"); // Includes userId and email

// All three logs have userId and email, without repeating it
```

This reduces boilerplate and ensures consistency.

---

#### 5. Environment-Specific Configuration
Logger behavior should change based on environment:

| Environment | Level | Destination | Formatting | Sampling |
|-------------|-------|-------------|-----------|----------|
| Local Dev | DEBUG | Console | Pretty-printed | No |
| Integration | INFO | Console + File | JSON | No |
| Staging | INFO | GCP Cloud Logging + Sentry | JSON | No |
| Production | INFO | GCP Cloud Logging + Sentry + Slack | JSON | Yes (sample high-volume) |

The same logger code runs everywhere, but configuration changes.

---

#### 6. Error Sampling and Deduplication
For high-volume services, logging every error would be too expensive. Instead:

- **Deduplication**: Log the error once, increment a counter each time it happens again
- **Sampling**: Log 100% of errors the first time, then log 1% of subsequent identical errors
- **Time-based**: Log all errors in the first hour after deployment, then sample

This reduces storage and alerting noise while still detecting when errors are happening.

---

### Implementation Patterns

#### Pattern 1: Global Logger Singleton
One logger instance shared across the entire application:

```javascript
// logger.js
const winston = require("winston");

module.exports = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "combined.log" })
  ]
});
```

**Pros**: Simple, works for most applications
**Cons**: Harder to test (global state), less flexible

---

#### Pattern 2: Logger Dependency Injection
Pass logger as a dependency (express middleware):

```javascript
app.use((req, res, next) => {
  req.logger = logger.child({ requestId: generateId() });
  next();
});

app.get("/api/users/:id", (req, res) => {
  // Logger is available in req.logger, with request context
  req.logger.info("Fetching user", { userId: req.params.id });
});
```

**Pros**: Context-aware, easier to test
**Cons**: Requires threading through all layers

---

#### Pattern 3: AsyncLocalStorage (Async Context)
Modern Node.js supports async context that flows through the call stack:

```javascript
const asyncLocalStorage = new AsyncLocalStorage();

app.use((req, res, next) => {
  asyncLocalStorage.run({ requestId: generateId() }, () => next());
});

// Anywhere in your code, access context without passing it:
const requestId = asyncLocalStorage.getStore().requestId;
```

**Pros**: Context flows automatically, no need to pass logger around
**Cons**: Requires Node.js 12.17+, can be confusing to debug

---

### Integration with GCP and Enterprise Systems

A production logger must integrate with:

#### 1. GCP Cloud Logging (Replaces Elasticsearch)
The logger sends logs to GCP Cloud Logging where they're stored, indexed, and searchable.

```javascript
const {Logging} = require("@google-cloud/logging");
const logging = new Logging({
  projectId: process.env.GCP_PROJECT_ID
});
const gcpLogger = logging.log("app-logs");

// Or use Winston transport:
const winston = require("winston");
const {LoggingWinston} = require("@google-cloud/logging-winston");

const logger = winston.createLogger({
  transports: [
    new LoggingWinston({
      projectId: process.env.GCP_PROJECT_ID
    })
  ]
});
```

This enables searching logs from all services in one place through GCP Cloud Logging Console.

---

#### 2. GCP Error Reporting (Replaces Sentry for basic needs)
Critical errors are automatically sent to GCP Error Reporting, which:
- Deduplicates errors (same error reported multiple times = one incident)
- Tracks trends (error rate over time)
- Captures user context (which user hit this error)
- Groups related errors

```javascript
// Errors in Cloud Logging automatically appear in Error Reporting
// No extra configuration needed!
```

---

#### 3. Error Tracking (Sentry - Optional for advanced features)
You can still use Sentry for advanced features like:
- Session replay
- Performance monitoring
- Release tracking
- Custom grouping

```javascript
const sentryTransport = new winston.transports.Sentry({
  sentry: {
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV
  },
  level: "error"
});
```

---

#### 4. Slack Alerts
Critical errors trigger Slack notifications to alert the team:

```javascript
const slackTransport = new CustomSlackTransport({
  webhook: process.env.SLACK_WEBHOOK,
  level: "error"
});
```

---

#### 5. Metrics Collection
The logger can also emit metrics to GCP Cloud Monitoring:

```javascript
const {Monitoring} = require("@google-cloud/monitoring");
const monitoring = new Monitoring();

logger.on("error", () => {
  // Send metric to Cloud Monitoring
  monitoring.timeSeries().create({
    name: "projects/my-project/timeSeries",
    timeSeries: [{
      metric: {type: "custom.googleapis.com/app_errors"},
      points: [{interval: {endTime: {seconds: Date.now()/1000}}, value: {int64Value: 1}}]
    }]
  });
});
```

---

### Testing Strategy for Logger

When testing code that logs:

1. **Mock the logger** to verify the right messages are logged
2. **Test log context** to ensure all expected information is included
3. **Test log levels** to ensure appropriate severity
4. **Test sensitive data redaction** to ensure secrets aren't logged

Example:
```javascript
test("logs user login with correct context", () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn()
  };
  
  loginUser(mockLogger, "user@example.com");
  
  expect(mockLogger.info).toHaveBeenCalledWith(
    "User logged in",
    expect.objectContaining({
      email: "user@example.com"
    })
  );
});
```

---

<a name="section-5"></a>
## Section 5: Centralized Logging in Production

### Why Centralized Logging is Essential

In a production system with multiple services, you have a fundamental problem:

**Single Request → Multiple Services → Logs Everywhere**

```
User makes request to /api/checkout
  ↓
API Gateway (logs to Compute Engine 1)
  ↓
Order Service (logs to Compute Engine 2)
  ↓
Payment Service (logs to Compute Engine 3)
  ↓
Email Service (logs to Compute Engine 4)
  ↓
Response sent

Without centralized logging:
You'd need to SSH into 4 different servers and check logs manually.

With GCP Cloud Logging:
Query: "show me all logs for userId=123 on 2024-01-15 between 14:00 and 14:10"
Result: All logs in one dashboard, chronologically ordered, ready to analyze
```

Without centralized logging, you can't effectively debug multi-service issues.

---

### The Centralized Logging Architecture on GCP

#### Components

1. **Log Producers** (Your Applications)
   - Each application instance generates logs
   - Logs are JSON formatted with metadata
   - Logs are sent to stdout/stderr (GCP captures them automatically)

2. **GCP Cloud Logging** (Automatic Collection)
   - Receives logs from all Compute Engine instances automatically
   - Stores logs in Cloud Logging
   - No setup needed - works out of the box

3. **Log Storage & Indexing**
   - Long-term storage of all logs
   - Optimized for searching and aggregation
   - Free up to 50GB/month
   - Beyond that: $0.50 per GB

4. **Query/Analysis Layer**
   - Cloud Logging Console (web interface)
   - Cloud Logging API (programmatic access)
   - Alerts based on log patterns

---

### Why GCP Cloud Logging is Better Than Self-Hosted Elasticsearch

**Elasticsearch + Kibana**:
- ❌ You manage the cluster (scaling, backups, security)
- ❌ $100-500/month in infrastructure costs
- ❌ Operational overhead (updates, monitoring, etc.)
- ✅ Complete control

**GCP Cloud Logging**:
- ✅ Fully managed by Google
- ✅ Free (50GB/month), then $0.50/GB
- ✅ Zero operational overhead
- ✅ Automatic scaling
- ✅ Built-in retention policies
- ✅ No infrastructure to manage

---

### Best Practices for Centralized Logging on GCP

#### 1. Request ID as Golden Thread
Every request must have a unique ID that flows through all services:

```
User Request (requestId: req_abc123)
  → API Gateway: "request received" (req_abc123)
  → Order Service: "creating order" (req_abc123)
  → Payment Service: "processing payment" (req_abc123)
  → Email Service: "sending confirmation" (req_abc123)

Query in Cloud Logging: "jsonPayload.requestId = 'req_abc123'"
Result: All 4 log entries, showing complete request flow
```

#### 2. Log Sampling for Cost
For high-volume applications, log every ERROR but sample INFO:

```
Production: 10,000 requests per second
  → Every ERROR is logged (1% of requests = 100 ERRORs/sec)
  → Only 1 in 100 INFO messages logged (10,000 INFO/sec → 100 INFO/sec)
  
Result: 200 log entries/sec instead of 10,000/sec
Cost: 50x reduction in logging costs
```

The trade-off: You see all problems, but only see 1% of successful requests.

---

#### 3. Log Retention Policies on GCP
Delete logs after a period to save costs:

```
Production logs: Keep 90 days
Staging logs: Keep 30 days  
Development logs: Keep 7 days

This is standard practice. Most compliance requirements only require retention for 1 year anyway.
```

GCP automatically manages retention based on your configuration.

---

#### 4. Alerting Rules
Define what patterns should trigger alerts:

```
ALERT if ERROR rate > 1% for 5 minutes
ALERT if average response time > 1 second for 10 minutes
ALERT if specific error (e.g., "database connection failed") appears 10+ times in 1 hour
ALERT if any FATAL log appears (immediate, no threshold)
```

Set these up in Cloud Logging → Logs-based Metrics → Create Alert Policy.

---

#### 5. Dashboard Design
Common dashboards in GCP Cloud Monitoring:

- **Overview Dashboard**: Error rate, response time, request volume, critical alerts
- **Service Dashboard**: Per-service metrics and logs (one per microservice)
- **User Dashboard**: All logs for a specific user (great for debugging customer issues)
- **Incident Dashboard**: Historical view of past incidents and resolution time

---

### Querying Logs in GCP Cloud Logging

When debugging production issues, use GCP's query language:

**Find all errors in the past hour:**
```
severity="ERROR" AND timestamp>="2024-01-15T13:00:00Z"
```

**Find all logs for a specific user:**
```
jsonPayload.userId="123" AND timestamp>="2024-01-15T00:00:00Z"
```

**Find errors from a specific service:**
```
resource.labels.service_name="payment-processor" AND severity="ERROR"
```

**Find a pattern (e.g., increasing response time):**
```
httpRequest.latency is present
GROUP BY resource.labels.service_name
ORDER BY AVG(httpRequest.latency) DESC
```

**Find correlated issues (e.g., payment errors + database timeouts):**
```
(jsonPayload.error_type="payment_failed" AND resource.labels.service_name="payment-processor")
OR
(jsonPayload.error_type="timeout" AND resource.labels.service_name="cloud-sql")
```

The ability to perform these queries is what makes centralized logging powerful.

---

<a name="section-6"></a>
## Section 6: Slack Integration for Critical Alerts

### Why Slack Notifications Matter

When a critical error occurs in production, you have a narrow window to respond:

- **First 30 seconds**: Most users haven't noticed yet
- **First 5 minutes**: A few users affected, starting to appear in error tracking
- **First 15 minutes**: Many users affected, beginning to notice
- **After 30 minutes**: Widespread impact, customers opening support tickets

Slack integration enables your team to be notified in this critical window, while the incident is still small and containable.

### Critical vs Non-Critical Errors

**Send to Slack (Critical)**:
- ERROR or FATAL logs (system broken, users affected)
- Error rate spike (normal: <1 error/minute, spike: >10 errors/minute)
- Service health check failures (service is down)

**Don't Send to Slack (Too Noisy)**:
- INFO logs (users logging in, payments processing normally)
- WARN logs (retry attempts, degraded but working)
- Every DEBUG log (would spam the channel instantly)

The key principle: **Only alert on things that require immediate action from an engineer.**

---

### Slack Integration Mechanisms

#### Mechanism 1: Webhooks
The logger sends HTTP POST to Slack webhook URL:

```
Logger → (HTTP POST) → Slack Webhook → Slack Channel

Advantages:
- Simple, one-way communication
- Logger doesn't need authentication
- Stateless (webhook URL is just a URL)

Disadvantages:
- No feedback to application if webhook fails
- Can't acknowledge or interact with alert from Slack
```

#### Mechanism 2: Slack Bot
Application acts as a bot connected to Slack:

```
Logger → (in-process) → Slack Bot → Slack Channel

Advantages:
- Bidirectional communication (Slack can ask bot for more info)
- Lower latency
- Can acknowledge alerts and update status

Disadvantages:
- Requires maintaining bot authentication
- More complex to set up
```

---

### Webhook Integration Architecture

When an ERROR occurs:

```
Logger captures error:
{
  "level": "error",
  "message": "Database connection failed",
  "error": "ECONNREFUSED: Connection refused",
  "service": "order-processor",
  "timestamp": "2024-01-15T14:23:45.123Z"
}
    ↓
Transport layer checks: Is this level WARN+ or ERROR/FATAL?
    ↓
YES → Create JSON payload for Slack:
{
  "text": "🚨 Production Error: order-processor",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Order Processor Error*\n`Database connection failed`"
      }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Service*\norder-processor" },
        { "type": "mrkdwn", "text": "*Level*\nerror" },
        { "type": "mrkdwn", "text": "*Time*\n2024-01-15 14:23:45 UTC" },
        { "type": "mrkdwn", "text": "*Error*\nECONNREFUSED" }
      ]
    }
  ]
}
    ↓
POST to Slack Webhook URL
    ↓
Message appears in #production-alerts channel
    ↓
On-call engineer sees notification
    ↓
Starts investigating
```

---

### Slack Message Design Best Practices

**Bad Slack alert:**
```
Order Processor Error: Database connection failed
```

**Why it's bad**: No context. Engineer has to go dig through logs to understand what happened.

---

**Good Slack alert:**
```
🚨 Order Processor - Database Connection Failed

Service: order-processor
Environment: production
Level: ERROR
Timestamp: 2024-01-15 14:23:45 UTC
Error: ECONNREFUSED: Connection refused to 192.168.1.10:5432
Affected Since: 45 seconds ago
Impact: Unable to process new orders (3 affected orders)

View in Cloud Logging: [Link]
View in Error Reporting: [Link]
```

**Why it's better**:
- Icon immediately shows severity
- Service name is clear
- Timestamp shows when it started
- Error message shows root cause
- Impact assessment (how many users affected)
- Direct links to investigation tools (GCP Cloud Logging, Error Reporting)

---

### Preventing Alert Fatigue

**Alert fatigue** happens when you get too many alerts:
- Engineers ignore them (bad: real problems go unnoticed)
- Context switching (engineers constantly interrupted)
- Alert desensitization (we stop caring about alerts)

**Strategies to prevent alert fatigue**:

#### 1. Alert Only on Actionable Errors
If an error occurs but the system automatically recovered (retry succeeded, failover activated), don't alert. The system already handled it.

```
❌ Alert on: "Retry attempt 1/3 to payment gateway"
✓ Alert on: "Payment gateway unreachable after 3 retries, customers affected"
```

#### 2. Deduplication
If the same error occurs 100 times in a minute, don't send 100 Slack messages. Send one, with a note that it happened 100 times.

```
🚨 Database Connection Failed
Occurred: 100 times in the last 2 minutes
```

#### 3. Escalation Thresholds
Different alerts for different severity levels:

```
1 error → Logged to #dev-alerts (team sees it, but no notification)
5 errors in 1 minute → Slack notification to #production-alerts
10 errors in 1 minute → SMS/Call to on-call engineer
Service down → PagerDuty escalation to management
```

#### 4. Suppression Windows
Temporarily suppress alerts during known maintenance:

```
During deployment from 14:00-14:15 UTC, suppress alerts
because errors are expected while services restart.
```

---

### Slack Workflow Integration

Modern Slack allows you to create workflows that respond to alerts:

```
Alert arrives in #production-alerts
    ↓
Slack workflow triggered
    ↓
Auto-actions:
  1. Create incident in PagerDuty
  2. Create channel #incident-2024-01-15
  3. Invite on-call engineer to channel
  4. Post full error details to channel
  5. Set bot to auto-update with latest logs from Cloud Logging
    ↓
Engineer joins channel and starts investigating
```

This automation reduces time from "error occurred" to "engineer started investigating" from minutes to seconds.

---

### Monitoring the Monitoring System

Your Slack integration itself needs monitoring:

```
If Slack webhook fails 5 times in a row:
  - Critical error happened
  - Slack is unreachable or webhook URL invalid
  - Engineers don't know about the error

So: If we can't send to Slack, fall back to:
  - SMS alert
  - Email alert
  - PagerDuty escalation
  - Log to Cloud Logging with FATAL level
```

---

<a name="section-7"></a>
## Section 7: Sentry: Internal Architecture and Capabilities

### What is Sentry?

Sentry is an error tracking and performance monitoring platform that sits between your application and your visibility into production issues.

**On GCP, you have two options:**
```
Option 1: Use GCP Error Reporting (free, basic)
Your App → Error Reporting → Error dashboard
(Good for: error deduplication, trends, alerting)

Option 2: Use Sentry + GCP Error Reporting (paid but advanced)
Your App → Sentry → Advanced features + Error Reporting
(Good for: session replay, performance monitoring, release tracking)
```

**Simple mental model:**
```
Your App → Generates error → Sends to Sentry → Sentry deduplicates/trends errors → Dashboard shows issues

When you click "View in Sentry", you see:
- How many users hit this error
- In which code version
- Stack trace
- Request that caused it
- User information
- Browser/OS information
- Related errors
- Session replay (what user was doing when error happened)
```

---

### Sentry's Core Components

#### 1. Error Capture
When your app throws an error, Sentry captures:

```json
{
  "exception": {
    "type": "TypeError",
    "value": "Cannot read property 'id' of undefined",
    "stackTrace": [
      { "filename": "payment.js", "function": "processPayment", "line": 45 },
      { "filename": "order.js", "function": "checkout", "line": 120 },
      { "filename": "api.js", "function": "POST /api/checkout", "line": 50 }
    ]
  },
  "request": {
    "url": "https://example.com/api/checkout",
    "method": "POST",
    "query": { "cart_id": "123" },
    "body_size": 2048
  },
  "user": {
    "id": "usr_abc123",
    "email": "user@example.com",
    "username": "johndoe"
  },
  "environment": "production",
  "release": "2.3.1",
  "timestamp": "2024-01-15T14:23:45.123Z"
}
```

This is much more detailed than just the error message.

---

#### 2. Error Deduplication
Sentry groups errors intelligently:

```
Error 1: TypeError at payment.js line 45
Error 2: TypeError at payment.js line 45
Error 3: TypeError at payment.js line 45

Sentry says: "Same error 3 times" and groups them as 1 issue
Instead of 3 notifications, you get 1 notification: "Error occurred 3 times"
```

Deduplication uses:
- File name and line number (most important)
- Error type and message
- Stack trace signature

Without deduplication, a bug that affects 10,000 users would spam you with 10,000 error notifications. With it, you get one "Issue: X occurred 10,000 times".

---

#### 3. Release Tracking
Sentry associates errors with code releases:

```
Release 2.3.0 deployed 2024-01-14
  No errors for 2 hours (good)

Release 2.3.1 deployed 2024-01-15
  Error rate spikes from <1% to 15%

Sentry shows: "Error rate regression in 2.3.1"
You know: Something introduced in 2.3.1 is broken
Action: Rollback 2.3.1 or deploy fix
```

This is critical for understanding when a bug was introduced.

---

#### 4. Stack Trace Symbolicization
For errors in production code, stack traces might look like:

```
at processPayment (bundle.js:12345:67)
```

This is useless—12345:67 is in a minified bundle. Sentry uses source maps to "un-minify" this:

```
at processPayment (payment.js:45:10)
  payment.js line 45, column 10
```

Now it's readable. Source maps are shipped with each release to Sentry, so it can map minified code back to readable source.

---

#### 5. Performance Monitoring
Sentry also tracks performance:

```
Endpoint: POST /api/checkout

Slow requests (>5 seconds):
- Request duration: 7.2 seconds
  - Auth middleware: 1.2s
  - Database query: 4.5s
  - Response serialization: 1.5s
  - Total: 7.2s

Sentry shows: Database query is the bottleneck
```

This helps you understand not just that the endpoint is slow, but *where* the slowness is.

---

#### 6. User Context & Session Replay
Sentry captures user information with errors:

```
Error: Payment failed

User: johndoe (user_id: 123)
Email: john@example.com
Subscription: Pro

Error rate for this user: 3 errors in past 24 hours

Session Replay: Watch what user was doing when error happened
```

This helps you understand if:
- Error is affecting everyone or specific users
- Problem is reproducible for this user
- User has a pattern of issues

---

### GCP Error Reporting vs Sentry

| Feature | GCP Error Reporting | Sentry |
|---------|-------------------|--------|
| Cost | Free | $300+/month |
| Error Deduplication | ✅ Yes | ✅ Yes |
| Error Trends | ✅ Yes | ✅ Yes |
| Stack Traces | ✅ Yes | ✅ Yes |
| Release Tracking | ❌ No | ✅ Yes |
| Session Replay | ❌ No | ✅ Yes |
| Performance Monitoring | ❌ No | ✅ Yes |
| User Context | ✅ Yes | ✅ Yes |
| Cloud Logging Integration | ✅ Automatic | ❌ Separate |

**Recommendation:**
- **Start with GCP Error Reporting** (free, gets you 80% of the way)
- **Add Sentry later** if you need session replay or performance monitoring

---

### Sentry Workflow: Error to Resolution

Here's the typical workflow when an error is captured:

```
1. Error Occurs in Production
   Your app throws: TypeError: Cannot read property 'id' of undefined
   
2. Sentry Receives Error
   Captures full context: stack trace, request data, user info, environment
   
3. Deduplication
   Sentry groups with similar errors: "TypeError in payment.js line 45"
   
4. Alert Triggered
   - If first time seeing this error: Send to #production-alerts on Slack
   - If same error seen before: Just increment counter
   - If same error from same code version: Might suppress (known issue)
   
5. Engineer Investigates
   Clicks Sentry link from Slack
   Sees:
   - Full stack trace (un-minified)
   - Request that caused error
   - User affected
   - Browser/environment info
   - Previous occurrences of same error
   
6. Root Cause Analysis
   Engineer examines code at payment.js line 45:
   "const orderId = order.id;" ← order is sometimes undefined
   
   Engineer finds in git: PR that added this line didn't check if order exists
   
7. Fix Deployed
   Engineer writes test: "should handle undefined order gracefully"
   Engineer deploys fix in version 2.3.2
   
8. Error Resolved
   Release notes: "2.3.2 - Fixed: Graceful handling of missing order data"
   Sentry marks issue as "Resolved in 2.3.2"
   Error no longer reported for new releases
   
9. Verification
   Sentry shows: Error count dropped from 50/day to 0/day
```

---

### Best Practices for Error Tracking on GCP

#### 1. Use GCP Error Reporting First
Start free:
```
Your app logs errors → GCP Cloud Logging captures them
Error Reporting deduplicates and alerts automatically
No configuration needed!
```

#### 2. Add Sentry If Needed
For advanced features:
```
Your app → Sentry (for session replay, performance monitoring)
        → GCP Cloud Logging (for log storage)
        → Slack (for alerts)
```

#### 3. Set Release Version
Always tag errors with your app version:
```javascript
// For Sentry
Sentry.setRelease("2.3.1");

// For GCP Error Reporting (in Cloud Logging)
logger.info("App started", { 
  release: "2.3.1",
  deployment: "gke-prod"
});
```

---

<a name="section-8"></a>
## Section 8: Complete Error Lifecycle

### End-to-End Error Journey on GCP

Let me trace what happens when a user encounters an error in production, step by step:

```
STAGE 1: ERROR OCCURS
===================

User: clicks "Proceed to Payment" button
Frontend: Sends POST /api/checkout

Backend (Express.js on Compute Engine):
  app.post('/api/checkout', async (req, res) => {
    const order = await Order.findById(req.body.orderId);
    console.log("Order ID:", order.id); // ← BUG: order is undefined
  });

JavaScript throws: TypeError: Cannot read property 'id' of undefined
Location: checkout.js line 85
Stack trace: [checkout.js:85, processPayment.js:42, api.js:120]


STAGE 2: ERROR CAPTURED BY LOGGER
==================================

Logger middleware catches unhandled error:
  req.logger.error("Checkout failed", {
    userId: req.user.id,
    orderId: req.body.orderId,
    endpoint: "POST /api/checkout",
    requestId: "req_abc123xyz",
    error: err.stack,
    statusCode: 500
  });

Output (JSON to stdout):
{
  "timestamp": "2024-01-15T14:23:45.123Z",
  "level": "error",
  "message": "Checkout failed",
  "userId": "usr_12345",
  "orderId": "order_67890",
  "endpoint": "POST /api/checkout",
  "requestId": "req_abc123xyz",
  "error": "TypeError: Cannot read property 'id' of undefined\n  at checkout.js:85:15\n  at ...",
  "statusCode": 500,
  "service": "checkout-service",
  "environment": "production",
  "release": "2.3.1"
}


STAGE 3: LOG AUTOMATICALLY CAPTURED BY GCP
============================================

GCP Cloud Logging automatically captures:
  → All stdout/stderr from Compute Engine instances
  → No setup needed!
  → Logs stored in Cloud Logging
  
GCP Error Reporting automatically:
  → Detects errors from log entries
  → Deduplicates: "TypeError in checkout.js line 85"
  → Creates issue: "TypeError: Cannot read property 'id' of undefined"


STAGE 4: ALERTS PROPAGATE
==========================

GCP Error Reporting Alert:
  Error Reporting dashboard shows: "New Issue: TypeError at checkout.js"
  Email sent to team: "New error in checkout service"
  Time: < 5 seconds after error

If using Sentry (optional):
  Sentry receives error
  Deduplicates same error
  Sends advanced alert


STAGE 5: SLACK ALERT (If configured)
=====================================

Logger also sends to Slack via webhook:
  Alert posted to #production-alerts channel
  Message:
    "🚨 ERROR: Checkout Service - TypeError at checkout.js:85
     User: john@example.com (usr_12345)
     Order: order_67890
     Time: 2024-01-15 14:23:45 UTC
     [View in Cloud Logging] [View in Error Reporting]"
  
  Time to notification: < 2 seconds after error


STAGE 6: ENGINEER INVESTIGATES
================================

On-call engineer (woken up by Slack notification):
  1. Looks at Slack message, sees error summary
  2. Clicks "View in Cloud Logging" link
  3. Cloud Logging shows:
     - Error timestamp
     - Full stack trace
     - Request context (user, path, parameters)
     - All logs around this time
  4. Opens source code at checkout.js:85:
     Line 85: const orderId = order.id; ← PROBLEM: order is undefined
  5. Searches git blame:
     "Order object missing validation - added in PR #2847 by Alice"
  6. Checks PR #2847:
     "Added optional order lookup, but forgot to handle undefined case"


STAGE 7: ROOT CAUSE IDENTIFIED
================================

Engineer realizes:
  - In version 2.3.0: Order always validated before use
  - In version 2.3.1: Added "fast path" that skips validation for premium users
  - The "fast path" forgot to check if order exists
  
  Root cause: PR #2847 forgot to handle undefined order

Affected: All users who follow this code path
Since: 2024-01-15 12:34:00 (when 2.3.1 deployed to Compute Engine)
Duration: ~2 hours so far
Impact: 50+ users unable to checkout
Revenue loss: ~$500+ (rough estimate)


STAGE 8: FIX DEVELOPED & DEPLOYED
==================================

Engineer writes fix, tests, deploys version 2.3.2
  
Deployment process:
  1. Code committed to main
  2. Cloud Build triggers (GCP's CI/CD)
  3. New container image built
  4. Image pushed to Container Registry
  5. Compute Engine instances updated
  6. All instances running 2.3.2 within 5 minutes


STAGE 9: ERROR STOPS
=======================

New errors stop occurring:
  - Last error at 14:23:45 in version 2.3.1
  - No new errors after 14:52:00 (deployment time)
  
Error Reporting detects: "Issue resolved in 2.3.2"
  - Previous version (2.3.1): 68 errors total
  - Current version (2.3.2): 0 errors
  
Status changes from "Unresolved" → "Resolved in 2.3.2"


STAGE 10: MONITORING & RESOLUTION
==================================

Engineer verifies fix:
  1. Check Error Reporting: Error count is 0 ✓
  2. Check Cloud Logging: No more TypeErrors at checkout.js:85 ✓
  3. Check Cloud Monitoring: Checkout success rate back to 99.9% ✓
  
Slack notification sent: "✅ Issue resolved - fix deployed in 2.3.2"

Post-incident review:
  - Timeline: Error started 12:34, detected 12:35, fixed 14:52 = 2h 18m
  - Could have been faster if test coverage was higher
  - Added to code review checklist: "Check for undefined object access"
  
Final log in Error Reporting:
  "Issue resolved in version 2.3.2
   Root cause: Missing validation for optional order lookup
   Fix: Added guard clause to handle undefined order
   Impact: Affected 50 users, $500 revenue impact
   Duration: 2h 18m from error to fix deployed"
```

This entire cycle—from error occurrence to resolution—depends on the monitoring system being in place. 

**The difference with GCP:**
- ✅ No need to manage Elasticsearch (Google manages Cloud Logging)
- ✅ No need to setup centralized logging (automatic from Compute Engine)
- ✅ Error deduplication happens automatically (Error Reporting)
- ✅ Lower costs (Cloud Logging free, Error Reporting free)

---

### Key Points from the Error Lifecycle

1. **Every second counts**: Errors are detected within 2 seconds. Investigation starts within 5 seconds. This speed is only possible with proper monitoring.

2. **Context is critical**: Without user context, request data, and stack trace, the engineer would be hunting blind. Structured logging captured all this.

3. **Deduplication prevents alert fatigue**: Instead of 68 Slack messages (one per error), one message saying "68 errors of this type."

4. **Release tracking enables fast recovery**: The engineer immediately knew this was introduced in 2.3.1. Without release tracking, debugging would take much longer.

5. **Centralized logging enables search**: The engineer could query "show me all logs for this request ID" and see the entire flow. GCP Cloud Logging makes this instant.

6. **Monitoring guides testing**: The error made the fix obvious. Good monitoring surfaces the problem in a way that points to the solution.

---

<a name="section-9"></a>
## Section 9: Production Project Folder Structure

### Folder Structure for Monitoring and Logging on GCP

For a production Node.js application running on GCP with proper logging and monitoring:

```
my-app/
├── src/
│   ├── config/
│   │   ├── logger.config.js          # Logger setup (Winston/Pino config)
│   │   ├── gcp.config.js             # GCP initialization (Cloud Logging, Error Reporting)
│   │   ├── sentry.config.js          # Sentry initialization (optional)
│   │   ├── monitoring.config.js      # Cloud Monitoring and alerting setup
│   │   └── constants.config.js       # Log levels, environments
│   │
│   ├── logging/
│   │   ├── logger.js                 # Main logger instance
│   │   ├── context.js                # Request context management
│   │   ├── middleware/
│   │   │   ├── request-logger.js    # Middleware to log requests
│   │   │   ├── error-handler.js     # Error handling middleware
│   │   │   ├── correlation-id.js    # Request ID generation
│   │   │   └── performance.js       # Performance logging
│   │   ├── transports/
│   │   │   ├── gcp-logging.js       # Send to GCP Cloud Logging
│   │   │   ├── sentry-transport.js  # Send to Sentry (optional)
│   │   │   ├── slack-transport.js   # Send alerts to Slack
│   │   │   ├── file-transport.js    # Write to local files (dev)
│   │   │   └── console-transport.js # Console output (dev)
│   │   ├── redaction/
│   │   │   ├── sensitive-fields.js  # List of fields to redact
│   │   │   └── redactor.js          # Redaction logic
│   │   └── formatters/
│   │       ├── json-formatter.js    # Format logs as JSON
│   │       └── pretty-formatter.js  # Pretty-print for dev
│   │
│   ├── monitoring/
│   │   ├── metrics/
│   │   │   ├── database.js          # DB query metrics
│   │   │   ├── http.js              # HTTP request metrics
│   │   │   ├── errors.js            # Error rate metrics
│   │   │   └── performance.js       # Response time metrics
│   │   ├── health-check.js          # Service health endpoint
│   │   ├── trace.js                 # Cloud Trace setup
│   │   └── alerts.js                # Cloud Monitoring alert definitions
│   │
│   ├── middleware/
│   │   ├── request-context.js       # Bind logger to request
│   │   ├── error-handling.js        # Catch and log errors
│   │   └── performance.js           # Track response times
│   │
│   ├── services/
│   │   ├── order.service.js         # Business logic
│   │   ├── payment.service.js       # Business logic
│   │   └── ...
│   │
│   ├── api/
│   │   ├── routes/
│   │   │   ├── orders.routes.js
│   │   │   ├── payments.routes.js
│   │   │   └── ...
│   │   └── controllers/
│   │       ├── orders.controller.js
│   │       └── payments.controller.js
│   │
│   ├── database/
│   │   ├── connection.js            # Cloud SQL connection (with logging)
│   │   ├── migrations/
│   │   └── seeders/
│   │
│   ├── utils/
│   │   ├── error-handler.js         # Error handling utilities
│   │   ├── request-id.js            # Generate unique request IDs
│   │   └── validators.js
│   │
│   └── app.js                       # Main app setup
│
├── logs/
│   ├── combined.log                 # All logs (development only)
│   ├── error.log                    # Errors only (development only)
│   └── .gitignore                   # Never commit logs to git
│
├── config/
│   ├── .env.example                 # Example environment variables
│   ├── .env.development             # Dev environment
│   ├── .env.staging                 # Staging environment
│   └── .env.production              # Production environment
│
├── infra/
│   ├── gcp/
│   │   ├── main.tf                  # Terraform for Compute Engine
│   │   ├── cloud-sql.tf             # Terraform for Cloud SQL
│   │   ├── cloud-logging.tf         # Terraform for Cloud Logging
│   │   └── cloud-monitoring.tf      # Terraform for Cloud Monitoring
│   ├── kubernetes/
│   │   ├── deployment.yaml          # GKE deployment (if using Kubernetes)
│   │   ├── service.yaml             # GKE service
│   │   └── monitoring.yaml          # GKE monitoring
│   └── cloudbuild.yaml              # GCP Cloud Build CI/CD
│
├── tests/
│   ├── unit/
│   │   ├── logging/
│   │   │   ├── logger.test.js
│   │   │   ├── redactor.test.js
│   │   │   └── context.test.js
│   │   └── services/
│   │
│   ├── integration/
│   │   ├── logging/
│   │   │   ├── gcp-logging-integration.test.js
│   │   │   ├── sentry-integration.test.js
│   │   │   └── slack-integration.test.js
│   │   └── services/
│   │
│   └── e2e/
│       └── error-flow.test.js       # Test full error lifecycle
│
├── docker/
│   ├── Dockerfile                   # Container configuration
│   └── docker-compose.yml           # Local dev setup
│
├── .github/
│   ├── workflows/
│   │   ├── build.yml                # CI pipeline
│   │   ├── test.yml                 # Run tests
│   │   └── deploy.yml               # Deploy to GCP
│   └── INCIDENT_RESPONSE.md         # Incident response procedures
│
├── docs/
│   ├── LOGGING.md                   # Logging guidelines
│   ├── MONITORING.md                # GCP monitoring guide
│   ├── DEBUGGING.md                 # How to debug production issues
│   ├── GCP-SETUP.md                 # GCP infrastructure setup
│   ├── INCIDENT_RESPONSE.md         # Step-by-step incident response
│   └── ERROR_EXAMPLES.md            # Common errors and solutions
│
├── package.json
├── .env.example
├── README.md
└── ARCHITECTURE.md                  # System architecture docs
```

---

### Key Directories Explained

#### `/src/logging/`
The heart of your observability system:
- **logger.js**: Main logger instance
- **middleware/**: Auto-logging of requests
- **transports/**: GCP Cloud Logging, Sentry, Slack, files
- **redaction/**: Sensitive data handling
- **formatters/**: Log formatting (JSON, pretty-print)

#### `/src/config/`
Configuration for different environments:
- **gcp.config.js**: GCP project ID, credentials setup
- **logger.config.js**: Logger level and transports
- **sentry.config.js**: Sentry DSN (if using Sentry)

#### `/src/monitoring/`
Observability setup:
- Metrics collection for Cloud Monitoring
- Health checks for Cloud Run or load balancer
- Cloud Trace setup for distributed tracing

#### `/infra/gcp/`
Infrastructure as Code:
- Terraform files to create Compute Engine instances
- Cloud SQL databases
- Cloud Logging configuration
- Cloud Monitoring dashboards and alerts

#### `/infra/cloudbuild.yaml`
GCP's CI/CD pipeline:
- Build Docker image
- Run tests
- Push to Container Registry
- Deploy to Compute Engine or GKE

---

### Environment-Specific Configuration on GCP

**Development (.env.development)**
```
NODE_ENV=development
LOG_LEVEL=debug
LOG_FORMAT=pretty

# Outputs to console only
TRANSPORTS=console

# GCP disabled for dev
GCP_PROJECT_ID=

# Sentry disabled
SENTRY_DSN=

# Slack disabled
SLACK_WEBHOOK=

# Local database
DATABASE_URL=postgres://localhost/my_app_dev
```

---

**Staging (.env.staging)**
```
NODE_ENV=staging
LOG_LEVEL=info
LOG_FORMAT=json

# Outputs to GCP Cloud Logging
TRANSPORTS=console,gcp-logging

# GCP Cloud Logging
GCP_PROJECT_ID=my-project-staging

# Sentry (optional)
SENTRY_DSN=https://key@sentry.io/12345

# Slack alerts to staging channel
SLACK_WEBHOOK=https://hooks.slack.com/services/...

# Staging database on Cloud SQL
DATABASE_URL=postgres://user:pass@staging-db.c.my-project-staging.internal/my_app_staging
```

---

**Production (.env.production)**
```
NODE_ENV=production
LOG_LEVEL=info
LOG_FORMAT=json

# Outputs only to GCP Cloud Logging (no console)
TRANSPORTS=gcp-logging,sentry,slack

# GCP Cloud Logging
GCP_PROJECT_ID=my-project-prod

# Sentry (optional, for advanced features)
SENTRY_DSN=https://key@sentry.io/12345

# Slack alerts to production channel
SLACK_WEBHOOK=https://hooks.slack.com/services/...

# Production database on Cloud SQL
DATABASE_URL=postgres://user:pass@prod-db.c.my-project-prod.internal/my_app_production

# Sampling configuration
LOG_SAMPLE_RATE=0.1
ERROR_SAMPLE_RATE=1.0
```

---

### GCP Configuration Files

**src/config/gcp.config.js**
```javascript
// Initialize GCP services
const {Logging} = require("@google-cloud/logging");
const {ErrorReporting} = require("@google-cloud/error-reporting");
const {Monitoring} = require("@google-cloud/monitoring");

const projectId = process.env.GCP_PROJECT_ID;

// Cloud Logging
const logging = new Logging({projectId});

// Error Reporting
const errorReporting = require("@google-cloud/error-reporting").start({
  projectId,
  serviceContext: {
    service: "checkout-service",
    version: process.env.RELEASE_VERSION || "unknown"
  }
});

// Cloud Monitoring
const monitoring = new Monitoring({projectId});

module.exports = {
  logging,
  errorReporting,
  monitoring,
  projectId
};
```

**src/logging/middleware/request-logger.js**
```javascript
// Middleware to log all requests
module.exports = (req, res, next) => {
  // Generate request ID
  req.id = req.headers['x-request-id'] || generateUUID();
  
  // Create child logger with request context
  req.logger = logger.child({
    requestId: req.id,
    userId: req.user?.id,
    path: req.path,
    method: req.method
  });
  
  // Log request received
  req.logger.info("Request received", {
    path: req.path,
    method: req.method
  });
  
  // Track response time
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    req.logger.info("Request completed", {
      statusCode: res.statusCode,
      duration
    });
  });
  
  next();
};
```

**src/logging/middleware/error-handler.js**
```javascript
// Central error handler
module.exports = (err, req, res, next) => {
  // Log error
  req.logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    statusCode: err.statusCode || 500
  });
  
  // Send to Error Reporting automatically
  // GCP captures ERROR level logs in Cloud Logging
  // Error Reporting reads from Cloud Logging
  
  // Send to Sentry if configured
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
  
  // Respond to client
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 ? "Internal server error" : err.message;
  
  res.status(statusCode).json({
    error: message,
    code: err.code || "INTERNAL_ERROR"
  });
};
```

---

<a name="section-10"></a>
## Section 10: Error Handling Patterns in Express.js and NestJS

### Principles of Production Error Handling

Before specific patterns, understand the principles:

**Principle 1: Explicit Over Implicit**
Never silently ignore errors. Always:
- Log the error (with context)
- Either handle it or propagate it
- Never swallow exceptions without understanding why

**Principle 2: Fail Fast, Fail Clearly**
- Detect errors as soon as possible (not after processing completes)
- Communicate errors clearly to caller
- Provide enough context for debugging

**Principle 3: Graceful Degradation**
- If a service is slow, maybe retry or timeout
- If a service is down, maybe use cached data or fallback
- Don't cascade failures (one service down → whole system down)

**Principle 4: Separate Error Types**
- **Operational errors**: Expected errors (invalid input, not found) - handle gracefully
- **Programming errors**: Bugs in code (undefined.property, wrong type) - log and alert
- **System errors**: Infrastructure problems (DB down, out of memory) - alert and attempt recovery

---

### Express.js Error Handling Patterns

#### Pattern 1: Central Error Handler Middleware
Most errors should be caught in one place:

```javascript
// At the END of app.js (after all other middleware)
app.use((err, req, res, next) => {
  // This catches errors thrown in any route handler
  
  // Log the error (automatically goes to GCP Cloud Logging)
  req.logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
    endpoint: req.method + " " + req.path,
    userId: req.user?.id
  });
  
  // Determine response based on error type
  if (err.statusCode) {
    // Expected error (ValidationError, NotFoundError, etc.)
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code
    });
  } else {
    // Unexpected error (programming error)
    // Don't expose internals to client
    return res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR"
    });
  }
});
```

**Why this works:**
- All errors go through one handler (consistency)
- Sensitive details are logged but not exposed to client
- Logs automatically go to GCP Cloud Logging
- Error appears in GCP Error Reporting

---

#### Pattern 2: Try/Catch in Async Handlers
Express doesn't automatically catch errors in async functions:

```javascript
// BAD - Error is unhandled
app.get("/users/:id", async (req, res) => {
  const user = await User.findById(req.params.id); // Might throw
  res.json(user);
});

// GOOD - Wrap in try/catch
app.get("/users/:id", async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    res.json(user);
  } catch (err) {
    next(err); // Pass to error handler
  }
});

// BETTER - Use wrapper function
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.get("/users/:id", asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  res.json(user);
  // Any error is automatically passed to error handler
}));
```

---

#### Pattern 3: Custom Error Classes
Create specific error types for different situations:

```javascript
// Base class
class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

// Specific errors
class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

class NotFoundError extends AppError {
  constructor(resource) {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

// Usage:
app.get("/users/:id", asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  
  if (!user) {
    throw new NotFoundError("User");
  }
  
  res.json(user);
}));
```

---

### NestJS Error Handling Patterns

NestJS has built-in structures for error handling:

#### Pattern 1: Exception Filters
NestJS equivalent of Express error handlers:

```typescript
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    
    let status = 500;
    let message = "Internal server error";
    let code = "INTERNAL_ERROR";

    // Handle expected errors
    if (exception instanceof ValidationError) {
      status = 400;
      message = exception.message;
      code = "VALIDATION_ERROR";
    } else if (exception instanceof NotFoundException) {
      status = 404;
      message = exception.getResponse()["message"];
      code = "NOT_FOUND";
    }

    // Log the error (automatically goes to GCP Cloud Logging)
    this.logger.error("Request failed", {
      status,
      message,
      path: request.url,
      method: request.method,
      error: exception
    });

    response.status(status).json({
      statusCode: status,
      error: code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url
    });
  }
}

// Register globally in main.ts
app.useGlobalFilters(new AllExceptionsFilter());
```

---

#### Pattern 2: Custom HTTP Exceptions
NestJS provides base exceptions:

```typescript
export class NotFoundException extends HttpException {
  constructor(resource: string) {
    super(
      `${resource} not found`,
      HttpStatus.NOT_FOUND
    );
  }
}

// Usage:
@Get(':id')
async findOne(@Param('id') id: string) {
  const user = await this.usersService.findById(id);
  
  if (!user) {
    throw new NotFoundException('User');
  }
  
  return user;
}
```

---

<a name="section-11"></a>
## Section 11: Development vs Production Logging

### The Logging Environment Problem

The same code needs to behave differently in different environments:

**Development:**
- Developers are actively debugging
- They want to see EVERYTHING (DEBUG, INFO, WARN, ERROR)
- They want pretty, readable output
- They're willing to sacrifice performance for visibility
- Logs go to console (immediately visible)

**Production on GCP:**
- Engineers aren't actively debugging (except during incidents)
- They want to see important events (INFO, WARN, ERROR)
- They want structured data (JSON) for aggregation
- Performance and cost matter (expensive to log everything)
- Logs go to GCP Cloud Logging + Sentry + Slack

**Staging:**
- Bridge between dev and production
- Similar verbosity to production
- But with ability to enable DEBUG temporarily
- Good place to test the logging system before production

---

### Configuration-Driven Logging on GCP

Don't hardcode logging behavior. Use environment variables:

```javascript
// Bad: Hardcoded behavior
if (process.env.NODE_ENV === "production") {
  logger.level = "info";
} else {
  logger.level = "debug";
}

// Good: Configurable behavior
logger.level = process.env.LOG_LEVEL || "info";
logger.transports = (process.env.TRANSPORTS || "console").split(",");
```

This allows:
- Changing log level without code changes
- Enabling DEBUG in production for incident investigation
- Testing different log levels in staging
- Easy migration from local development to GCP

---

### Environment-Specific Behaviors on GCP

#### Development Configuration
```
NODE_ENV=development
LOG_LEVEL=debug
LOG_FORMAT=pretty
LOG_DESTINATIONS=console
LOG_INCLUDE_SOURCE_LOCATION=true
GCP_PROJECT_ID=
SENTRY_ENABLED=false
SLACK_ENABLED=false
```

**Reasoning:**
- DEBUG level: See everything
- Pretty format: Readable for humans
- Console only: Immediately visible in terminal
- Source location: Know exactly where logs come from
- GCP/Sentry/Slack disabled: Don't create noise

---

#### Staging Configuration
```
NODE_ENV=staging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_DESTINATIONS=console,gcp-logging
GCP_PROJECT_ID=my-project-staging
SENTRY_ENABLED=true
SLACK_ENABLED=true (but to #staging-alerts)
```

**Reasoning:**
- INFO level: See normal operations
- JSON format: Test how production logs will look
- GCP destination: Test Cloud Logging before production
- Alerts enabled: Verify notification system works
- Sentry enabled: Test error tracking

---

#### Production Configuration on GCP
```
NODE_ENV=production
LOG_LEVEL=info
LOG_FORMAT=json
LOG_DESTINATIONS=gcp-logging,sentry,slack
GCP_PROJECT_ID=my-project-prod
SENTRY_ENABLED=true (optional, for advanced features)
SLACK_ENABLED=true (to #production-alerts)
LOG_SAMPLE_RATE=0.1
```

**Reasoning:**
- INFO level: Normal operations only
- JSON format: For machine parsing
- GCP Cloud Logging: Free centralized storage
- Sentry optional: Only if you need advanced features
- Slack enabled: Notify team of production issues
- Sampling: Reduce costs for high-volume services

---

### Temporary Debug Mode in Production on GCP

Sometimes you need to investigate a production issue, so you need DEBUG logs. But you can't leave them on forever.

**Approach 1: Automatic Expiration**
```javascript
// In config
let debugUntil = process.env.DEBUG_UNTIL || null;

// In middleware
if (debugUntil && new Date() < new Date(debugUntil)) {
  logger.level = "debug";
} else {
  logger.level = "info";
}

// Set from environment variable:
// DEBUG_UNTIL=2024-01-15T14:30:00Z
// (15 minutes of debug logging)

// To enable: Update environment variable in GCP Compute Engine metadata
// or Secret Manager, then restart instances
```

**Approach 2: Per-Service Debug**
```javascript
// Only enable DEBUG for the problematic service
if (process.env.SERVICE_NAME === process.env.DEBUG_SERVICE && 
    new Date() < new Date(process.env.DEBUG_UNTIL)) {
  logger.level = "debug";
}
```

**Approach 3: Sample and Limit**
```javascript
// Enable DEBUG, but only for 1% of requests
if (Math.random() < 0.01) {
  requestLogger.level = "debug";
} else {
  requestLogger.level = "info";
}
```

---

### Performance Considerations: Dev vs Prod on GCP

**Development Logging Overhead**
- You're only running one instance locally
- You're actively debugging (want maximum visibility)
- Performance overhead doesn't matter (not handling real traffic)

```javascript
logger.debug("User object state:", { 
  userId, email, roles, preferences, subscription 
});
// This creates logging overhead, but that's fine in dev
```

---

**Production Logging Overhead on GCP**
- You're running multiple Compute Engine instances
- Handling thousands of requests per second
- Every millisecond of logging overhead multiplies across all instances
- Sending logs to GCP Cloud Logging has network cost

```javascript
// Only log when necessary
if (logger.level === "debug") {
  logger.debug("User object state:", {...});
}

// Or better: conditional logging
logger.debug?.("User object state:", {...});
```

---

### Cost & Storage Considerations on GCP

**Development:**
- Logs written to local disk
- Might accumulate 1-2 GB per day
- Manually clean up or add to `.gitignore`
- Not a concern (local machine)

**Staging:**
- Logs sent to GCP Cloud Logging
- Retention: 30 days (lower than production)
- Cost: Very low (less traffic than production, 30-day retention)
- Storage: ~10-30 GB in Cloud Logging

**Production:**
- Logs sent to GCP Cloud Logging
- Retention: 90 days (balance cost vs. compliance)
- Cost: FREE up to 50GB/month, then $0.50/GB
- With sampling: Usually fits in free tier
- Storage: ~50-100 GB in Cloud Logging (with sampling)

---

### Testing Logging Configuration

Write tests to verify logging behaves correctly in each environment:

```javascript
describe("Logging Configuration", () => {
  test("development: DEBUG level enabled", () => {
    process.env.NODE_ENV = "development";
    const logger = require("./logger");
    
    expect(logger.level).toBe("debug");
  });

  test("production: INFO level only", () => {
    process.env.NODE_ENV = "production";
    const logger = require("./logger");
    
    expect(logger.level).toBe("info");
  });

  test("production: GCP Cloud Logging configured", () => {
    process.env.NODE_ENV = "production";
    const logger = require("./logger");
    
    expect(logger.transports).toContain("gcp-logging");
  });

  test("development: GCP Cloud Logging disabled", () => {
    process.env.NODE_ENV = "development";
    const logger = require("./logger");
    
    expect(logger.transports).not.toContain("gcp-logging");
  });
});
```

---

<a name="section-12"></a>
## Section 12: Protecting Sensitive Information

### What Counts as Sensitive

**Never log:**
- Passwords (any password, anywhere, any context)
- API keys / tokens / secrets (authentication credentials)
- Payment card data (PCI compliance violation)
- Personal identifying information (PII):
  - Social security numbers
  - Driver's license numbers
  - Passport numbers
  - Date of birth (sometimes, depends on context)
- Private email addresses (especially personal email)
- IP addresses (sometimes, depends on context and privacy laws)
- Health information
- Bank account numbers

**Sometimes safe to log:**
- User ID (internal identifier, not PII)
- Username (they chose it publicly)
- Email (depends on context - production account email is usually safe)
- IP address (for security debugging, but consider privacy laws like GDPR)
- User agent / browser info

---

### Automatic Redaction

The safest approach is automatic redaction—don't rely on developers to remember:

```javascript
// List of field names to redact
const SENSITIVE_FIELDS = new Set([
  "password",
  "secret",
  "token",
  "apiKey",
  "api_key",
  "authHeader",
  "authorization",
  "creditCard",
  "ssn",
  "social_security_number",
  "bankAccount",
  "stripe_token"
]);

// Recursively redact an object
function redactObject(obj) {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactObject);
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      result[key] = "**REDACTED**";
    } else {
      result[key] = redactObject(value);
    }
  }
  
  return result;
}

// Usage in logger transport
logger.on("log", (entry) => {
  // Redact before sending anywhere
  entry.data = redactObject(entry.data);
});
```

---

### Pattern-Based Redaction

Some sensitive data doesn't have field names. Use patterns:

```javascript
function redactPatterns(text) {
  if (typeof text !== "string") return text;

  return text
    // Credit card numbers (16 digits)
    .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "**CARD**")
    
    // API keys (common pattern: key_XXXXX)
    .replace(/key_[a-zA-Z0-9]{32,}/g, "**KEY**")
    
    // Bearer tokens
    .replace(/Bearer\s+[a-zA-Z0-9._\-]+/g, "Bearer **TOKEN**")
    
    // Email addresses (in debug logs, might not want to log)
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "**EMAIL**")
    
    // Phone numbers
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "**PHONE**")
    
    // Social security numbers
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "**SSN**");
}
```

---

### Third-Party Service Security: Protecting Data Sent to GCP

When sending logs to GCP Cloud Logging, Sentry, or Slack, redaction must happen BEFORE sending:

```javascript
// BAD: Send raw error to Sentry, then redact locally
logger.error("Payment failed", { 
  error: err,
  creditCard: "4532-1234-5678-9012" // Sent to Sentry unredacted
});

// GOOD: Redact before sending
const redactedData = redactObject({
  error: err,
  creditCard: "4532-1234-5678-9012"
});
logger.error("Payment failed", redactedData); // Sent as **REDACTED**
```

**On GCP**: Use Secret Manager to store sensitive information, not environment variables:

```javascript
// BAD: Password in environment variable
process.env.DB_PASSWORD // Visible in GCP Compute Engine metadata

// GOOD: Use Secret Manager
const secretManager = new SecretManagerServiceClient();
const [version] = await secretManager.accessSecret({
  name: 'projects/123/secrets/db-password/versions/latest'
});
const password = version.payload.data.toString('utf8');
```

---

### Environment-Specific Sensitivity on GCP

Different environments have different sensitivity requirements:

**Development:**
- Logging actual test user emails is fine
- Sensitive fields can be logged (you're debugging after all)
- Set: `LOG_INCLUDE_SENSITIVE=true` for dev only

**Production:**
- Always redact
- Never log credit card data, passwords, tokens
- Default to redacting, never relax this for convenience

```javascript
const LOG_INCLUDE_SENSITIVE = process.env.LOG_INCLUDE_SENSITIVE === "true";

if (!LOG_INCLUDE_SENSITIVE && isSensitiveField(key)) {
  value = "**REDACTED**";
}
```

---

### Compliance & Security on GCP

For regulated industries, you need to prove logging is secure:

1. **Audit Trail**: Log what was logged and when
2. **Access Control**: Only authorized personnel can view logs (GCP IAM)
3. **Retention**: Keep logs for required period (usually 1 year)
4. **Encryption**: Logs in transit (HTTPS) and at rest (GCP encryption)
5. **Redaction Verification**: Audit that sensitive data is redacted

**On GCP:**
- ✅ Encryption in transit: Automatic (HTTPS)
- ✅ Encryption at rest: Automatic (Google-managed keys)
- ✅ Access control: GCP IAM roles
- ✅ Audit logging: Cloud Audit Logs tracks who accessed what
- ✅ Retention: Cloud Logging retention policies

---

### Testing Redaction

Always test that redaction works:

```javascript
test("redacts passwords", () => {
  const redacted = redactObject({
    username: "john",
    password: "secret123"
  });

  expect(redacted.password).toBe("**REDACTED**");
  expect(redacted.username).toBe("john");
});

test("redacts credit card numbers", () => {
  const redacted = redactPatterns("Paid with 4532-1234-5678-9012");
  expect(redacted).toBe("Paid with **CARD**");
});

test("logs sent to GCP are redacted", async () => {
  const gcpRequest = jest.spyOn(logging, 'log');
  
  logger.error("Payment failed", {
    creditCard: "4532-1234-5678-9012"
  });

  expect(gcpRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      creditCard: "**REDACTED**"
    })
  );
});
```

---

<a name="section-13"></a>
## Section 13: Enterprise Logging, Monitoring, and Incident Response on GCP

### Large-Scale Production Monitoring on GCP

When you're running a system at enterprise scale (millions of requests per day) on GCP, monitoring becomes a discipline.

#### Typical Enterprise Setup on GCP

**Data Flow:**
```
100+ Compute Engine instances
         ↓
     Logs generated (stdout/stderr)
         ↓
GCP Cloud Logging (automatic capture)
         ↓
 ┌───────┴────────┬────────────┬────────────┐
 ↓                ↓            ↓            ↓
Cloud Logging   Error       Cloud        Sentry
(storage)    Reporting   Monitoring    (optional)
  ↓              ↓           ↓
Cloud         Error      Dashboards
Logging       Reporting   & Alerts
Console       Dashboard

Alerting Rules trigger notifications:
  → Slack
  → PagerDuty
  → Email
  → SMS (via PagerDuty)
```

---

### Alert Design at Scale on GCP

With millions of log entries per day, alert design is critical. Set up alert policies in Cloud Monitoring:

#### Alert Rule 1: Error Rate Threshold
```
Condition:
  Metric: logging.googleapis.com/user_log_entries
  Filter: severity="ERROR"
  Trigger: (count > 100 entries/min) for 5 minutes
  
Action:
  Notify: #production-alerts on Slack
  Escalate: PagerDuty to on-call engineer
  
Suppression: During planned maintenance windows
```

---

#### Alert Rule 2: Error Spike Detection
```
Condition:
  Metric: Error count
  Trigger: Increased >50% from 24-hour average
  Duration: >2 minutes
  
Action:
  Notify: #production-alerts on Slack
  
Suppression: New deployment in last 5 minutes
(Give time to stabilize after deploy)
```

---

#### Alert Rule 3: Critical Service Down
```
Condition:
  Health check: GET /health returns non-200
  Duration: >30 seconds
  
Action:
  Immediate PagerDuty escalation (high priority)
  Slack to #incidents
  Create incident in incident management system
```

---

#### Alert Rule 4: Specific Error Threshold
```
Condition:
  Metric: logging.googleapis.com/user_log_entries
  Filter: severity="ERROR" AND message CONTAINS "Database connection failed"
  Trigger: Count > 10 in 1 minute
  
Action:
  Page database engineer on-call
  Alert database team in #database-incidents Slack channel
```

---

### On-Call Engineer Responsibilities on GCP

In an enterprise system, being "on-call" means:

**Responsibilities:**
1. Respond to alerts within 5 minutes
2. Investigate incident using GCP tools
3. Determine severity
4. Decide: handle immediately, or escalate
5. If handling: fix and document
6. If escalating: notify manager
7. Post-incident: write root cause analysis

**Tools they use:**
- GCP Cloud Logging (find logs)
- GCP Error Reporting (track errors)
- GCP Cloud Monitoring (view metrics, dashboards)
- GCP Cloud Trace (distributed tracing)
- Cloud Console (manage resources)
- Runbooks (documented solutions)
- Incident management tool (track progress)

---

### Incident Response Workflow on GCP

A typical incident unfolds like this:

```
T+0s: Error occurs in production
      Compute Engine instances log to Cloud Logging
      Error Reporting detects error pattern

T+2s: Error appears in Cloud Logging search
      Error Reporting dashboard updated
      
T+5s: Alert rule triggers
      Slack message posted to #production-alerts
      On-call engineer's phone buzzes

T+30s: Engineer reads alert
       Clicks link to Cloud Logging
       Or Error Reporting dashboard
       
T+45s: Engineer opens Cloud Logging Console
       Searches: severity="ERROR" AND timestamp>now-30m
       Sees: TypeError at payment.js line 85, occurred 50+ times in 2 minutes
       Suspects: Recent deployment broke something

T+60s: Engineer opens git log
       Sees: Deploy 2 hours ago, released version 2.3.1
       Changes: New "fast checkout path"

T+90s: Engineer examines code
       Finds: Missing null check in fast checkout path
       Impact: All premium users unable to checkout

T+2m: Engineer decides: Rollback vs Fix
      Given: Bug is specific and easy to fix
      Decision: Deploy fix (faster than rollback)

T+3m: Engineer writes fix
      Adds guard clause: check if order exists before accessing

T+4m: Engineer runs tests
      New test: "should handle undefined order"
      All tests pass

T+5m: Engineer commits to main
      Cloud Build triggers automatically (from cloudbuild.yaml)

T+7m: Cloud Build builds new container image
      Tests run in Cloud Build pipeline
      
T+8m: Image pushed to Container Registry
      Compute Engine instances updated via Cloud Deployment Manager or GKE

T+10m: All instances running version 2.3.2

T+11m: Error rate drops to zero
       Cloud Logging no longer shows errors at checkout.js:85
       Error Reporting marks issue as "Resolved in 2.3.2"

T+15m: Engineer writes incident summary in incident management system
       "Payment processing error in 2.3.1
        Root cause: Missing null check
        Impact: ~100 users for ~2h 41m, ~$500 revenue loss
        MTTR: 15 minutes
        Prevention: Code review checklist updated"

T+30m: Incident declared resolved
       Slack notification: "✅ Issue resolved - fix deployed in 2.3.2"
       Team receives notification: "Issue resolved"
```

**Key Metrics:**
- MTTD (Mean Time To Detection): 2 seconds (Cloud Logging/Error Reporting)
- MTTR (Mean Time To Resolution): 15 minutes
- User Impact: ~100 users for ~15 minutes
- Revenue Impact: ~$500

---

### Best Practices for GCP Monitoring

#### 1. Create Dashboards for Each Service
```
Each microservice has its own dashboard in Cloud Monitoring:
- Error rate (from Error Reporting)
- Request rate (from Cloud Logging logs-based metric)
- Response time (from Cloud Trace)
- Database connection pool usage (from Cloud Monitoring metrics)
- Memory usage (from Compute Engine agent)
```

#### 2. Set Up Logs-Based Metrics
Convert logs to metrics automatically:
```
Log Entry: severity="ERROR"
↓
Metric: errors_total (counter)
↓
Trigger alerts when errors_total > threshold
↓
Plot on dashboards
```

#### 3. Use Log-Based Alerts
Alert directly from logs without manual metric creation:
```
Alert Rule:
  When: logging.googleapis.com/user_log_entries
  Contains: "Database connection failed"
  For: 2 minutes
  Do: Alert Slack + PagerDuty
```

---

<a name="section-14"></a>
## Section 14: Production-Ready Architecture on GCP

### Complete System Overview on GCP

Here's a complete production-ready architecture on Google Cloud Platform:

```
                          PRODUCTION ON GCP
                         ===================

┌─────────────────────────────────────────────────────────────────┐
│                    USER TRAFFIC (Internet)                       │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ↓
        ┌────────────────────────────────────┐
        │  Cloud Load Balancer               │
        │  - Routes traffic to instances      │
        │  - Terminates HTTPS connections     │
        │  - Provides DDoS protection         │
        └────────────────────┬───────────────┘
                             │
                ┌────────────┴────────────┐
                ↓                         ↓
        ┌────────────────────┐  ┌────────────────────┐
        │ Compute Engine 1   │  │ Compute Engine 2   │ ... (100+)
        │ Node.js App        │  │ Node.js App        │
        │ - Express/NestJS   │  │ - Express/NestJS   │
        │ - Winston Logger   │  │ - Winston Logger   │
        │ - Monitoring Agent │  │ - Monitoring Agent │
        └────────┬───────────┴──┴────────┬───────────┘
                 │                       │
                 └───────────┬───────────┘
                             │
                ┌────────────┴────────────────┐
                │ Cloud Logging (Automatic)  │
                │ - Captures stdout/stderr   │
                │ - Stores all logs          │
                │ - Indexes for search       │
                │ - Free (50GB/month)        │
                └────────────┬───────────────┘
                             │
        ┌────────────────────┴────────────────┐
        │                                     │
        ↓                                     ↓
    ┌─────────────────┐      ┌────────────────────┐
    │ Error Reporting │      │ Cloud Monitoring   │
    │ (Auto created)  │      │ (Auto created)     │
    │ - Deduplicates  │      │ - Tracks metrics   │
    │ - Tracks trends │      │ - Creates charts   │
    │ - Alerts        │      │ - Generates alerts │
    └────────┬────────┘      └────────┬───────────┘
             │                        │
             └────────────┬───────────┘
                          │
                ┌─────────┴──────────┐
                │                    │
                ↓                    ↓
    ┌──────────────────┐  ┌────────────────────┐
    │ Sentry (Optional)│  │ Slack Webhooks     │
    │ - Session replay │  │ - #production-    │
    │ - Perf monitor   │  │   alerts           │
    │ - Advanced fea.  │  │ - Email            │
    └──────────────────┘  │ - SMS (via         │
                          │   PagerDuty)       │
                          └────────────────────┘

    ┌──────────────────────────────────────────────┐
    │        Data Storage                          │
    │  ┌────────────────────────────────────────┐  │
    │  │ Cloud SQL (Database)                   │  │
    │  │ - PostgreSQL or MySQL                  │  │
    │  │ - Managed by Google                    │  │
    │  │ - Automated backups                    │  │
    │  │ - Read replicas for scaling            │  │
    │  └────────────────────────────────────────┘  │
    │                                               │
    │  ┌────────────────────────────────────────┐  │
    │  │ Cloud Storage (Backups)                │  │
    │  │ - Archive old logs                     │  │
    │  │ - Store database backups               │  │
    │  └────────────────────────────────────────┘  │
    └──────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────┐
    │        CI/CD Pipeline (Cloud Build)          │
    │  1. Trigger on git push                       │
    │  2. Run tests                                 │
    │  3. Build Docker image                       │
    │  4. Push to Container Registry               │
    │  5. Deploy to Compute Engine                 │
    │  6. Health checks                            │
    └──────────────────────────────────────────────┘


        INCIDENT RESPONSE WORKFLOW ON GCP
        ================================

        Alert triggered
             │
             ↓
        Engineer notified (Slack/PagerDuty)
             │
             ↓
        Engineer opens Cloud Logging or Error Reporting
             │
             ├─ Search logs by:
             │   - Error rate
             │   - Service name
             │   - Request ID
             │   - User ID
             │
             ├─ View Error Reporting:
             │   - Error deduplication
             │   - Error trends
             │   - Stack traces
             │
             └─ Use Cloud Trace:
                 - Distributed request tracing
                 - Performance bottleneck analysis
             │
             ↓
        Identify root cause
             │
             ├─ Check code in git
             ├─ Review recent deployments
             └─ Check related errors
             │
             ↓
        Deploy fix
             │
             ├─ Commit to main
             ├─ Cloud Build runs tests
             ├─ Image pushed to Container Registry
             └─ Compute Engine instances updated
             │
             ↓
        Monitor recovery
             │
             ├─ Cloud Logging: No more errors?
             ├─ Error Reporting: Counts dropped?
             └─ Cloud Monitoring: Metrics normal?
             │
             ↓
        Declare resolved & communicate
             │
             └─ Post "all clear" to Slack
                  Post to status page
                  Notify affected users
                  Schedule post-incident review
```

---

### Technology Stack on GCP

**For Application:**
- Node.js (Express.js or NestJS)
- Google Cloud Compute Engine (VMs)
- Google Cloud SQL (Database)

**For Logging:**
- Winston or Pino (logger library)
- GCP Cloud Logging (centralized storage) - FREE
- GCP Error Reporting (error tracking) - FREE
- Sentry (optional, for advanced features) - $300+/month

**For Monitoring:**
- GCP Cloud Monitoring (metrics, dashboards, alerts) - FREE
- GCP Cloud Trace (distributed tracing) - FREE

**For CI/CD:**
- Cloud Build (build and deploy)
- Container Registry (store Docker images)
- Cloud Deployment Manager (infrastructure)

**For Alerting:**
- Cloud Monitoring Alert Policies
- Slack webhooks (notifications)
- PagerDuty (on-call management)

---

### Cost Analysis on GCP

**Typical costs for mid-size SaaS (10 million requests/day) on GCP:**

| Component | Cost | Notes |
|-----------|------|-------|
| Compute Engine (2 instances, 4 vCPU) | $200/month | Equivalent to 4 servers |
| Cloud SQL (db-custom-2-8GB) | $250/month | Managed database |
| Cloud Logging | FREE | 50GB/month free tier |
| Error Reporting | FREE | Unlimited |
| Cloud Monitoring | FREE | Unlimited dashboards/metrics |
| Cloud Trace | FREE | Unlimited |
| Cloud Build | $0.003 per build minute | ~$50/month for CI/CD |
| Cloud Storage (backups) | $20/month | Archive old logs |
| Sentry (optional) | $0 | If you use GCP Error Reporting instead |
| **Total** | **~$520/month** | No external services needed |

**Comparison to Oracle Cloud + External Services:**
- Oracle Cloud VM: $15/month
- Oracle Cloud Database: $20/month
- External Elasticsearch: $100/month
- External Sentry: $300/month
- PagerDuty: $300/month
- **Total: $735/month** (33% more expensive)

**With Sentry added (for advanced features):**
- GCP total: $520 + $300 (Sentry) = **$820/month**
- Still competitive with Oracle + all services

---

### Final Checklist for Production Readiness on GCP

Before deploying to production, ensure:

**GCP Infrastructure:**
- ✅ Compute Engine instances configured
- ✅ Cloud SQL database created with backups
- ✅ Cloud Load Balancer configured
- ✅ Cloud Logging enabled (automatic)
- ✅ Cloud Monitoring dashboards created
- ✅ Cloud Build pipeline configured

**Logging:**
- ✅ Logger initialized and configured
- ✅ All log levels implemented
- ✅ Sensitive data redaction working
- ✅ Context propagation (request IDs) working
- ✅ Structured logging (JSON) configured
- ✅ Logs flowing to GCP Cloud Logging

**Error Handling:**
- ✅ Global error handler in place
- ✅ Custom error classes implemented
- ✅ All async functions wrapped (try/catch)
- ✅ Error context captured (user, request, etc.)

**Monitoring:**
- ✅ GCP Error Reporting working
- ✅ Error rate tracking configured
- ✅ Performance monitoring working
- ✅ Health check endpoints setup
- ✅ Cloud Monitoring dashboards created

**Alerting:**
- ✅ Slack integration tested
- ✅ Alert rules configured in Cloud Monitoring
- ✅ On-call rotation set up
- ✅ Escalation procedures documented
- ✅ Test alerts successfully reach Slack/PagerDuty

**Documentation:**
- ✅ Runbooks for common GCP issues
- ✅ Incident response procedures
- ✅ Logging guidelines for team
- ✅ GCP setup documentation

**Testing:**
- ✅ Logger tested for different environments
- ✅ Error scenarios tested (throw errors, check logs)
- ✅ Redaction tested (verify secrets not in logs)
- ✅ Cloud Logging integration tested
- ✅ Error Reporting integration tested
- ✅ Slack integration tested
- ✅ Cloud Monitoring alerts tested

**Disaster Recovery:**
- ✅ Know how to disable Cloud Monitoring alerts
- ✅ Know how to query Cloud Logging
- ✅ Know GCP escalation procedures
- ✅ Have temporary DEBUG logging mechanism

---

## Conclusion

Production monitoring and debugging on Google Cloud Platform is superior to self-managed solutions because:

1. **Built-in Services**: Cloud Logging, Error Reporting, Cloud Monitoring come free with GCP
2. **Lower Cost**: $520/month vs $735/month with external services
3. **Zero Operational Overhead**: Google manages everything
4. **Automatic Integration**: Logs automatically flow to the right places
5. **Same Code**: Your Winston logger, Sentry integration, and Slack webhooks work unchanged

The architecture described in this guide represents industry best practices used by companies running on Google Cloud Platform. Implement these patterns, and your team will have visibility, confidence, and speed in production.

**GCP is specifically designed for applications like yours**, with built-in observability that rivals any external tool, all while costing less and requiring less maintenance.

---

## Quick Reference: GCP-Specific Resources

**Cloud Logging Console:**
```
https://console.cloud.google.com/logs/query
```

**Error Reporting Dashboard:**
```
https://console.cloud.google.com/errors
```

**Cloud Monitoring Dashboards:**
```
https://console.cloud.google.com/monitoring/dashboards
```

**Cloud Build:**
```
https://console.cloud.google.com/cloud-build/builds
```

---

## Quick Reference: Common GCP Queries

**Find all errors in the past hour:**
```
severity="ERROR" AND timestamp>="2024-01-15T13:00:00Z"
```

**Find all logs for a specific user:**
```
jsonPayload.userId="123" AND timestamp>="2024-01-15T00:00:00Z"
```

**Find errors from a specific service:**
```
resource.labels.service_name="payment-processor" AND severity="ERROR"
```

**Find patterns (e.g., increasing response time):**
```
httpRequest.latency>5000
```

---

## Quick Reference: Common Patterns

**Logging a request on GCP:**
```
logger.info("Request received", { method, path, userId, requestId })
// Automatically goes to Cloud Logging
```

**Logging an error on GCP:**
```
logger.error("Operation failed", { error: err, context: {...} })
// Automatically appears in Error Reporting
```

**Centralizing errors:**
```
app.use((err, req, res, next) => {
  req.logger.error("Unhandled error", { error: err });
  // Automatically captured by Cloud Logging + Error Reporting
  res.status(500).json({ error: "Internal error" });
});
```

**Sending to Sentry (optional):**
```
Sentry.captureException(err, { user: { id: userId } });
```

**Sending to Slack:**
```
webhook.post({ text: "🚨 Production error: " + err.message });
```