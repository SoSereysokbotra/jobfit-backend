// Offline GENERATION-quality evaluation (RAG plan Phase C, §7/§8).
//
// Retrieval eval asks "did we surface the right jobs?". This asks the separate
// question "is the model's *reasoning* about a (candidate, job) pair trustworthy?"
// — measured on the SAME hand-labeled pairs (`match_labels`) so the two stages
// share one ground truth.
//
// Two headline numbers:
//   • Calibration  — Spearman ρ between the LLM's fitScore and the human grade
//                    (GREAT=2/OK=1/BAD=0). Says whether the judgement is ordered
//                    like a human's. This is the number that decides whether a
//                    fitScore may ever be shown to a user.
//   • Faithfulness — share of `evidenceFromCv` quotes that actually occur in the
//                    candidate text. Catches invented skills/experience.
//
// Degraded rows (the AI service's deterministic fallback) are counted and
// EXCLUDED from both metrics — they are not model judgement.

import { Injectable, Logger } from '@nestjs/common';
import { MatchLabelValue } from '@prisma/client';

import { AiClient } from '@infra/ai/ai.client';
import { MatchReasonResponse } from '@infra/ai/ai.types';
import { PrismaService } from '@infra/prisma/prisma.service';

import { toExperienceTitles, toStringArray } from '../domain/parsed-resume-json';
import { spearman } from './metrics';
import { EvalLabel } from './retrieval-eval.service';

const GRADE: Record<MatchLabelValue, number> = {
  [MatchLabelValue.GREAT]: 2,
  [MatchLabelValue.OK]: 1,
  [MatchLabelValue.BAD]: 0,
};
const GRADE_NAME = ['BAD', 'OK', 'GREAT'] as const;

/** Token-overlap share above which a non-verbatim quote still counts as grounded. */
const LENIENT_THRESHOLD = 0.8;
/** Job description sent to the model; long postings are truncated for latency. */
const JOB_TEXT_LIMIT = 4000;
/** Candidate text sent to the model — also the corpus faithfulness is checked against. */
const CV_TEXT_LIMIT = 4000;

export interface GenerationEvalOptions {
  /** Prompt variant on the AI service (Phase C3 A/B). Default 'v1'. */
  promptVersion?: string;
  /** Cap the number of pairs (smoke runs). Default: all labels. */
  limit?: number;
  /** Parallel /match/reason calls. Default 4. */
  concurrency?: number;
}

export interface GenerationEvalRow {
  userId: string;
  jobId: string;
  grade: number;
  fitScore: number | null;
  verdict: string | null;
  degraded: boolean;
  error: string | null;
  latencyMs: number;
  /** Evidence quotes offered vs. actually found in the CV text. */
  evidenceTotal: number;
  evidenceStrict: number;
  evidenceLenient: number;
  evidenceEmpty: number;
  /** Requirements cited vs. actually found in the job text. */
  requirementTotal: number;
  requirementStrict: number;
  /** The quotes that failed the check — the raw material for prompt iteration (C3). */
  ungroundedEvidence: string[];
}

export interface Groundedness {
  claims: number; // total quotes checked
  micro: number; // share of ALL claims that are grounded
  macro: number; // mean per-pair share (pairs with >=1 claim)
  pairs: number; // pairs contributing to macro
}

export interface GenerationEvalReport {
  generatedAt: string;
  promptVersion: string;
  pairs: number; // pairs attempted
  scored: number; // pairs contributing to the metrics
  degraded: number;
  errors: number;
  calibration: {
    spearmanPooled: number;
    spearmanPerCandidateMean: number;
    candidatesWithVariance: number;
    meanScoreByGrade: Record<string, { n: number; mean: number }>;
  };
  faithfulness: Groundedness & { emptyEvidence: number };
  requirementGroundedness: Groundedness;
  verdictByGrade: Record<string, Record<string, number>>;
  latencyMs: { mean: number; p50: number; p99: number };
  rows: GenerationEvalRow[];
}

@Injectable()
export class GenerationEvalService {
  private readonly logger = new Logger(GenerationEvalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AiClient,
  ) {}

  async evaluate(
    labels: EvalLabel[],
    opts: GenerationEvalOptions = {},
  ): Promise<GenerationEvalReport> {
    const promptVersion = opts.promptVersion ?? 'v1';
    const concurrency = Math.max(1, opts.concurrency ?? 4);
    const pairs = opts.limit ? labels.slice(0, opts.limit) : labels;

    // Load each candidate's CV text once — it is BOTH the model input and the
    // corpus faithfulness is checked against, so the two can never disagree.
    const candidateText = new Map<string, string>();
    for (const userId of new Set(pairs.map((l) => l.userId))) {
      candidateText.set(userId, await this.buildCandidateText(userId));
    }
    const jobs = await this.loadJobs([...new Set(pairs.map((l) => l.jobId))]);

    const rows: GenerationEvalRow[] = [];
    let done = 0;
    await this.forEachLimited(pairs, concurrency, async (label) => {
      const cv = candidateText.get(label.userId) ?? '';
      const job = jobs.get(label.jobId);
      const row = await this.evaluatePair(label, cv, job, promptVersion);
      rows.push(row);
      if (++done % 10 === 0) {
        this.logger.log(`match/reason ${done}/${pairs.length}`);
      }
    });

    return this.summarize(rows, promptVersion);
  }

  // ── One pair ───────────────────────────────────────────────────────────────

  private async evaluatePair(
    label: EvalLabel,
    cvText: string,
    job: { title: string; text: string } | undefined,
    promptVersion: string,
  ): Promise<GenerationEvalRow> {
    const base = {
      userId: label.userId,
      jobId: label.jobId,
      grade: GRADE[label.label],
    };
    const empty: GenerationEvalRow = {
      ...base,
      fitScore: null,
      verdict: null,
      degraded: false,
      error: null,
      latencyMs: 0,
      evidenceTotal: 0,
      evidenceStrict: 0,
      evidenceLenient: 0,
      evidenceEmpty: 0,
      requirementTotal: 0,
      requirementStrict: 0,
      ungroundedEvidence: [],
    };

    if (!job || !cvText) {
      return { ...empty, error: !job ? 'job not found' : 'no candidate text' };
    }

    const startedAt = Date.now();
    let res: MatchReasonResponse;
    try {
      res = await this.aiClient.matchReason({
        candidateSummary: cvText,
        jobTitle: job.title,
        jobDescription: job.text,
        promptVersion,
      });
    } catch (err) {
      return {
        ...empty,
        error: (err as Error).message,
        latencyMs: Date.now() - startedAt,
      };
    }

    const evidence = res.matchedRequirements.map((m) => m.evidenceFromCv ?? '');
    const requirements = res.matchedRequirements.map((m) => m.requirement ?? '');
    const cvNorm = normalize(cvText);
    const jobNorm = normalize(`${job.title} ${job.text}`);

    return {
      ...base,
      fitScore: res.fitScore,
      verdict: res.verdict,
      degraded: res.degraded,
      error: null,
      latencyMs: Date.now() - startedAt,
      evidenceTotal: evidence.length,
      evidenceStrict: evidence.filter((e) => isGrounded(e, cvNorm, false)).length,
      evidenceLenient: evidence.filter((e) => isGrounded(e, cvNorm, true)).length,
      evidenceEmpty: evidence.filter((e) => normalize(e) === '').length,
      requirementTotal: requirements.length,
      requirementStrict: requirements.filter((r) => isGrounded(r, jobNorm, true)).length,
      ungroundedEvidence: evidence.filter((e) => !isGrounded(e, cvNorm, false)),
    };
  }

  // ── Aggregation ────────────────────────────────────────────────────────────

  private summarize(
    rows: GenerationEvalRow[],
    promptVersion: string,
  ): GenerationEvalReport {
    const scored = rows.filter((r) => !r.degraded && !r.error && r.fitScore != null);

    const meanScoreByGrade: Record<string, { n: number; mean: number }> = {};
    for (const [i, name] of GRADE_NAME.entries()) {
      const bucket = scored.filter((r) => r.grade === i);
      meanScoreByGrade[name] = {
        n: bucket.length,
        mean: bucket.length
          ? bucket.reduce((s, r) => s + (r.fitScore as number), 0) / bucket.length
          : 0,
      };
    }

    // Per-candidate ρ avoids Simpson's paradox: pooling mixes candidates whose
    // score distributions differ, which can manufacture (or hide) correlation.
    const perCandidate: number[] = [];
    for (const userId of new Set(scored.map((r) => r.userId))) {
      const mine = scored.filter((r) => r.userId === userId);
      const grades = mine.map((r) => r.grade);
      if (mine.length < 2 || new Set(grades).size < 2) continue;
      perCandidate.push(
        spearman(mine.map((r) => r.fitScore as number), grades),
      );
    }

    const verdictByGrade: Record<string, Record<string, number>> = {};
    for (const name of GRADE_NAME) verdictByGrade[name] = {};
    for (const r of scored) {
      const g = GRADE_NAME[r.grade] ?? String(r.grade);
      const v = r.verdict ?? 'none';
      verdictByGrade[g][v] = (verdictByGrade[g][v] ?? 0) + 1;
    }

    const latencies = rows.filter((r) => r.latencyMs > 0).map((r) => r.latencyMs);

    return {
      generatedAt: new Date().toISOString(),
      promptVersion,
      pairs: rows.length,
      scored: scored.length,
      degraded: rows.filter((r) => r.degraded).length,
      errors: rows.filter((r) => r.error).length,
      calibration: {
        spearmanPooled: spearman(
          scored.map((r) => r.fitScore as number),
          scored.map((r) => r.grade),
        ),
        spearmanPerCandidateMean: mean(perCandidate),
        candidatesWithVariance: perCandidate.length,
        meanScoreByGrade,
      },
      faithfulness: {
        ...groundedness(scored, (r) => r.evidenceTotal, (r) => r.evidenceStrict),
        emptyEvidence: scored.reduce((s, r) => s + r.evidenceEmpty, 0),
      },
      requirementGroundedness: groundedness(
        scored,
        (r) => r.requirementTotal,
        (r) => r.requirementStrict,
      ),
      verdictByGrade,
      latencyMs: {
        mean: mean(latencies),
        p50: percentile(latencies, 0.5),
        p99: percentile(latencies, 0.99),
      },
      rows,
    };
  }

  // ── Inputs ─────────────────────────────────────────────────────────────────

  /**
   * The candidate text handed to the model. Deliberately the résumé + profile
   * prose (not the BM25 keyword blob): faithfulness only means something if the
   * model was given real sentences it could quote.
   */
  private async buildCandidateText(userId: string): Promise<string> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { headline: true, bio: true, city: true, country: true },
    });
    const resume = await this.prisma.resume.findFirst({
      where: { userId, parsingStatus: 'SUCCESS' },
      orderBy: { updatedAt: 'desc' },
      select: { parsedData: { select: { summary: true, skills: true, experiences: true } } },
    });

    const parts: string[] = [];
    if (profile?.headline) parts.push(profile.headline);
    const location = [profile?.city, profile?.country].filter(Boolean).join(', ');
    if (location) parts.push(`Location: ${location}.`);
    if (profile?.bio) parts.push(profile.bio);
    if (resume?.parsedData?.summary) parts.push(resume.parsedData.summary);

    const skills = toStringArray(resume?.parsedData?.skills ?? null);
    if (skills.length > 0) parts.push(`Skills: ${skills.join(', ')}.`);
    const titles = toExperienceTitles(resume?.parsedData?.experiences ?? null);
    if (titles.length > 0) parts.push(`Experience: ${titles.join('; ')}.`);

    return parts.join('\n').slice(0, CV_TEXT_LIMIT);
  }

  private async loadJobs(
    ids: string[],
  ): Promise<Map<string, { title: string; text: string }>> {
    const jobs = await this.prisma.job.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        title: true,
        description: true,
        requirements: true,
        responsibilities: true,
        company: { select: { name: true } },
      },
    });
    return new Map(
      jobs.map((j) => [
        j.id,
        {
          title: j.title,
          text: [
            j.company?.name ? `Company: ${j.company.name}.` : '',
            j.description ?? '',
            bullets('Requirements', j.requirements),
            bullets('Responsibilities', j.responsibilities),
          ]
            .filter(Boolean)
            .join('\n')
            .slice(0, JOB_TEXT_LIMIT),
        },
      ]),
    );
  }

  /** Run `fn` over items with at most `limit` in flight. */
  private async forEachLimited<T>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<void>,
  ): Promise<void> {
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        await fn(items[next++]);
      }
    });
    await Promise.all(workers);
  }
}

// ── Grounding check ──────────────────────────────────────────────────────────

/**
 * Is `claim` supported by `sourceNorm`?
 *
 * Strict = the normalized claim occurs verbatim (what the prompt demands).
 * Lenient additionally accepts a claim whose content tokens are almost all
 * present, so a model that re-cases or drops a filler word is not scored as
 * hallucinating. An empty claim is never grounded.
 */
export function isGrounded(claim: string, sourceNorm: string, lenient: boolean): boolean {
  const norm = normalize(claim);
  if (!norm) return false;
  if (sourceNorm.includes(norm)) return true;
  if (!lenient) return false;

  const tokens = norm.split(' ').filter((t) => t.length > 2);
  if (tokens.length === 0) return false;
  const hits = tokens.filter((t) => sourceNorm.includes(t)).length;
  return hits / tokens.length >= LENIENT_THRESHOLD;
}

/** Lowercase, strip punctuation, collapse whitespace — quoting is not exact typing. */
export function normalize(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function groundedness(
  rows: GenerationEvalRow[],
  total: (r: GenerationEvalRow) => number,
  hit: (r: GenerationEvalRow) => number,
): Groundedness {
  const claims = rows.reduce((s, r) => s + total(r), 0);
  const hits = rows.reduce((s, r) => s + hit(r), 0);
  const withClaims = rows.filter((r) => total(r) > 0);
  return {
    claims,
    micro: claims === 0 ? 0 : hits / claims,
    macro: mean(withClaims.map((r) => hit(r) / total(r))),
    pairs: withClaims.length,
  };
}

/** Render a String[] posting section as a markdown-ish bullet list ('' when empty). */
function bullets(heading: string, items: string[]): string {
  return items.length === 0 ? '' : `${heading}:\n- ${items.join('\n- ')}`;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

// ── Report formatting ────────────────────────────────────────────────────────

export function formatGenerationReportMarkdown(r: GenerationEvalReport): string {
  const c = r.calibration;
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  return [
    '# Generation Evaluation — calibration & faithfulness',
    '',
    `- Generated: ${r.generatedAt}`,
    `- Prompt version: **${r.promptVersion}**`,
    `- Pairs attempted: **${r.pairs}**   ·   scored: **${r.scored}**   ·   ` +
      `degraded (fallback): ${r.degraded}   ·   errors: ${r.errors}`,
    '',
    '## Calibration — LLM fitScore vs human grade',
    '',
    '| metric | value |',
    '|---|---|',
    `| Spearman ρ (pooled) | **${c.spearmanPooled.toFixed(3)}** |`,
    `| Spearman ρ (mean per candidate) | **${c.spearmanPerCandidateMean.toFixed(3)}** (${c.candidatesWithVariance} candidates) |`,
    '',
    '| human grade | n | mean fitScore |',
    '|---|---|---|',
    ...GRADE_NAME.map(
      (g) =>
        `| ${g} | ${c.meanScoreByGrade[g].n} | ${c.meanScoreByGrade[g].mean.toFixed(3)} |`,
    ),
    '',
    '## Faithfulness — is `evidenceFromCv` really in the CV?',
    '',
    '| metric | value |',
    '|---|---|',
    `| Faithfulness (micro, all quotes) | **${pct(r.faithfulness.micro)}** |`,
    `| Faithfulness (macro, mean per pair) | ${pct(r.faithfulness.macro)} |`,
    `| Evidence quotes checked | ${r.faithfulness.claims} (over ${r.faithfulness.pairs} pairs) |`,
    `| Empty evidence strings | ${r.faithfulness.emptyEvidence} |`,
    '',
    '## Requirement groundedness — is the cited requirement really in the JD?',
    '',
    '| metric | value |',
    '|---|---|',
    `| Grounded (micro) | ${pct(r.requirementGroundedness.micro)} |`,
    `| Grounded (macro) | ${pct(r.requirementGroundedness.macro)} |`,
    `| Requirements checked | ${r.requirementGroundedness.claims} |`,
    '',
    '### Sample ungrounded quotes (what the model invented)',
    '',
    ...sampleUngrounded(r.rows),
    '',
    '## Verdict vs human grade',
    '',
    verdictTable(r.verdictByGrade),
    '',
    '## Latency (indicative — laptop, qwen3:0.6b)',
    '',
    `- mean ${Math.round(r.latencyMs.mean)}ms · p50 ${Math.round(r.latencyMs.p50)}ms · p99 ${Math.round(r.latencyMs.p99)}ms`,
    '',
    '## Caveats',
    '- Ground truth = the same hand-labeled `match_labels` pairs as the retrieval eval (**partial labels**).',
    '- Grades: **GREAT=2, OK=1, BAD=0**. ρ = 0 also means "undefined" (no variance) — read it with `n`.',
    '- Faithfulness is **strict/verbatim** (normalized substring). It measures whether a quote exists in the CV,',
    '  NOT whether it supports the requirement it was attached to — a real quote pinned to the wrong requirement still passes.',
    '- Degraded rows (AI-service deterministic fallback) are excluded from every metric above.',
    '- Latency is a laptop-with-qwen3:0.6b figure, run at concurrency > 1: indicative only, not a Phase D serving number.',
    '',
  ].join('\n');
}

/** A few failing quotes verbatim — aggregate numbers alone don't tell you what to fix. */
function sampleUngrounded(rows: GenerationEvalRow[], limit = 8): string[] {
  const quotes = rows.flatMap((r) => r.ungroundedEvidence).filter((q) => q.trim());
  if (quotes.length === 0) return ['_(none — every quote was found in the CV)_'];
  return quotes.slice(0, limit).map((q) => `- \`${q.replace(/`/g, "'").slice(0, 160)}\``);
}

function verdictTable(byGrade: Record<string, Record<string, number>>): string {
  const verdicts = [...new Set(Object.values(byGrade).flatMap((v) => Object.keys(v)))].sort();
  if (verdicts.length === 0) return '_(no scored pairs)_';
  return [
    `| human grade | ${verdicts.join(' | ')} |`,
    `|---|${verdicts.map(() => '---').join('|')}|`,
    ...GRADE_NAME.map(
      (g) => `| ${g} | ${verdicts.map((v) => byGrade[g]?.[v] ?? 0).join(' | ')} |`,
    ),
  ].join('\n');
}
