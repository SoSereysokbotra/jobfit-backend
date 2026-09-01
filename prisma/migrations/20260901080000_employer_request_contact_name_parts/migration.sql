-- Ask for the contact's first and last name instead of guessing them.
--
-- EmployerProfile has always stored firstName/lastName as two columns, while intake
-- collected one free-text field, so approval split it on the first space. That is right for
-- "Jane Doe" and wrong for "Mary Jane Watson", whose surname became "Jane Watson".
--
-- NULLABLE ON PURPOSE, and not backfilled. Existing rows carry only the free-text name; the
-- approval path still splits those. Writing the split into these columns would freeze a
-- guess into the record as though someone had confirmed it.
ALTER TABLE "employer_requests" ADD COLUMN "contactFirstName" TEXT;
ALTER TABLE "employer_requests" ADD COLUMN "contactLastName" TEXT;
