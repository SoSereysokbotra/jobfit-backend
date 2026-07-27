// Heuristic slice tags for a job (category / seniority / language). Used to
// pre-fill the eval worksheet and to backfill existing labels, so a human only
// has to judge great/ok/bad. These are a Phase-A scaffold — correctable by hand,
// and superseded by real queryable columns + language detection in Phase B.

export interface JobSlices {
  category: string;
  seniority: string;
  language: string; // "km" if any Khmer script is present, else "en"
}

// Khmer Unicode block.
const KHMER = /[ក-៿]/;

export function inferJobSlices(job: {
  title: string;
  description?: string | null;
}): JobSlices {
  const title = job.title.toLowerCase();
  const text = `${job.title} ${job.description ?? ''}`;
  return {
    category: inferCategory(title),
    seniority: inferSeniority(title),
    language: KHMER.test(text) ? 'km' : 'en',
  };
}

function inferSeniority(t: string): string {
  if (/\bintern(ship)?\b/.test(t)) return 'intern';
  if (/\b(principal|staff|lead|head|director|vp|chief|c[te]o)\b/.test(t)) return 'lead';
  if (/\b(senior|sr\.?|snr)\b/.test(t)) return 'senior';
  if (/\b(junior|jr\.?|entry|graduate|associate)\b/.test(t)) return 'entry';
  if (/\bmanager\b/.test(t)) return 'lead';
  return 'mid';
}

function inferCategory(t: string): string {
  const has = (...ws: string[]): boolean => ws.some((w) => t.includes(w));
  // Order matters: more specific families before the generic engineer catch-all
  // (e.g. "data engineer" / "devops engineer" both contain "engineer").
  if (has('data scientist', 'machine learning', 'ml engineer', 'data analyst', 'data engineer', 'analytics')) return 'data';
  if (has('devops', 'sre', 'site reliability', 'infrastructure', 'platform engineer', 'cloud engineer')) return 'devops';
  if (has('designer', ' ux', ' ui', 'product design')) return 'design';
  if (has('product manager', 'product owner')) return 'product';
  if (has('qa', 'quality assurance', 'test engineer', 'sdet')) return 'qa';
  if (has('marketing', 'seo', 'content writer', 'social media')) return 'marketing';
  if (has('sales', 'account executive', 'business development')) return 'sales';
  if (has('engineer', 'developer', 'programmer', 'backend', 'frontend', 'full-stack', 'fullstack', 'full stack', 'software')) return 'software-eng';
  return 'other';
}
