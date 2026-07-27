import {
  recallAtK,
  reciprocalRankAtK,
  dcgAtK,
  ndcgAtK,
} from './metrics';

describe('retrieval metrics', () => {
  describe('recallAtK', () => {
    it('counts relevant hits in top-k over the total relevant set', () => {
      // top-10 grades: two relevant (2 and 1) retrieved; 3 relevant exist in total.
      expect(recallAtK([2, 0, 0, 1, 0, 0, 0, 0, 0, 0], 3, 10)).toBeCloseTo(2 / 3);
    });
    it('respects the k cutoff (a relevant at rank 11 is missed at k=10)', () => {
      const ranked = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2]; // relevant at index 10 (rank 11)
      expect(recallAtK(ranked, 1, 10)).toBe(0);
      expect(recallAtK(ranked, 1, 11)).toBe(1);
    });
    it('is 0 when there is nothing relevant to recall', () => {
      expect(recallAtK([0, 0, 0], 0, 10)).toBe(0);
    });
    it('is 1 when all relevant items are retrieved in top-k', () => {
      expect(recallAtK([2, 1], 2, 10)).toBe(1);
    });
  });

  describe('reciprocalRankAtK', () => {
    it('is 1 when the first item is relevant', () => {
      expect(reciprocalRankAtK([2, 0, 0], 10)).toBe(1);
    });
    it('is 1/rank of the first relevant item', () => {
      expect(reciprocalRankAtK([0, 0, 1], 10)).toBeCloseTo(1 / 3);
    });
    it('is 0 when no relevant item appears within k', () => {
      expect(reciprocalRankAtK([0, 0, 1], 2)).toBe(0);
      expect(reciprocalRankAtK([], 10)).toBe(0);
    });
  });

  describe('dcgAtK / ndcgAtK', () => {
    it('dcg uses graded gains (2^g - 1)/log2(rank+1)', () => {
      // [2,0,1] -> 3/log2(2) + 0 + 1/log2(4) = 3 + 0 + 0.5 = 3.5
      expect(dcgAtK([2, 0, 1], 3)).toBeCloseTo(3.5);
    });
    it('is 1.0 for a perfect ranking', () => {
      expect(ndcgAtK([2, 1], [2, 1], 10)).toBeCloseTo(1);
      expect(ndcgAtK([2], [2], 1)).toBeCloseTo(1);
    });
    it('penalizes a relevant item ranked below an irrelevant one', () => {
      // ranked [1,2] vs ideal [2,1]:
      //   dcg = 1/log2(2) + 3/log2(3) = 1 + 1.892789 = 2.892789
      //   idcg = 3/log2(2) + 1/log2(3) = 3 + 0.630930 = 3.630930
      expect(ndcgAtK([1, 2], [2, 1], 2)).toBeCloseTo(2.892789 / 3.630930, 5);
    });
    it('is 0 when nothing relevant exists (ideal DCG = 0)', () => {
      expect(ndcgAtK([0, 0], [0], 10)).toBe(0);
      expect(ndcgAtK([], [], 10)).toBe(0);
    });
  });
});
