// Unit tests for reading-order reconstruction.
//
// Each case encodes a real failure observed on the reference CV, where pdf-parse's
// content-stream order put a job title four lines below its own bullets, pooled three
// education date ranges away from their degrees, and stranded a whole skills column.
// Synthetic positioned items keep these deterministic and PDF-free.

import { PositionedTextItem, toReadingOrder } from './pdf-reading-order';

/** Build an item at (x, y). PDF origin is bottom-left: larger y = higher on the page. */
function item(str: string, x: number, y: number, h = 10): PositionedTextItem {
  return { str, transform: [h, 0, 0, h, x, y], width: str.length * (h * 0.5), height: h };
}

describe('toReadingOrder', () => {
  it('returns an empty string for no items', () => {
    expect(toReadingOrder([])).toBe('');
  });

  it('orders rows top -> bottom regardless of input order', () => {
    // Deliberately supplied bottom-up, the way a scrambled content stream would.
    const out = toReadingOrder([
      item('third', 50, 600),
      item('first', 50, 700),
      item('second', 50, 650),
    ]);
    expect(out).toBe('first\nsecond\nthird');
  });

  it('orders items within a row left -> right', () => {
    // 'hello' spans x 50..75, so x=80 is an ordinary word gap, not a column break.
    const out = toReadingOrder([item('world', 80, 700), item('hello', 50, 700)]);
    expect(out).toBe('hello world');
  });

  it('joins a right-aligned date onto its heading row', () => {
    // The pooled-dates bug: the date shares a baseline with the degree, so it must
    // stay on that line rather than drifting into a cluster of bare dates.
    const out = toReadingOrder([
      item('Bachelor of Software Engineering', 50, 700),
      item('(2025 - Present)', 400, 700),
      item('Kirirom Institute of Technology (KIT)', 50, 686),
    ]);
    const [firstLine] = out.split('\n');
    expect(firstLine).toContain('Bachelor of Software Engineering');
    expect(firstLine).toContain('(2025 - Present)');
  });

  it('keeps a job title above its own bullets', () => {
    const out = toReadingOrder([
      item('Assisted with technical tasks.', 60, 660),
      item('Electrical Engineering Intern', 50, 700),
      item('Completed an internship.', 60, 680),
    ]);
    expect(out.split('\n')).toEqual([
      'Electrical Engineering Intern',
      'Completed an internship.',
      'Assisted with technical tasks.',
    ]);
  });

  it('preserves multi-column layout as one row per visual row', () => {
    // A 3-column skills block: all nine entries survive, grouped by row.
    const cols = [50, 250, 450];
    const rows = [700, 686, 672];
    const skills = [
      ['Effective Time Management', 'Communication', 'Hardware + Software'],
      ['Creative Problem-Solving', 'Critical Thinking', 'Technical Skills'],
      ['Programming', 'Teamwork', 'Telecommunication'],
    ];
    const items = skills.flatMap((row, r) =>
      row.map((s, c) => item(s, cols[c], rows[r])),
    );

    const lines = toReadingOrder(items).split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Effective Time Management');
    expect(lines[0]).toContain('Hardware + Software');
    // Every one of the nine must survive — the original bug dropped a whole column.
    skills.flat().forEach((s) => expect(toReadingOrder(items)).toContain(s));
  });

  it('separates columns with wider whitespace than words within a column', () => {
    const out = toReadingOrder([item('Programming', 50, 700), item('Teamwork', 400, 700)]);
    // A column gap must not read as a single run-on phrase.
    expect(out).toMatch(/Programming\s{2,}Teamwork/);
  });

  it('ignores blank and whitespace-only items', () => {
    const out = toReadingOrder([
      item('kept', 50, 700),
      item('   ', 120, 700),
      item('', 200, 700),
    ]);
    expect(out).toBe('kept');
  });

  it('normalises whitespace inside an item', () => {
    expect(toReadingOrder([item('a   ragged\n  item', 50, 700)])).toBe('a ragged item');
  });

  it('groups a row against its first item, so rows cannot drift downwards', () => {
    // Three items each 4pt below the previous. With a ~5pt tolerance, comparing to the
    // previous item would chain them into one row; comparing to the row's first item
    // correctly splits once the cumulative offset exceeds the tolerance.
    const out = toReadingOrder([
      item('a', 50, 700),
      item('b', 60, 696),
      item('c', 70, 692),
    ]);
    expect(out.split('\n').length).toBeGreaterThan(1);
  });

  it('falls back to a usable height when the transform carries none', () => {
    const broken: PositionedTextItem = {
      str: 'no-scale',
      transform: [0, 0, 0, 0, 50, 700],
      height: 0,
    };
    expect(toReadingOrder([broken])).toBe('no-scale');
  });
});
