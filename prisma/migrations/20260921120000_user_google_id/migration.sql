-- Google sign-in: the stable subject id from Google's ID token, unique per account.
-- Nullable: every existing account is a password account and has none.
ALTER TABLE "users" ADD COLUMN "googleId" TEXT;
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
