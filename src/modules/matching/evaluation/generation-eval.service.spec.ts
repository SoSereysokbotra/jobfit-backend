import { isGrounded, normalize } from './generation-eval.service';
import { pearson, rankWithTies, spearman } from './metrics';

describe('rankWithTies', () => {
  it('assigns 1-based ascending ranks', () => {
    expect(rankWithTies([10, 30, 20])).toEqual([1, 3, 2]);
  });

  it('gives tied values the average of their ranks', () => {
    // two values tie for ranks 1 and 2 -> both get 1.5; the last gets 3.
    expect(rankWithTies([5, 5, 9])).toEqual([1.5, 1.5, 3]);
  });
});

describe('spearman', () => {
  it('is 1 for a perfectly monotonic relationship (non-linear included)', () => {
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1, 6);
  });

  it('is -1 when the ranking is exactly reversed', () => {
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 6);
  });

  it('handles the graded-label case (many ties in y)', () => {
    // fitScores that order the GREAT=2 / OK=1 / BAD=0 grades correctly. Ties in
    // the grades cap rho BELOW 1 even for a perfect ordering — that ceiling is
    // why the report must be read against `n`, not against 1.0.
    const scores = [0.1, 0.2, 0.5, 0.6, 0.9, 0.95];
    const grades = [0, 0, 1, 1, 2, 2];
    const perfect = spearman(scores, grades);
    expect(perfect).toBeCloseTo(0.956, 3);

    // A wrong ordering within the same tie structure must score strictly lower.
    const muddled = spearman([0.9, 0.2, 0.5, 0.6, 0.1, 0.95], grades);
    expect(muddled).toBeLessThan(perfect);
  });

  it('returns 0 when a series has no variance (rho is undefined)', () => {
    expect(spearman([0.5, 0.5, 0.5], [0, 1, 2])).toBe(0);
  });

  it('returns 0 for fewer than two points', () => {
    expect(spearman([0.5], [1])).toBe(0);
  });
});

describe('pearson', () => {
  it('is 1 for a perfect linear relationship', () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
  });
});

describe('normalize', () => {
  it('lowercases, strips punctuation and collapses whitespace', () => {
    expect(normalize('  5+ years of  Python (FastAPI), Node.js! ')).toBe(
      '5+ years of python fastapi node.js',
    );
  });
});

describe('isGrounded', () => {
  const cv = normalize(
    'Backend engineer with 5 years building REST APIs in Python (FastAPI). ' +
      'Led a team of 3 engineers.',
  );

  it('accepts a verbatim quote', () => {
    expect(isGrounded('5 years building REST APIs', cv, false)).toBe(true);
  });

  it('accepts a quote that differs only in case and punctuation', () => {
    expect(isGrounded('Python (FastAPI)', cv, false)).toBe(true);
  });

  it('rejects an invented claim under strict matching', () => {
    expect(isGrounded('Kubernetes in production', cv, false)).toBe(false);
  });

  it('rejects an invented claim under lenient matching too', () => {
    expect(isGrounded('Kubernetes and Kafka at scale', cv, true)).toBe(false);
  });

  it('accepts a reworded-but-supported claim only when lenient', () => {
    const claim = 'led team engineers';
    expect(isGrounded(claim, cv, false)).toBe(false);
    expect(isGrounded(claim, cv, true)).toBe(true);
  });

  it('never grounds an empty claim', () => {
    expect(isGrounded('', cv, true)).toBe(false);
    expect(isGrounded('   ', cv, true)).toBe(false);
  });
});
