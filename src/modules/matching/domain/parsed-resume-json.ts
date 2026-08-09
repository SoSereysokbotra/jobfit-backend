// Shared parsers for ParsedResumeData JSON columns (skills/experiences), used by
// both the embedding builder and the hybrid-retrieval query text.

/**
 * Split a résumé "skills" entry that is really several skills.
 *
 * MEASURED NEED. Résumés group skills on one line behind a label — "Languages: C++,
 * Python, TypeScript" — and the model returns the whole line as ONE skill. Nothing
 * matches that string: no employer writes it, and the matcher's whole-word test cannot
 * see the "Python" inside it. So three real skills evidence nothing.
 *
 * WHY THIS IS IN CODE AND NOT IN THE PROMPT. It was tried in the prompt first. On a
 * synthetic CV with a labelled skills section, n=8 runs each against qwen3:0.6b:
 *
 *   resume_parse_v4  14 of 43 entries unusable, 6 of 8 runs affected
 *   resume_parse_v5  12 of 45 entries unusable, 4 of 8 runs affected
 *
 * v5 adds an explicit "ONE SKILL PER ENTRY, split every line" rule with worked
 * examples, and STILL glues them together half the time. 6/8 vs 4/8 at n=8 is inside
 * the noise. A 0.6b model cannot be relied on for this, and splitting on a comma is a
 * string operation with a guaranteed outcome — asking a model to do it is the wrong
 * layer. The prompt rule stays, because it does no harm and helps a larger model; the
 * correctness lives here.
 *
 * Applied at READ time as well as write time, so the 55 parses already in the database
 * are repaired rather than left behind a fix that only helps future uploads.
 */
export function splitSkillEntry(entry: string): string[] {
  const trimmed = entry.trim();

  // "Languages: C++, Python" -> drop the label. A label is AT MOST THREE WORDS: without
  // that bound "Led a team of six: delivered the migration" parses as a labelled list and
  // the first half of a real sentence is thrown away.
  const labelled = /^([A-Za-z][A-Za-z\-&/]*(?:\s+[A-Za-z\-&/]+){0,2}):\s*(.+)$/.exec(
    trimmed,
  );
  const body = labelled ? labelled[2] : trimmed;

  return (
    body
      // Commas, semicolons, pipes and bullets separate entries. SLASHES DO NOT — "CI/CD"
      // and "R&D" are single skills, and splitting them invents two things nobody claimed.
      //
      // NEITHER DOES "and". "Health and Safety", "Research and Development" and "Learning
      // and Development" are each one skill, and there is no reliable way to tell those
      // from "Docker and Kubernetes". So "Git, Docker and Kubernetes" yields
      // ["Git", "Docker and Kubernetes"] — the second matches nothing, which UNDER-credits
      // the candidate. That is the safe direction: this feature exists to surface gaps,
      // and inventing a skill nobody claimed is the failure that makes it lie.
      .split(/[,;|•·]+/)
      .map((s) => s.trim().replace(/^[-–—]\s*/, ''))
      // A leading "and" IS safe to strip: it can only be the Oxford-comma tail of a list
      // this function has already split on the comma. "Git, Docker, and Kubernetes".
      .map((s) => s.replace(/^and\s+/i, '').trim())
      .filter((s) => s.length > 0)
  );
}

/** Every skill in a résumé's skills column, one per entry. */
export function toSkillList(json: string | null): string[] {
  return toStringArray(json).flatMap(splitSkillEntry);
}

function parseJson(json: string | null): unknown {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function toStringArray(json: string | null): string[] {
  const v = parseJson(json);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Experience entries may be AI objects ({title,...}) or heuristic raw strings. */
export function toExperienceTitles(json: string | null): string[] {
  const v = parseJson(json);
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (item && typeof item === 'object') {
        const title = (item as Record<string, unknown>).title;
        return typeof title === 'string' ? title : '';
      }
      return typeof item === 'string' ? item : '';
    })
    .filter((t) => t.length > 0);
}

/** Pull one string-array field out of every object in a JSON array column. */
function stringArrayField(json: string | null, field: string): string[] {
  const v = parseJson(json);
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const value = (item as Record<string, unknown>)[field];
    return Array.isArray(value)
      ? value.filter((x): x is string => typeof x === 'string')
      : [];
  });
}

/** Pull one string field out of every object in a JSON array column. */
function stringField(json: string | null, field: string): string[] {
  const v = parseJson(json);
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const value = (item as Record<string, unknown>)[field];
    return typeof value === 'string' && value.trim().length > 0 ? [value] : [];
  });
}

/**
 * The tools, languages, hardware and techniques named on the user's projects.
 *
 * The parse prompt is explicit that `technologies` holds only things NAMED IN THE TEXT —
 * "Arduino", "PID Control", "servo motor" — and that what was BUILT belongs in the
 * description instead. That makes this list specific by construction, which is exactly
 * what the `skills` column is not.
 */
export function toProjectTechnologies(json: string | null): string[] {
  return stringArrayField(json, 'technologies');
}

/**
 * What the user actually studied — "Automotive Engineering Technology", "Primary
 * Education". Named disciplines, not category labels.
 */
export function toFieldsOfStudy(json: string | null): string[] {
  return stringField(json, 'fieldOfStudy');
}
