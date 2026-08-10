// src/modules/ingestion/html-to-text.ts
//
// Flatten a job posting's HTML into readable PLAIN TEXT, keeping the structure a reader
// needs: paragraphs, headings and bullet lists stay on their own lines.
//
// WHY THIS EXISTS. The previous one-liner replaced every tag with a single space and then
// collapsed all whitespace (`/\s+/g -> ' '`). That destroys every block boundary, so a
// posting with headings, paragraphs and three bullet lists arrives as ONE paragraph:
//
//   "…healthy conflict resolution Required Qualifications: 10+ years experience in
//    software/game development 6+ years in a production leadership position…"
//
// Measured: 43 of 43 ingested jobs had ZERO newlines in their description. The job detail
// page already renders with `whitespace-pre-line`, so the newlines were the only thing
// missing — the structure was thrown away at ingest, not at render.
//
// OUTPUT IS PLAIN TEXT, NEVER HTML. These postings come from third-party sources and are
// rendered as text by the client; emitting markup here would hand an untrusted source a
// path into the page.

/** Tags whose CONTENT is not prose and must not survive into the text. */
const DROP_CONTENT = /<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Closing tags that end a block — each becomes a paragraph break. */
const BLOCK_END =
  /<\/(p|div|section|article|header|footer|h[1-6]|ul|ol|table|tr|blockquote|pre)\s*>/gi;

/**
 * Named entities worth decoding. `&amp;` is deliberately LAST in the apply order below:
 * decoding it first would turn `&amp;lt;` into `<` and reintroduce markup.
 */
const ENTITIES: [RegExp, string][] = [
  [/&nbsp;/gi, ' '],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&apos;/gi, "'"],
  [/&#0*39;/g, "'"],
  [/&#0*34;/g, '"'],
  [/&rsquo;/gi, '’'],
  [/&lsquo;/gi, '‘'],
  [/&rdquo;/gi, '”'],
  [/&ldquo;/gi, '“'],
  [/&mdash;/gi, '—'],
  [/&ndash;/gi, '–'],
  [/&hellip;/gi, '…'],
  [/&bull;/gi, '•'],
  [/&amp;/gi, '&'],
];

/** Bullet used for list items. */
const BULLET = '• ';

export function htmlToText(html: string): string {
  if (!html) return '';

  let text = html.replace(DROP_CONTENT, ' ');

  // Structure first, while the tags are still there to read.
  text = text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, `\n${BULLET}`)
    // `</li>` adds NOTHING: the next `<li>` already opens a line, and emitting a newline
    // here too puts a blank line between every bullet.
    .replace(/<\/li\s*>/gi, '')
    .replace(BLOCK_END, '\n\n')
    // An opening block tag also separates: some sources never close their <p>.
    .replace(/<(p|div|h[1-6]|tr)\b[^>]*>/gi, '\n');

  // Everything else is inline formatting (<strong>, <a>, <em>…) — drop the tag, keep the
  // words, and do NOT insert a space: "<b>Java</b>Script" is one word.
  text = text.replace(/<[^>]*>/g, '');

  for (const [pattern, replacement] of ENTITIES) {
    text = text.replace(pattern, replacement);
  }

  return text
    // Collapse HORIZONTAL whitespace only — \s+ would eat the newlines just recovered.
    .replace(/[^\S\n]+/g, ' ')
    .split('\n')
    // Trim first, THEN drop a bullet left with no text (an empty <li>) — after trimming
    // it is a bare "•", not the "• " the bullet constant spells.
    .map((line) => line.trim())
    .map((line) => (line === BULLET.trim() ? '' : line))
    .join('\n')
    // At most one blank line between blocks.
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
