-- Personal/academic/technical projects, stored as a JSON string alongside the other
-- structured parse output. Kept separate from "experiences": on student CVs the projects
-- hold nearly all the technical signal (Arduino, PID control, computer vision) while the
-- SKILLS section holds only soft skills. With nowhere to put them the parser folded
-- projects into experiences, inventing jobs the candidate never held.
--
-- Also records which app/prompts/resume_parse_<v>.txt produced the row, so a stored parse
-- can be traced back to its prompt.
--
-- Both nullable so existing parsed_resume_data rows remain valid.
ALTER TABLE "parsed_resume_data" ADD COLUMN "projects" TEXT;
ALTER TABLE "parsed_resume_data" ADD COLUMN "promptVersion" TEXT;
