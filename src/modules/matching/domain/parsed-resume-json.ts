// Shared parsers for ParsedResumeData JSON columns (skills/experiences), used by
// both the embedding builder and the hybrid-retrieval query text.

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
