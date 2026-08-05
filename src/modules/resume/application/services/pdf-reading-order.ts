// src/modules/resume/application/services/pdf-reading-order.ts
//
// Reconstructs human reading order from a PDF page's positioned text items.
//
// WHY THIS EXISTS: `pdf-parse` returns text in PDF content-stream order, which has no
// relation to how the page reads. On real CV templates (multi-column skill lists,
// right-aligned date ranges, boxed sections) that order is scrambled badly enough to
// break parsing outright — on the reference CV a job title landed four lines BELOW its
// own bullets, three education date ranges pooled together away from their degrees, and
// an entire skills column was stranded between two unrelated schools.
//
// pdf.js exposes each text item's position, so the order can be rebuilt:
//   1. group items into visual rows by baseline y (within a tolerance)
//   2. sort rows top -> bottom
//   3. sort within each row left -> right by x
//
// This is deliberately layout-agnostic: no per-template rules, no tuned magic numbers
// beyond a line-height-relative tolerance. Overfitting to one CV would silently break
// every other one.

/** The subset of pdf.js's TextItem this module needs. */
export interface PositionedTextItem {
  str: string;
  /** pdf.js transform matrix [a, b, c, d, e, f]: e = x, f = y (baseline), d ≈ font height. */
  transform: number[];
  width?: number;
  height?: number;
}

interface Placed {
  str: string;
  x: number;
  y: number;
  h: number;
  w: number;
}

/** Items whose baselines differ by less than (line height × this) are on the same row. */
const ROW_TOLERANCE_RATIO = 0.5;

/**
 * Horizontal gap, in multiples of line height, wide enough to mean "separate column"
 * rather than "space between words".
 */
const COLUMN_GAP_RATIO = 1.5;

/**
 * Render positioned text items as text in reading order.
 *
 * Column boundaries are preserved as runs of whitespace rather than an invented
 * delimiter — a 3-column skills list must not read as one run-on phrase, but adding
 * characters that aren't in the document would be fabrication.
 */
export function toReadingOrder(items: PositionedTextItem[]): string {
  const placed = toPlaced(items);
  if (placed.length === 0) return '';

  const lineHeight = medianHeight(placed);
  const rowTolerance = Math.max(2, lineHeight * ROW_TOLERANCE_RATIO);

  return groupIntoRows(placed, rowTolerance)
    .map((row) => renderRow(row, lineHeight))
    .filter((line) => line.length > 0)
    .join('\n');
}

function toPlaced(items: PositionedTextItem[]): Placed[] {
  return items
    .filter((it) => typeof it.str === 'string' && it.str.trim().length > 0)
    .map((it) => ({
      // Normalise whitespace inside an item only; gaps BETWEEN items carry the
      // layout information and are computed from coordinates further down.
      str: it.str.replace(/\s+/g, ' ').trim(),
      x: it.transform[4],
      y: it.transform[5],
      // transform[3] is the vertical scale — the most reliable height signal.
      // `height` is 0 for some rotated/scaled text, hence the fallbacks.
      h: Math.abs(it.transform[3]) || it.height || 10,
      w: it.width ?? 0,
    }));
}

function medianHeight(placed: Placed[]): number {
  const heights = placed.map((p) => p.h).sort((a, b) => a - b);
  return heights[Math.floor(heights.length / 2)] || 10;
}

/** Bucket items into visual rows, ordered top -> bottom. */
function groupIntoRows(placed: Placed[], tolerance: number): Placed[][] {
  // PDF origin is bottom-left, so a LARGER y sits HIGHER on the page.
  const topDown = [...placed].sort((a, b) => b.y - a.y);

  const rows: Placed[][] = [];
  let current: Placed[] = [topDown[0]];

  for (let i = 1; i < topDown.length; i++) {
    const item = topDown[i];
    // Compare against the row's first item: comparing against the previous item
    // would let a row drift downwards one tolerance-step at a time.
    if (Math.abs(item.y - current[0].y) <= tolerance) {
      current.push(item);
    } else {
      rows.push(current);
      current = [item];
    }
  }
  rows.push(current);
  return rows;
}

/** Join one row's items left -> right, preserving column gaps as whitespace. */
function renderRow(row: Placed[], lineHeight: number): string {
  const leftToRight = [...row].sort((a, b) => a.x - b.x);
  const columnGap = lineHeight * COLUMN_GAP_RATIO;

  let line = '';
  let prevEnd: number | null = null;

  for (const item of leftToRight) {
    if (item.str.length === 0) continue;

    if (prevEnd !== null) {
      const gap = item.x - prevEnd;
      if (gap > columnGap) line += '   ';
      else if (!line.endsWith(' ')) line += ' ';
    }
    line += item.str;

    // Fall back to a rough width estimate when pdf.js reports none, so a missing
    // width cannot collapse every subsequent gap on the row.
    prevEnd = item.x + (item.w || item.str.length * lineHeight * 0.5);
  }

  return line.trimEnd();
}
