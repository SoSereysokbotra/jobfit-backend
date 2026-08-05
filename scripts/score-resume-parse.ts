/**
 * Parse the reference CV and score the result against a hand-written ground truth.
 *
 * Exists to answer one question with a number instead of an impression: after fixing
 * PDF reading order, how much of the remaining error is the MODEL rather than the input?
 * It runs one cell of the 2x2 in docs/RESUME_EXTRACTION_PLAN.md §Phase 5.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/score-resume-parse.ts \
 *     --pdf=<path.pdf> [--ai=http://localhost:8000/api/v1] [--text=scrambled] [--json]
 *
 *   --text=scrambled   use the OLD pdf-parse output (read from the most recent
 *                      parsed_resume_data.rawText) instead of the new reading-order
 *                      extractor, to isolate input quality from model capacity.
 */

import { readFileSync } from 'fs';
import * as http from 'http';
import { PrismaClient } from '@prisma/client';
import {
  PositionedTextItem,
  toReadingOrder,
} from '../src/modules/resume/application/services/pdf-reading-order';

// ── ground truth for CV_So_Sereysokbotra_Software_Engineer.pdf ────────────────
// Read off the rendered page by hand. `company: null` for the internship is CORRECT:
// the CV never names the employer, so inventing one is an error, not a success.
const TRUTH = {
  fullName: 'SO SEREYSOKBOTRA',
  email: 'soviseth869@gmail.com',
  phone: '+855 61705511',
  institutions: [
    'Kirirom Institute of Technology',
    'National Polytechnic Institute of Cambodia',
    'Hun Sen Champouvorn',
  ],
  experienceTitle: 'Electrical Engineering Intern',
  experienceCount: 1,
  // TECHNICAL PROJECTS. These carry the CV's only real technical signal, so a parse
  // that drops them is useless for matching even if every other field is right.
  projectCount: 3,
  projectTechnologies: ['Arduino'],
  skills: [
    'Effective Time Management',
    'Creative Problem-Solving',
    'Programming',
    'Communication',
    'Critical Thinking',
    'Teamwork',
    'Hardware + Software',
    'Technical Skills',
    'Telecommunication',
  ],
};

interface ParseResponse {
  fullName?: string | null;
  email?: string | null;
  phone?: string | null;
  skills?: string[];
  experiences?: { company?: string | null; title?: string | null; startDate?: string | null }[];
  educations?: { institution?: string | null; degree?: string | null }[];
  projects?: { name?: string | null; technologies?: string[] }[];
  promptVersion?: string;
}

interface PdfJsModule {
  getDocument(src: { data: Uint8Array; useSystemFonts?: boolean; isEvalSupported?: boolean }): {
    promise: Promise<PdfDocument>;
  };
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<{ getTextContent(): Promise<{ items: PositionedTextItem[] }> }>;
  destroy(): Promise<void>;
}

/**
 * POST JSON with no header timeout.
 *
 * Node's global fetch (undici) aborts after 300s waiting for response headers, which is
 * shorter than a full-qwen3 parse on this laptop — it fails the run for the wrong reason.
 */
function postJson<T>(url: string, body: unknown, headers: Record<string, string>): Promise<T> {
  const target = new URL(url);
  const payload = JSON.stringify(body);
  return new Promise<T>((resolve, reject) => {
    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname + target.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(`AI service ${res.statusCode}: ${raw.slice(0, 300)}`));
            return;
          }
          try {
            resolve(JSON.parse(raw) as T);
          } catch {
            reject(new Error(`bad JSON from ${url}: ${raw.slice(0, 200)}`));
          }
        });
      },
    );
    req.setTimeout(0); // wait as long as the model needs
    req.on('error', reject);
    req.end(payload);
  });
}

function arg(name: string, fallback = ''): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

async function readingOrderText(pdfPath: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as PdfJsModule;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(pdfPath)),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      pages.push(toReadingOrder((await (await doc.getPage(n)).getTextContent()).items));
    }
    return pages.join('\n');
  } finally {
    await doc.destroy();
  }
}

/** The pre-fix, content-stream-order text, recovered from the last parse we stored. */
async function scrambledText(): Promise<string> {
  const prisma = new PrismaClient();
  try {
    const row = await prisma.parsedResumeData.findFirst({
      where: { rawText: { contains: 'SEREYSOKBOTRA' } },
      orderBy: { createdAt: 'asc' }, // the OLDEST such row predates the extractor fix
    });
    if (!row?.rawText) throw new Error('no stored scrambled rawText found');
    return row.rawText;
  } finally {
    await prisma.$disconnect();
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+]/g, '');

function score(p: ParseResponse): { lines: string[]; got: number; total: number } {
  const lines: string[] = [];
  let got = 0;
  const total = 7;
  const mark = (ok: boolean, label: string, detail: string) => {
    if (ok) got++;
    lines.push(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(14)} ${detail}`);
  };

  mark(
    norm(p.fullName ?? '') === norm(TRUTH.fullName),
    'fullName',
    `${JSON.stringify(p.fullName)} (want ${JSON.stringify(TRUTH.fullName)})`,
  );
  mark(
    (p.email ?? '').toLowerCase() === TRUTH.email,
    'email',
    `${JSON.stringify(p.email)}`,
  );
  mark(norm(p.phone ?? '') === norm(TRUTH.phone), 'phone', `${JSON.stringify(p.phone)}`);

  const edus = p.educations ?? [];
  const foundInst = TRUTH.institutions.filter((want) =>
    edus.some((e) => norm(e.institution ?? '').includes(norm(want).slice(0, 14))),
  );
  mark(
    edus.length === 3 && foundInst.length === 3,
    'educations',
    `${edus.length}/3 entries, ${foundInst.length}/3 institutions matched`,
  );

  const exps = p.experiences ?? [];
  const titleOk = exps.some((e) => norm(e.title ?? '') === norm(TRUTH.experienceTitle));
  // The CV names no employer, so a non-null company is a hallucination.
  const companyOk = exps.every((e) => !e.company);
  mark(
    exps.length === TRUTH.experienceCount && titleOk && companyOk,
    'experience',
    `${exps.length}/1 entries, title=${JSON.stringify(exps[0]?.title)}, company=${JSON.stringify(exps[0]?.company)}`,
  );

  const skills = p.skills ?? [];
  const foundSkills = TRUTH.skills.filter((want) =>
    skills.some((s) => norm(s).includes(norm(want)) || norm(want).includes(norm(s))),
  );
  mark(
    foundSkills.length === TRUTH.skills.length,
    'skills',
    `${foundSkills.length}/9 found (${skills.length} returned)` +
      (foundSkills.length < 9
        ? ` — missing: ${TRUTH.skills.filter((s) => !foundSkills.includes(s)).join(', ')}`
        : ''),
  );

  const projects = p.projects ?? [];
  const allTech = projects.flatMap((pr) => pr.technologies ?? []);
  const techOk = TRUTH.projectTechnologies.every((t) =>
    allTech.some((a) => norm(a).includes(norm(t))),
  );
  mark(
    projects.length === TRUTH.projectCount && techOk,
    'projects',
    `${projects.length}/3 entries, ${allTech.length} technologies` +
      (allTech.length ? ` [${allTech.slice(0, 8).join(', ')}]` : ''),
  );

  return { lines, got, total };
}

async function main(): Promise<void> {
  const pdf = arg('pdf');
  const aiUrl = arg('ai', 'http://localhost:8000/api/v1');
  const mode = arg('text', 'reading-order');
  if (!pdf && mode !== 'scrambled') {
    console.error('usage: score-resume-parse.ts --pdf=<path.pdf> [--ai=URL] [--text=scrambled]');
    process.exit(1);
  }

  const text = mode === 'scrambled' ? await scrambledText() : await readingOrderText(pdf);

  const startedAt = Date.now();
  const parsed = await postJson<ParseResponse>(
    `${aiUrl}/resume/parse`,
    { text, fileType: 'PDF' },
    { 'X-AI-Service-Key': process.env.AI_SERVICE_KEY ?? 'change-me' },
  );
  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(parsed, null, 2));
  }

  const { lines, got, total } = score(parsed);
  console.log(`\n=== ${mode} text | ${aiUrl} | ${elapsedSec}s ===`);
  console.log(`  input: ${text.split('\n').length} lines, ${text.length} chars`);
  console.log(lines.join('\n'));
  console.log(`  SCORE: ${got}/${total}\n`);
}

void main().catch((err: Error) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
