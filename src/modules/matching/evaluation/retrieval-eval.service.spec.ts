import {
  RetrievalEvalService,
  formatReportMarkdown,
  EvalLabel,
} from './retrieval-eval.service';

// Fake retrieval — returns a fixed ranked jobId list per candidate. This is where
// the REAL RecomputeUserMatchesUseCase.retrieveRankedJobs() plugs in for real runs.
function fakeRecompute(ranking: Record<string, string[]>) {
  return {
    retrieveRankedJobs: jest.fn(async (userId: string) =>
      (ranking[userId] ?? []).map((id) => ({ id, cosine_sim: 0.5 })),
    ),
  } as never;
}

const L = (
  userId: string,
  jobId: string,
  label: EvalLabel['label'],
  slice: Partial<Pick<EvalLabel, 'category' | 'seniority' | 'language'>> = {},
): EvalLabel => ({ userId, jobId, label, ...slice });

describe('RetrievalEvalService', () => {
  it('computes overall + sliced metrics with per-slice candidate counts', async () => {
    // u1: jA great + jD ok are relevant (2 total); retrieval got jA (rank 1) but not jD.
    //     jB bad is retrieved at rank 2. jC retrieved (unlabeled).
    // u2: only jX bad (km) -> no relevant items -> excluded from all metrics.
    const labels: EvalLabel[] = [
      L('u1', 'jA', 'GREAT', { category: 'eng', seniority: 'senior', language: 'en' }),
      L('u1', 'jB', 'BAD', { category: 'eng', seniority: 'senior', language: 'en' }),
      L('u1', 'jD', 'OK', { category: 'eng', seniority: 'senior', language: 'en' }),
      L('u2', 'jX', 'BAD', { category: 'eng', seniority: 'senior', language: 'km' }),
    ];
    const service = new RetrievalEvalService(
      fakeRecompute({ u1: ['jA', 'jB', 'jC'], u2: ['jX'] }),
    );

    const r = await service.evaluate(labels, 10);

    // Overall: only u1 is measurable (u2 has no relevant labels).
    expect(r.candidates).toBe(1);
    expect(r.overall.n).toBe(1);
    expect(r.overall.recall).toBeCloseTo(0.5, 5); // jA retrieved of {jA,jD}
    expect(r.overall.mrr).toBeCloseTo(1, 5); // first relevant at rank 1
    // ranked grades [2,0,0] -> dcg = 3; ideal [2,1,0] -> idcg = 3 + 1/log2(3).
    const dcg = (2 ** 2 - 1) / Math.log2(2);
    const idcg = (2 ** 2 - 1) / Math.log2(2) + (2 ** 1 - 1) / Math.log2(3);
    expect(r.overall.ndcg).toBeCloseTo(dcg / idcg, 10);

    // Slice counts: en has the measurable u1; km only has BAD-only u2 -> n=0.
    expect(r.byLanguage['en'].n).toBe(1);
    expect(r.byLanguage['km'].n).toBe(0);
    expect(r.byCategory['eng'].n).toBe(1);
    expect(r.bySeniority['senior'].n).toBe(1);
  });

  it('report includes per-slice n counts and the documented caveats', () => {
    const md = formatReportMarkdown({
      generatedAt: '2026-07-27T00:00:00.000Z',
      retriever: 'hybrid',
      k: 10,
      candidates: 1,
      labels: 4,
      overall: { n: 1, recall: 0.5, mrr: 1, ndcg: 0.826 },
      byCategory: { eng: { n: 1, recall: 0.5, mrr: 1, ndcg: 0.826 } },
      bySeniority: { senior: { n: 1, recall: 0.5, mrr: 1, ndcg: 0.826 } },
      byLanguage: { en: { n: 1, recall: 0.5, mrr: 1, ndcg: 0.826 }, km: { n: 0, recall: 0, mrr: 0, ndcg: 0 } },
    });
    expect(md).toContain('| en | 1 |');
    expect(md).toContain('| km | 0 |');
    expect(md).toContain('partial labels');
    expect(md).toContain('GREAT=2, OK=1, BAD=0');
    expect(md).toContain('too sparse to trust');
  });
});
