-- Track the origin of a resume's structured data: "ai" (AI service) or
-- "heuristic" (regex fallback used when the AI service was unavailable).
-- Nullable so existing parsed_resume_data rows remain valid.
ALTER TABLE "parsed_resume_data" ADD COLUMN "parsedBy" TEXT;
