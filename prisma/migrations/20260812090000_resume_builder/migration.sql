-- Resume Builder — an in-app, structured résumé the user composes from templates
-- WE author and seed, distinct from the uploaded-file `Resume` (FR-RESUME-001).
--
-- Exporting a document renders a PDF, stores it in the existing `resumes` bucket and
-- creates a normal `resumes` row, so a built résumé flows into ATS scoring and the
-- "select résumé when applying" picker with no special-casing downstream.
--
-- Shape notes (full rationale in docs/RESUME_BUILDER_DATA_MODEL.md):
--
--   * `resume_templates` is INTERNAL reference data — no owner column, nothing
--     user-writable, seeded only. `layoutConfig` is authored by us and read by the
--     renderer. Retire a template with isActive = false; the FK is RESTRICT so a
--     retired row can never orphan a document that references it.
--
--   * `resume_documents` carries a SNAPSHOTTED résumé header (fullName, email, phone,
--     location, linkedinUrl, portfolioUrl). It is prefilled from the user's profile at
--     creation and then owned by the document — a résumé tailored for one application
--     has to be able to differ from the master profile, so it is never re-read.
--
--   * `exportedResumeId` is a SINGLE FK to the most recent export, not a history.
--     Re-exporting soft-deletes the previously linked résumé and repoints this, so the
--     picker only ever shows one current file per document. ON DELETE SET NULL: deleting
--     the résumé leaves the document intact and merely unlinked. There is deliberately
--     NO cascade the other way — deleting a document does not delete a résumé the user
--     may already have attached to submitted applications.
--
--   * Child sections cascade with their parent document and carry an `order` int, so
--     drag-to-reorder needs no separate ordering service. They have no deletedAt: they
--     are owned by the document, and a tombstone on them would be dead weight.
--
-- NOTE: authored by hand rather than via `prisma migrate dev`, which cannot run in this
-- repo — no migration creates the `offers` table, so the shadow database fails at
-- 20260809090000_offer_messages (P3006/P1014). The statements below were generated with
-- `prisma migrate diff` and then filtered: that command also reported pre-existing drift
-- between the live database and schema.prisma (a `match_reports` table, the
-- `jobs_searchTsv_idx` GIN index and several other indexes that exist in the database but
-- are not modelled in schema.prisma). Those DROPs were deliberately EXCLUDED — this
-- migration is purely additive. The drift is real and predates this feature; it needs its
-- own reconciliation, and until then `migrate diff` output must never be applied verbatim.

-- CreateEnum
CREATE TYPE "ResumeLineSpacing" AS ENUM ('SINGLE', 'DEFAULT', 'WIDE');

-- CreateEnum
CREATE TYPE "ResumeMargin" AS ENUM ('NARROW', 'NORMAL', 'WIDE');

-- CreateEnum
CREATE TYPE "ResumeDocumentStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateTable
CREATE TABLE "resume_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "isAtsFriendly" BOOLEAN NOT NULL DEFAULT true,
    "layoutConfig" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_documents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "colorScheme" TEXT NOT NULL DEFAULT 'default',
    "lineSpacing" "ResumeLineSpacing" NOT NULL DEFAULT 'DEFAULT',
    "margin" "ResumeMargin" NOT NULL DEFAULT 'NORMAL',
    "fontFamily" TEXT,
    "status" "ResumeDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "fullName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "linkedinUrl" TEXT,
    "portfolioUrl" TEXT,
    "exportedResumeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "resume_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_document_summaries" (
    "id" TEXT NOT NULL,
    "resumeDocumentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_document_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_document_experiences" (
    "id" TEXT NOT NULL,
    "resumeDocumentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "company" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "isCurrentJob" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "technologies" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_document_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_document_educations" (
    "id" TEXT NOT NULL,
    "resumeDocumentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "institution" TEXT NOT NULL,
    "degreeLevel" "DegreeLevel" NOT NULL,
    "fieldOfStudy" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "gpa" DOUBLE PRECISION,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_document_educations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_document_skills" (
    "id" TEXT NOT NULL,
    "resumeDocumentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "proficiencyLevel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_document_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_document_certifications" (
    "id" TEXT NOT NULL,
    "resumeDocumentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3),
    "credentialId" TEXT,
    "credentialUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_document_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resume_document_projects" (
    "id" TEXT NOT NULL,
    "resumeDocumentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "technologies" TEXT[],
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resume_document_projects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "resume_templates_name_key" ON "resume_templates"("name");

-- CreateIndex
CREATE INDEX "resume_templates_isActive_category_idx" ON "resume_templates"("isActive", "category");

-- CreateIndex
CREATE INDEX "resume_documents_userId_idx" ON "resume_documents"("userId");

-- CreateIndex
CREATE INDEX "resume_documents_templateId_idx" ON "resume_documents"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "resume_document_summaries_resumeDocumentId_key" ON "resume_document_summaries"("resumeDocumentId");

-- CreateIndex
CREATE INDEX "resume_document_experiences_resumeDocumentId_order_idx" ON "resume_document_experiences"("resumeDocumentId", "order");

-- CreateIndex
CREATE INDEX "resume_document_educations_resumeDocumentId_order_idx" ON "resume_document_educations"("resumeDocumentId", "order");

-- CreateIndex
CREATE INDEX "resume_document_skills_resumeDocumentId_order_idx" ON "resume_document_skills"("resumeDocumentId", "order");

-- CreateIndex
CREATE INDEX "resume_document_certifications_resumeDocumentId_order_idx" ON "resume_document_certifications"("resumeDocumentId", "order");

-- CreateIndex
CREATE INDEX "resume_document_projects_resumeDocumentId_order_idx" ON "resume_document_projects"("resumeDocumentId", "order");

-- AddForeignKey
ALTER TABLE "resume_documents" ADD CONSTRAINT "resume_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_documents" ADD CONSTRAINT "resume_documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "resume_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_documents" ADD CONSTRAINT "resume_documents_exportedResumeId_fkey" FOREIGN KEY ("exportedResumeId") REFERENCES "resumes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_document_summaries" ADD CONSTRAINT "resume_document_summaries_resumeDocumentId_fkey" FOREIGN KEY ("resumeDocumentId") REFERENCES "resume_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_document_experiences" ADD CONSTRAINT "resume_document_experiences_resumeDocumentId_fkey" FOREIGN KEY ("resumeDocumentId") REFERENCES "resume_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_document_educations" ADD CONSTRAINT "resume_document_educations_resumeDocumentId_fkey" FOREIGN KEY ("resumeDocumentId") REFERENCES "resume_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_document_skills" ADD CONSTRAINT "resume_document_skills_resumeDocumentId_fkey" FOREIGN KEY ("resumeDocumentId") REFERENCES "resume_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_document_certifications" ADD CONSTRAINT "resume_document_certifications_resumeDocumentId_fkey" FOREIGN KEY ("resumeDocumentId") REFERENCES "resume_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_document_projects" ADD CONSTRAINT "resume_document_projects_resumeDocumentId_fkey" FOREIGN KEY ("resumeDocumentId") REFERENCES "resume_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

