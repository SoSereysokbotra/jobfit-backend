-- Employment dates are no longer collected on the profile's Experience tab, so a row
-- added through the UI has no start date.
--
-- DROP NOT NULL only. Existing rows keep every date already recorded; nothing is cleared
-- and nothing is defaulted. A null here means "not recorded" — substituting a value would
-- turn missing data into a duration on a generated CV.
ALTER TABLE "experiences" ALTER COLUMN "startDate" DROP NOT NULL;
