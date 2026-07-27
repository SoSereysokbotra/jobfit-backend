import { parseLabelsJsonl } from './eval-set.loader';

describe('parseLabelsJsonl', () => {
  it('parses valid lines with slices and normalizes the label enum', () => {
    const text = [
      '{"userId":"u1","jobId":"jA","label":"great","category":"eng","seniority":"senior","language":"en","reason":"strong"}',
      '{"userId":"u1","jobId":"jB","label":"OK"}',
    ].join('\n');
    const { labels, errors, duplicates } = parseLabelsJsonl(text);
    expect(errors).toEqual([]);
    expect(duplicates).toBe(0);
    expect(labels).toEqual([
      {
        userId: 'u1', jobId: 'jA', label: 'GREAT', reason: 'strong',
        source: 'HUMAN', category: 'eng', seniority: 'senior', language: 'en',
      },
      {
        userId: 'u1', jobId: 'jB', label: 'OK', reason: null,
        source: 'HUMAN', category: null, seniority: null, language: null,
      },
    ]);
  });

  it('skips blank and comment lines', () => {
    const text = ['', '  ', '// a comment', '# another', '{"userId":"u1","jobId":"jA","label":"bad"}'].join('\n');
    const { labels, errors } = parseLabelsJsonl(text);
    expect(errors).toEqual([]);
    expect(labels).toHaveLength(1);
    expect(labels[0].label).toBe('BAD');
  });

  it('records errors for malformed lines but keeps the good ones', () => {
    const text = [
      '{bad json',
      '{"userId":"u1","label":"great"}',            // missing jobId
      '{"userId":"u1","jobId":"jA","label":"meh"}', // bad label
      '{"userId":"u1","jobId":"jB","label":"ok"}',  // good
    ].join('\n');
    const { labels, errors } = parseLabelsJsonl(text);
    expect(labels).toHaveLength(1);
    expect(labels[0].jobId).toBe('jB');
    expect(errors).toEqual([
      'line 1: invalid JSON',
      'line 2: missing jobId',
      expect.stringContaining('line 3: label must be great|ok|bad'),
    ]);
  });

  it('dedupes by (userId, jobId), last wins, and counts duplicates', () => {
    const text = [
      '{"userId":"u1","jobId":"jA","label":"bad"}',
      '{"userId":"u1","jobId":"jA","label":"great"}',
    ].join('\n');
    const { labels, duplicates } = parseLabelsJsonl(text);
    expect(labels).toHaveLength(1);
    expect(labels[0].label).toBe('GREAT');
    expect(duplicates).toBe(1);
  });

  it('accepts an explicit feedback source', () => {
    const { labels } = parseLabelsJsonl('{"userId":"u1","jobId":"jA","label":"ok","source":"feedback"}');
    expect(labels[0].source).toBe('FEEDBACK');
  });
});
