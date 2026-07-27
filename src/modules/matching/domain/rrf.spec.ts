import { reciprocalRankFusion } from './rrf';

describe('reciprocalRankFusion', () => {
  it('ranks an item appearing high in both lists above single-list items', () => {
    const dense = ['a', 'b', 'c'];
    const sparse = ['b', 'd', 'a'];
    const fused = reciprocalRankFusion([dense, sparse]).map((f) => f.id);
    // b is rank0 in sparse + rank1 in dense -> highest combined; a is in both too.
    expect(fused[0]).toBe('b');
    expect(fused.slice(0, 2)).toEqual(expect.arrayContaining(['a', 'b']));
    expect(fused).toContain('d');
  });

  it('uses 1/(k+rank+1) and sums across lists', () => {
    const fused = reciprocalRankFusion([['x'], ['x']], 60);
    // x appears at rank 0 in both -> 2 * 1/61
    expect(fused[0]).toEqual({ id: 'x', score: 2 / 61 });
  });

  it('handles empty lists (dense-only degrades gracefully)', () => {
    const fused = reciprocalRankFusion([['a', 'b'], []]).map((f) => f.id);
    expect(fused).toEqual(['a', 'b']);
  });

  it('is deterministic on ties (stable by id)', () => {
    const fused = reciprocalRankFusion([['a'], ['b']]).map((f) => f.id);
    expect(fused).toEqual(['a', 'b']); // equal scores -> id order
  });
});
