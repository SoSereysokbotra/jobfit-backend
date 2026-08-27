// Offline retrieval-quality evaluation (RAG plan Phase A).
//
// Reuses the REAL production retrieval (`RecomputeUserMatchesUseCase.retrieveRankedJobs`)
// so the harness can never drift from what ships. Computes Recall@k / MRR@k / nDCG@k
// against hand-labeled pairs, aggregated overall and sliced by category / seniority /
// language, with the labeled-candidate count (`n`) per slice.

import { Injectable, Logger } from '@nestjs/common';
import { MatchLabelValue } from '@prisma/client';
import { RecomputeUserMatchesUseCase } from '../application/use-cases/recompute-user-matches.use-case';
import { ndcgAtK, recallAtK, reciprocalRankAtK } from './metrics';

export interface EvalLabel {
  userId: string;
  jobId: string;
  label: MatchLabelValue;
  category?: string | null;
  seniority?: string | null;
  language?: string | null;
}

export interface SliceMetrics {
  n: number; // candidates with >=1 relevant (GREAT/OK) label in this slice
  recall: number;
  mrr: number;
  ndcg: number;
}

export interface EvalReport {
  generatedAt: string;
  /** e.g. "hybrid", "hybrid+rerank", or "hybrid+rerank(DEGRADED)" — see {@link degraded}. */
  retriever: string;
  k: number;
  candidates: number;
  labels: number;
  /**
   * Set when a rerank was requested but did not run for at least one candidate, because
   * the AI service was unavailable.
   *
   * WHY THIS IS IN THE REPORT. `rerankFused` degrades to the fused order on purpose — a
   * rerank failure must never cost a user their recommendations. But this harness used to
   * label its output from the option it PASSED, so a run against a dead AI service
   * reported the plain fused baseline under the name "hybrid+rerank". The measured
   * "MRR@10 0.63 -> 0.75 (+20%)" is the headline result of this project; a harness that
   * can silently reproduce it as 0.63 -> 0.63, or worse record a baseline as a treatment,
   * is worse than no harness. `generation-eval.service.ts` already excluded degraded rows
   * from its metrics; this is the same rule applied here.
   */
  degraded?: {
    rerankRequested: boolean;
    /** Candidates whose retrieval silently fell back to the fused order. */
    rerankSkippedFor: number;
    /** Distinct reasons, e.g. ["NETWORK"], ["MODEL_TIMEOUT"]. */
    reasons: string[];
  };
  overall: SliceMetrics;
  byCategory: Record<string, SliceMetrics>;
  bySeniority: Record<string, SliceMetrics>;
  byLanguage: Record<string, SliceMetrics>;
}

const GRADE: Record<MatchLabelValue, number> = {
  [MatchLabelValue.GREAT]: 2,
  [MatchLabelValue.OK]: 1,
  [MatchLabelValue.BAD]: 0,
};

@Injectable()
export class RetrievalEvalService {
  private readonly logger = new Logger(RetrievalEvalService.name);

  constructor(private readonly recompute: RecomputeUserMatchesUseCase) {}

  async evaluate(
    labels: EvalLabel[],
    k = 10,
    opts: { rerank?: boolean; filter?: boolean } = {},
  ): Promise<EvalReport> {
    const byUser = new Map<string, EvalLabel[]>();
    for (const l of labels) {
      const arr = byUser.get(l.userId) ?? [];
      arr.push(l);
      byUser.set(l.userId, arr);
    }

    // Retrieve once per candidate — the exact production query (+ optional rerank).
    //
    // rerank/filter are coerced to explicit booleans, never left undefined: production
    // resolves an undefined `rerank` from config, so passing it through would make an
    // "hybrid baseline" run silently inherit whatever the deployment happens to have
    // enabled. A measurement must state what it measured.
    const retrieved = new Map<string, string[]>();
    // A rerank that was asked for and did not happen makes this run something other than
    // what it will be labelled. Count it per candidate rather than as a boolean: "3 of 40
    // degraded" and "40 of 40 degraded" are very different reports.
    const rerankSkipped = new Set<string>();
    const skipReasons = new Set<string>();

    for (const userId of byUser.keys()) {
      const rows = await this.recompute.retrieveRankedJobs(userId, k, {
        rerank: opts.rerank === true,
        filter: opts.filter === true,
        onRerankSkipped: (reason) => {
          rerankSkipped.add(userId);
          skipReasons.add(reason);
        },
      });
      retrieved.set(userId, rows.map((r) => r.id));
    }

    if (rerankSkipped.size > 0) {
      this.logger.error(
        `Rerank was requested but did not run for ${rerankSkipped.size}/${byUser.size} ` +
          `candidate(s) [${[...skipReasons].join(', ')}]. These numbers are NOT a ` +
          'reranked measurement — the AI service was unavailable.',
      );
    }

    const overall =
      this.bucket(byUser, retrieved, k, () => 'all')['all'] ?? emptyMetrics();

    const degraded =
      rerankSkipped.size > 0
        ? {
            rerankRequested: opts.rerank === true,
            rerankSkippedFor: rerankSkipped.size,
            reasons: [...skipReasons],
          }
        : undefined;

    return {
      generatedAt: new Date().toISOString(),
      // The name carries the caveat. A file called "hybrid+rerank" that is silently the
      // fused baseline is the failure mode; "(DEGRADED)" makes it impossible to quote by
      // accident.
      retriever:
        'hybrid' +
        (opts.filter ? '+filter' : '') +
        (opts.rerank ? '+rerank' : '') +
        (degraded ? '(DEGRADED)' : ''),
      ...(degraded ? { degraded } : {}),
      k,
      candidates: overall.n,
      labels: labels.length,
      overall,
      byCategory: this.bucket(byUser, retrieved, k, (l) => l.category ?? null),
      bySeniority: this.bucket(byUser, retrieved, k, (l) => l.seniority ?? null),
      byLanguage: this.bucket(byUser, retrieved, k, (l) => l.language ?? null),
    };
  }

  /**
   * Metrics per slice value. Within a slice, a candidate's relevant set = only its
   * labels carrying that slice value; a candidate contributes iff it has >=1
   * relevant (grade>0) label there (nothing to retrieve otherwise).
   */
  private bucket(
    byUser: Map<string, EvalLabel[]>,
    retrieved: Map<string, string[]>,
    k: number,
    keyOf: (l: EvalLabel) => string | null,
  ): Record<string, SliceMetrics> {
    const groups = new Map<string, Map<string, EvalLabel[]>>();
    for (const [userId, userLabels] of byUser) {
      for (const l of userLabels) {
        const key = keyOf(l);
        if (key == null) continue;
        const perUser = groups.get(key) ?? new Map<string, EvalLabel[]>();
        const arr = perUser.get(userId) ?? [];
        arr.push(l);
        perUser.set(userId, arr);
        groups.set(key, perUser);
      }
    }

    const out: Record<string, SliceMetrics> = {};
    for (const [key, perUser] of groups) {
      let n = 0;
      let recall = 0;
      let mrr = 0;
      let ndcg = 0;
      for (const [userId, relevantLabels] of perUser) {
        const grades = relevantLabels.map((l) => GRADE[l.label]);
        const totalRelevant = grades.filter((g) => g > 0).length;
        if (totalRelevant === 0) continue;

        const gradeByJob = new Map(relevantLabels.map((l) => [l.jobId, GRADE[l.label]]));
        const ranked = (retrieved.get(userId) ?? [])
          .slice(0, k)
          .map((id) => gradeByJob.get(id) ?? 0);

        recall += recallAtK(ranked, totalRelevant, k);
        mrr += reciprocalRankAtK(ranked, k);
        ndcg += ndcgAtK(ranked, grades, k);
        n++;
      }
      out[key] = n === 0 ? emptyMetrics() : { n, recall: recall / n, mrr: mrr / n, ndcg: ndcg / n };
    }
    return out;
  }
}

function emptyMetrics(): SliceMetrics {
  return { n: 0, recall: 0, mrr: 0, ndcg: 0 };
}

// ── Report formatting (markdown; used for stdout AND the persisted report) ──────

export function formatReportMarkdown(r: EvalReport): string {
  const lines: string[] = [
    `# Retrieval Evaluation — Recall@${r.k} / MRR@${r.k} / nDCG@${r.k}`,
    '',
    `- Generated: ${r.generatedAt}`,
    `- Retriever: **${r.retriever}**`,
    ...(r.degraded
      ? [
          '',
          `> ⚠️ **NOT A RERANKED MEASUREMENT.** The reranker was requested but did not run for ` +
            `${r.degraded.rerankSkippedFor} candidate(s) — the AI service was unavailable ` +
            `(${r.degraded.reasons.join(', ')}). Retrieval fell back to the fused order, so these ` +
            `numbers are the hybrid baseline wearing the reranker's name. Do not quote them.`,
          '',
        ]
      : []),
    `- Candidates evaluated: **${r.candidates}**   ·   Labels: ${r.labels}   ·   k = ${r.k}`,
    '',
    '## Overall',
    metricsTable([['all', r.overall]]),
    '',
    '## By category',
    metricsTable(sortEntries(r.byCategory)),
    '',
    '## By seniority',
    metricsTable(sortEntries(r.bySeniority)),
    '',
    '## By language',
    metricsTable(sortEntries(r.byLanguage)),
    '',
    '## Caveats',
    '- Relevant set = hand-labeled GREAT/OK per candidate (**partial labels**; unlabeled retrieved items count as non-relevant).',
    '- Graded gains: **GREAT=2, OK=1, BAD=0**.',
    '- `n` = labeled candidates contributing to that slice. **Small `n` = too sparse to trust.**',
    '',
  ];
  return lines.join('\n');
}

function sortEntries(rec: Record<string, SliceMetrics>): [string, SliceMetrics][] {
  return Object.entries(rec).sort((a, b) => a[0].localeCompare(b[0]));
}

function metricsTable(rows: [string, SliceMetrics][]): string {
  if (rows.length === 0) return '_(no labeled data for this slice)_';
  const head = '| slice | n | Recall@k | MRR@k | nDCG@k |\n|---|---|---|---|---|';
  const body = rows.map(
    ([name, m]) =>
      `| ${name} | ${m.n} | ${m.recall.toFixed(3)} | ${m.mrr.toFixed(3)} | ${m.ndcg.toFixed(3)} |`,
  );
  return [head, ...body].join('\n');
}
