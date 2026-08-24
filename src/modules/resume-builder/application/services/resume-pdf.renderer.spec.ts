// src/modules/resume-builder/application/services/resume-pdf.renderer.spec.ts
//
// Two rendering defects the frontend session found by comparing the exported PDF
// against the live preview:
//
//   1. The section-heading divider was drawn only for headingStyle 'uppercase-rule'
//      or 'accent-bar'. The seeded "Compact Professional" template uses 'small-caps'
//      (prisma/seed.ts), which matched neither — so it exported with NO dividers at
//      all. "Classic ATS" drew one, but at 0.5pt in near-black, which is effectively
//      invisible at fit-width zoom.
//   2. Body text rendered at 11pt; 12pt is the top of the same ATS-safe 10-12pt band.
//
// HOW THESE ASSERT. Against the real PDF bytes, not against spies on the renderer's
// own calls. pdfkit Flate-compresses its content stream, so the helper below inflates
// it and reads the PDF operators directly: `w` for line width, `m`/`l`/`S` for the
// stroked divider, `Tf` for the font size actually selected. A spy would pass just as
// happily if the operators never reached the page.

import * as zlib from 'zlib';
import { ResumeLineSpacing, ResumeMargin } from '@prisma/client';
import { ResumePdfRenderer } from './resume-pdf.renderer';
import { ResumeDocumentWithSections } from '../../infrastructure/repositories/resume-document.repository';

// ── PDF content-stream reading ──────────────────────────────────────────────────

/** Inflate every stream object in the PDF and concatenate the operator text. */
function contentStream(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const out: string[] = [];
  const marker = /stream\r?\n/g;
  let m: RegExpExecArray | null;

  while ((m = marker.exec(raw)) !== null) {
    const start = Buffer.byteLength(raw.slice(0, m.index + m[0].length), 'latin1');
    const endIdx = raw.indexOf('endstream', m.index);
    if (endIdx < 0) continue;
    const end = Buffer.byteLength(raw.slice(0, endIdx), 'latin1');
    const slice = pdf.subarray(start, end);
    try {
      out.push(zlib.inflateSync(slice).toString('latin1'));
    } catch {
      // Not Flate-compressed (or not a content stream) — read it as-is.
      out.push(slice.toString('latin1'));
    }
  }
  return out.join('\n');
}

/**
 * Every stroked horizontal rule, with its line width.
 *
 * Matches what pdfkit actually emits for `moveTo().lineTo().lineWidth().stroke()`:
 *
 *     54 123.4 m
 *     558 123.4 l
 *     0.75 w
 *     /DeviceRGB CS            <- only when the stroke colour changed
 *     0.1 0.22 0.36 SCN
 *     S
 *
 * The colour pair is optional because pdfkit omits it when that colour is already
 * current. Nothing else in this renderer draws a path, so an `m`/`l` pair is a section
 * divider and only ever that.
 */
function dividers(content: string): { count: number; widths: number[] } {
  const matches = [
    ...content.matchAll(
      /[\d.]+ [\d.]+ m\n[\d.]+ [\d.]+ l\n([\d.]+) w\n(?:\/DeviceRGB CS\n[\d. ]+ SCN\n)?S/g,
    ),
  ];
  return { count: matches.length, widths: matches.map((x) => Number(x[1])) };
}

/** Font sizes selected via `Tf`, deduped. */
function fontSizes(content: string): number[] {
  return [
    ...new Set([...content.matchAll(/\/F\d+\s+([\d.]+)\s+Tf/g)].map((x) => Number(x[1]))),
  ].sort((a, b) => a - b);
}

// ── fixture ─────────────────────────────────────────────────────────────────────

const doc = (): ResumeDocumentWithSections =>
  ({
    id: 'd1',
    userId: 'u1',
    title: 'My Résumé',
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    phone: '+855 12 345 678',
    location: 'Phnom Penh',
    linkedinUrl: null,
    portfolioUrl: null,
    fontFamily: null,
    margin: 'NORMAL' as ResumeMargin,
    lineSpacing: 'DEFAULT' as ResumeLineSpacing,
    colorScheme: 'navy',
    summary: { content: 'Backend engineer with six years of experience.' },
    experiences: [
      {
        title: 'Senior Engineer',
        company: 'Acme',
        location: 'Phnom Penh',
        startDate: new Date('2022-01-01'),
        endDate: null,
        isCurrentJob: true,
        description: 'Led the payments rewrite.',
        technologies: ['TypeScript', 'Postgres'],
      },
    ],
    educations: [],
    skills: [{ name: 'TypeScript', proficiencyLevel: null }],
    certifications: [],
    projects: [],
  }) as unknown as ResumeDocumentWithSections;

/** layoutConfig exactly as prisma/seed.ts writes it for each seeded template. */
const SEEDED = {
  classicAts: {
    sections: ['header', 'summary', 'experience', 'skills'],
    rules: { columns: 1, headingStyle: 'uppercase-rule', bullet: '•', accent: 'none' },
  },
  modernAccent: {
    sections: ['header', 'summary', 'experience', 'skills'],
    rules: {
      columns: 1,
      headingStyle: 'accent-bar',
      bullet: '▸',
      accent: 'colorScheme',
    },
  },
  compactProfessional: {
    sections: ['header', 'summary', 'experience', 'skills'],
    rules: {
      columns: 1,
      headingStyle: 'small-caps',
      bullet: '–',
      accent: 'heading-only',
    },
  },
};

describe('ResumePdfRenderer', () => {
  const renderer = new ResumePdfRenderer();
  const render = async (layoutConfig: unknown) =>
    contentStream((await renderer.render(doc(), layoutConfig)).pdf);

  // ── 1. Section dividers ───────────────────────────────────────────────────────
  describe('section dividers', () => {
    it('draws dividers for small-caps — the bug: "Compact Professional" had none', async () => {
      const content = await render(SEEDED.compactProfessional);

      // Three headings in this fixture: Summary, Experience, Skills.
      expect(dividers(content).count).toBe(3);
    });

    it.each([
      ['Classic ATS', SEEDED.classicAts],
      ['Modern Accent', SEEDED.modernAccent],
      ['Compact Professional', SEEDED.compactProfessional],
    ])('draws a divider under every heading — %s', async (_name, config) => {
      expect(dividers(await render(config)).count).toBe(3);
    });

    it('draws dividers for an unknown heading style too', async () => {
      // The defect was that an unrecognised style silently removed a structural
      // element. A style nobody has implemented yet must still get separators.
      const content = await render({
        sections: ['header', 'summary', 'experience', 'skills'],
        rules: { headingStyle: 'something-nobody-wrote-yet' },
      });

      expect(dividers(content).count).toBe(3);
    });

    it('draws dividers when layoutConfig has no rules at all', async () => {
      expect(dividers(await render({})).count).toBe(3);
    });

    it('makes the Classic ATS rule visible — thicker than the old 0.5pt hairline', async () => {
      const { widths } = dividers(await render(SEEDED.classicAts));

      expect(widths.length).toBeGreaterThan(0);
      for (const w of widths) {
        // 0.5pt in near-black is effectively invisible at fit-width zoom, which is
        // what made this template look like it had no dividers either.
        expect(w).toBeGreaterThanOrEqual(0.75);
      }
    });

    it('keeps the accent-bar heavier than the plain rule — it is that template’s identity', async () => {
      const bar = dividers(await render(SEEDED.modernAccent)).widths[0];
      const plain = dividers(await render(SEEDED.compactProfessional)).widths[0];

      expect(bar).toBe(1.5);
      expect(bar).toBeGreaterThan(plain);
    });
  });

  // ── 2. Type sizes ─────────────────────────────────────────────────────────────
  describe('type sizes', () => {
    it('renders body text at 12pt', async () => {
      const sizes = fontSizes(await render(SEEDED.compactProfessional));

      expect(sizes).toContain(12);
      // The old value must be gone, not merely accompanied.
      expect(sizes).not.toContain(11);
    });

    it('stays inside the 10-12pt ATS-safe band for body copy', async () => {
      const sizes = fontSizes(await render(SEEDED.classicAts));
      const body = Math.min(...sizes);

      // The guarantee this renderer makes is "body copy is inside 10-12".
      expect(body).toBeGreaterThanOrEqual(10);
      expect(body).toBeLessThanOrEqual(12);
    });

    it('keeps the hierarchy name > heading > body', async () => {
      const sizes = fontSizes(await render(SEEDED.classicAts));

      expect(sizes).toEqual([12, 14, 24]);
    });
  });

  // ── the text mirror must not drift ────────────────────────────────────────────
  it('still emits the plain-text mirror the résumé scorer reads', async () => {
    const { text } = await renderer.render(doc(), SEEDED.compactProfessional);

    expect(text).toContain('Jane Doe');
    expect(text).toContain('SUMMARY');
    expect(text).toContain('EXPERIENCE');
    // scoreFormatting penalises runs of 3+ newlines.
    expect(text).not.toMatch(/\n{3,}/);
  });
});
