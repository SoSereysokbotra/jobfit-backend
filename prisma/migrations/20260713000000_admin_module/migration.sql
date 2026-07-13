-- Admin module (Admin MVP): additive-only migration.
-- Adds 5 enums, 3 tables (system_events, email_events, audit_logs) and a users(role) index.
-- No columns are dropped and no existing enums are altered.

-- CreateEnum
CREATE TYPE "SystemEventType" AS ENUM ('HEALTH_CHECK', 'API_LATENCY_HIGH', 'ERROR_RATE_HIGH', 'QUEUE_BACKED_UP', 'EMAIL_DELIVERY_LOW', 'DATABASE_ERROR');

-- CreateEnum
CREATE TYPE "SystemEventSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EmailEventType" AS ENUM ('SENT', 'DELIVERED', 'BOUNCED_SOFT', 'BOUNCED_HARD', 'COMPLAINED', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "AuditActionType" AS ENUM ('USER_RESET_PASSWORD', 'USER_ACCOUNT_DELETED', 'USER_UNLOCKED', 'EMAIL_SUPPRESSED');

-- CreateEnum
CREATE TYPE "AuditResourceType" AS ENUM ('USER', 'EMAIL', 'SYSTEM');

-- CreateTable
CREATE TABLE "system_events" (
    "id" TEXT NOT NULL,
    "eventType" "SystemEventType" NOT NULL,
    "severity" "SystemEventSeverity" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "details" JSONB,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_events" (
    "id" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "notificationId" TEXT,
    "eventType" "EmailEventType" NOT NULL,
    "reason" TEXT,
    "externalEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "actionType" "AuditActionType" NOT NULL,
    "resourceType" "AuditResourceType" NOT NULL,
    "resourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_events_severity_idx" ON "system_events"("severity");

-- CreateIndex
CREATE INDEX "system_events_createdAt_idx" ON "system_events"("createdAt");

-- CreateIndex
CREATE INDEX "system_events_acknowledgedAt_idx" ON "system_events"("acknowledgedAt");

-- CreateIndex
CREATE INDEX "email_events_recipientEmail_idx" ON "email_events"("recipientEmail");

-- CreateIndex
CREATE INDEX "email_events_createdAt_idx" ON "email_events"("createdAt");

-- CreateIndex
CREATE INDEX "email_events_eventType_idx" ON "email_events"("eventType");

-- CreateIndex
CREATE INDEX "audit_logs_adminId_idx" ON "audit_logs"("adminId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- AddForeignKey
ALTER TABLE "system_events" ADD CONSTRAINT "system_events_acknowledgedByAdminId_fkey" FOREIGN KEY ("acknowledgedByAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
