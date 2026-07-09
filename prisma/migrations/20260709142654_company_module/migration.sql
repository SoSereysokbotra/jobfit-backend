-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "city" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "foundedYear" INTEGER,
ADD COLUMN     "glassdoorId" TEXT,
ADD COLUMN     "glassdoorRating" DOUBLE PRECISION,
ADD COLUMN     "glassdoorReviews" INTEGER,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "size" TEXT,
ADD COLUMN     "state" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies"("name");

-- CreateIndex
CREATE INDEX "companies_industry_idx" ON "companies"("industry");

