// Offline retrieval-quality evaluation (RAG plan Phase A).
//
// Reuses the REAL production retrieval (`RecomputeUserMatchesUseCase.retrieveRankedJobs`)
// so the harness can never drift from what ships. Computes Recall@k / MRR@k / nDCG@k
// against hand-labeled pairs, aggregated overall and sliced by category / seniority /
// language, with the labeled-candidate count (`n`) per slice.

import { Injectable } from '@nestjs/common';
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
  retriever: string; // "hybrid" | "hybrid+rerank"
  k: number;
  candidates: number;
  labels: number;
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
  constructor(private readonly recompute: RecomputeUserMatchesUseCase) {}

  async evaluate(
    labels: EvalLabel[],
    k = 10,
    opts: { rerank?: boolean } = {},
  ): Promise<EvalReport> {
    const byUser = new Map<string, EvalLabel[]>();
    for (const l of labels) {
      const arr = byUser.get(l.userId) ?? [];
      arr.push(l);
      byUser.set(l.userId, arr);
    }

    // Retrieve once per candidate — the exact production query (+ optional rerank).
    const retrieved = new Map<string, string[]>();
    for (const userId of byUser.keys()) {
      const rows = await this.recompute.retrieveRankedJobs(userId, k, {
        rerank: opts.rerank,
      });
      retrieved.set(userId, rows.map((r) => r.id));
    }

    const overall =
      this.bucket(byUser, retrieved, k, () => 'all')['all'] ?? emptyMetrics();

    return {
      generatedAt: new Date().toISOString(),
      retriever: opts.rerank ? 'hybrid+rerank' : 'hybrid',
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
