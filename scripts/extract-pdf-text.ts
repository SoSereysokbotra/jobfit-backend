/**
 * Print the text a PDF résumé yields in reading order — exactly what the AI service
 * receives from ResumeParserService, with no model in the loop.
 *
 * This is the debugging tool for "why did the parse get that wrong?". If a field is
 * missing or mangled here, the extractor is at fault and no amount of model or prompt
 * work will fix it. If it looks right here, the problem is downstream.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/extract-pdf-text.ts <path-to.pdf>
 */

import { readFileSync } from 'fs';
import {
  PositionedTextItem,
  toReadingOrder,
} from '../src/modules/resume/application/services/pdf-reading-order';

interface PdfJsModule {
  getDocument(src: {
    data: Uint8Array;
    useSystemFonts?: boolean;
    isEvalSupported?: boolean;
  }): { promise: Promise<PdfDocument> };
}
interface PdfDocument {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: PositionedTextItem[] }>;
  }>;
  destroy(): Promise<void>;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: extract-pdf-text.ts <path-to.pdf>');
    process.exit(1);
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as PdfJsModule;

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(readFileSync(file)),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  try {
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      pages.push(toReadingOrder(content.items));
    }
    const text = pages.join('\n');
    const lines = text.split('\n');

    console.log(`# ${file}`);
    console.log(`# ${doc.numPages} page(s), ${lines.length} lines\n`);
    lines.forEach((l, i) => console.log(`${String(i + 1).padStart(3)} | ${l}`));
  } finally {
    await doc.destroy();
  }
}

void main().catch((err: Error) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
