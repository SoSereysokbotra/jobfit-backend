// src/modules/resume-builder/application/services/resume-pdf.renderer.ts
//
// Renders a builder document to a PDF — and to plain text, in the SAME pass.
//
// WHY BOTH. Export writes ParsedResumeData directly instead of re-parsing the PDF
// (decision 2), and ResumeScorerService reads `parsed.rawText` for five of its
// sub-scores (formatting, keywords, length, grammar, keyword-quality) plus the AI
// scorer call. Emit only the structured fields and a résumé built on our own
// "ATS-friendly" template scores near zero on ATS formatting — the worst possible
// bug for this feature. Producing the text alongside the PDF, from one content
// pass, is what keeps the two from drifting.
//
// The text is shaped for that scorer on purpose: real bullet characters, one line
// per bullet, no runs of 3+ blank lines, and a length that lands in its 1500-6000
// character sweet spot for a normally-filled résumé.
//
// ATS-SAFETY. Single column, real selectable text, base-14 fonts (Helvetica /
// Times-Roman — always embedded, no font files needed in the container). No tables,
// no multi-column flow, no text inside images. Anything a parser cannot read
// defeats the point of the template.

import { Injectable } from '@nestjs/common';
// import-equals, not a default import: this tsconfig has esModuleInterop off, so
// `import PDFDocument from 'pdfkit'` compiles but is undefined at runtime
// ("pdfkit_1.default is not a constructor").
import PDFDocument = require('pdfkit');
import { ResumeLineSpacing, ResumeMargin } from '@prisma/client';

import { ResumeDocumentWithSections } from '../../infrastructure/repositories/resume-document.repository';

/** 72pt = 1 inch. Margin presets from the reference screenshot. */
const MARGIN_INCHES: Record<ResumeMargin, number> = {
  NARROW: 0.5,
  NORMAL: 0.75,
  WIDE: 1.0,
};

/** Line-height multipliers from the reference screenshot. */
const LINE_SPACING: Record<ResumeLineSpacing, number> = {
  SINGLE: 1.0,
  DEFAULT: 1.15,
  WIDE: 1.5,
};

/**
 * Preset key -> ink. Keys are the contract (validated in the DTO); these values are
 * the still-open content decision from Phase 0 §5-E and can change here freely — no
 * migration, because the column stores the key, not the colour.
 */
const PRESET_COLORS: Record<string, string> = {
  default: '#111111',
  navy: '#1B3A5C',
  forest: '#1F4D3A',
  burgundy: '#5C1B2B',
  slate: '#3A4450',
};

/**
 * Point sizes. Body sits at 11 rather than 10 because 10 reads cramped on screen
 * and in print, and 11 is still inside the 10–12pt band the app's own ATS guidance
 * recommends — parsers handle it, and it costs roughly 10% more vertical space.
 *
 * `lineGap` below is derived from BODY_SIZE, so line spacing scales with these
 * automatically; nothing else in the renderer hardcodes a size.
 */
const BODY_SIZE = 11;
const HEADING_SIZE = 13;
const NAME_SIZE = 22;

/** Serif only when the document explicitly asks; otherwise the ATS-safest default. */
function fontFamily(fontFamily: string | null): { regular: string; bold: string } {
  const serif = fontFamily?.toLowerCase().includes('times') ||
    fontFamily?.toLowerCase().includes('serif');
  return serif
    ? { regular: 'Times-Roman', bold: 'Times-Bold' }
    : { regular: 'Helvetica', bold: 'Helvetica-Bold' };
}

export interface RenderedResume {
  pdf: Buffer;
  /** Plain-text rendering of the same content — becomes ParsedResumeData.rawText. */
  text: string;
}

/** The section keys layoutConfig may order. Unknown keys are ignored. */
type SectionKey =
  | 'header'
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'projects';

const DEFAULT_SECTION_ORDER: SectionKey[] = [
  'header',
  'summary',
  'experience',
  'education',
  'skills',
  'certifications',
  'projects',
];

@Injectable()
export class ResumePdfRenderer {
  async render(
    document: ResumeDocumentWithSections,
    layoutConfig: unknown,
  ): Promise<RenderedResume> {
    const order = sectionOrder(layoutConfig);
    const rules = layoutRules(layoutConfig);
    const bullet = rules.bullet ?? '•';

    const fonts = fontFamily(document.fontFamily);
    const margin = MARGIN_INCHES[document.margin] * 72;
    const spacing = LINE_SPACING[document.lineSpacing];
    const accent = PRESET_COLORS[document.colorScheme] ?? PRESET_COLORS.default;

    // Real document metadata — some ATS readers surface it. Keys are omitted rather
    // than set to undefined: pdfkit writes the info dict verbatim and throws on an
    // undefined value, which a document with no name would otherwise hit.
    const info: Record<string, string> = { Title: document.title };
    if (document.fullName?.trim()) info.Author = document.fullName.trim();

    const pdf = new PDFDocument({
      size: 'LETTER',
      margins: { top: margin, bottom: margin, left: margin, right: margin },
      info,
    });

    const chunks: Buffer[] = [];
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      pdf.on('end', () => resolve(Buffer.concat(chunks)));
      pdf.on('error', reject);
    });

    // Plain-text mirror, built as we go.
    const lines: string[] = [];

    const lineGap = (BODY_SIZE * spacing) - BODY_SIZE;

    /** A section heading — skipped entirely when its section has no content. */
    const heading = (label: string) => {
      pdf.moveDown(0.6);
      pdf
        .font(fonts.bold)
        .fontSize(HEADING_SIZE)
        .fillColor(rules.accent === 'none' ? '#111111' : accent)
        .text(rules.headingStyle === 'uppercase-rule' ? label.toUpperCase() : label);

      if (rules.headingStyle === 'uppercase-rule' || rules.headingStyle === 'accent-bar') {
        const y = pdf.y + 2;
        pdf
          .moveTo(margin, y)
          .lineTo(pdf.page.width - margin, y)
          .lineWidth(rules.headingStyle === 'accent-bar' ? 1.5 : 0.5)
          .strokeColor(rules.accent === 'none' ? '#111111' : accent)
          .stroke();
        pdf.moveDown(0.4);
      }

      pdf.fillColor('#111111').font(fonts.regular).fontSize(BODY_SIZE);
      lines.push('', label.toUpperCase());
    };

    const body = (text: string, opts: { bold?: boolean } = {}) => {
      pdf
        .font(opts.bold ? fonts.bold : fonts.regular)
        .fontSize(BODY_SIZE)
        .fillColor('#111111')
        .text(text, { lineGap });
      lines.push(text);
    };

    const bulletLine = (text: string) => {
      pdf
        .font(fonts.regular)
        .fontSize(BODY_SIZE)
        .fillColor('#111111')
        .text(`${bullet} ${text}`, { lineGap, indent: 8 });
      // One bullet per line: scoreFormatting looks for bullet glyphs and counts
      // non-blank lines, and a wrapped paragraph would read as prose.
      lines.push(`${bullet} ${text}`);
    };

    for (const section of order) {
      switch (section) {
        case 'header':
          this.renderHeader(pdf, document, fonts, accent, lines);
          break;

        case 'summary': {
          const content = document.summary?.content?.trim();
          if (!content) break; // no blank heading for an empty section
          heading('Summary');
          body(content);
          break;
        }

        case 'experience': {
          if (document.experiences.length === 0) break;
          heading('Experience');
          for (const e of document.experiences) {
            const where = [e.company, e.location].filter(Boolean).join(' — ');
            body(`${e.title}, ${where}`, { bold: true });
            body(dateRange(e.startDate, e.endDate, e.isCurrentJob));
            if (e.description) bulletLine(e.description);
            if (e.technologies.length > 0) {
              body(`Technologies: ${e.technologies.join(', ')}`);
            }
            pdf.moveDown(0.3);
            lines.push('');
          }
          break;
        }

        case 'education': {
          if (document.educations.length === 0) break;
          heading('Education');
          for (const e of document.educations) {
            body(`${humanizeEnum(e.degreeLevel)}, ${e.fieldOfStudy}`, { bold: true });
            body(e.institution);
            body(dateRange(e.startDate, e.endDate, false));
            if (e.gpa != null) body(`GPA: ${e.gpa}`);
            if (e.description) bulletLine(e.description);
            pdf.moveDown(0.3);
            lines.push('');
          }
          break;
        }

        case 'skills': {
          if (document.skills.length === 0) break;
          heading('Skills');
          // One line, comma separated — the shape parsers extract most reliably.
          body(
            document.skills
              .map((s) =>
                s.proficiencyLevel
                  ? `${s.name} (${humanizeEnum(s.proficiencyLevel)})`
                  : s.name,
              )
              .join(', '),
          );
          break;
        }

        case 'certifications': {
          if (document.certifications.length === 0) break;
          heading('Certifications');
          for (const c of document.certifications) {
            body(`${c.name} — ${c.issuer}`, { bold: true });
            const when = c.expirationDate
              ? `${formatDate(c.issueDate)} – ${formatDate(c.expirationDate)}`
              : formatDate(c.issueDate);
            body(when);
            if (c.credentialId) body(`Credential ID: ${c.credentialId}`);
            pdf.moveDown(0.3);
            lines.push('');
          }
          break;
        }

        case 'projects': {
          if (document.projects.length === 0) break;
          heading('Projects');
          for (const p of document.projects) {
            body(p.name, { bold: true });
            if (p.description) bulletLine(p.description);
            if (p.technologies.length > 0) {
              body(`Technologies: ${p.technologies.join(', ')}`);
            }
            if (p.url) body(p.url);
            pdf.moveDown(0.3);
            lines.push('');
          }
          break;
        }
      }
    }

    pdf.end();
    const buffer = await done;

    return { pdf: buffer, text: normaliseText(lines) };
  }

  private renderHeader(
    pdf: PDFKit.PDFDocument,
    document: ResumeDocumentWithSections,
    fonts: { regular: string; bold: string },
    accent: string,
    lines: string[],
  ): void {
    const name = document.fullName?.trim();
    if (name) {
      pdf.font(fonts.bold).fontSize(NAME_SIZE).fillColor(accent).text(name);
      lines.push(name);
    }

    // Contact line: only the parts the user actually has.
    const contact = [
      document.email,
      document.phone,
      document.location,
      document.linkedinUrl,
      document.portfolioUrl,
    ]
      .map((v) => v?.trim())
      .filter((v): v is string => !!v);

    if (contact.length > 0) {
      pdf
        .font(fonts.regular)
        .fontSize(BODY_SIZE)
        .fillColor('#111111')
        .text(contact.join('  |  '));
      lines.push(contact.join(' | '));
    }
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────────

/** `layoutConfig.sections`, falling back to a sane order for a malformed config. */
function sectionOrder(layoutConfig: unknown): SectionKey[] {
  const sections = (layoutConfig as { sections?: unknown })?.sections;
  if (!Array.isArray(sections)) return DEFAULT_SECTION_ORDER;

  const valid = sections.filter((s): s is SectionKey =>
    DEFAULT_SECTION_ORDER.includes(s as SectionKey),
  );
  // A config that names nothing recognisable is a template authoring bug; render
  // the whole résumé rather than a blank page.
  return valid.length > 0 ? valid : DEFAULT_SECTION_ORDER;
}

function layoutRules(layoutConfig: unknown): {
  headingStyle?: string;
  bullet?: string;
  accent?: string;
} {
  const rules = (layoutConfig as { rules?: unknown })?.rules;
  return typeof rules === 'object' && rules !== null ? rules : {};
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function dateRange(start: Date, end: Date | null, isCurrent: boolean): string {
  const to = isCurrent ? 'Present' : end ? formatDate(end) : 'Present';
  return `${formatDate(start)} – ${to}`;
}

/** BACHELOR -> Bachelor, FULL_TIME -> Full Time. */
function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Collapse runs of blank lines to at most one and trim the ends.
 *
 * Not cosmetic: `scoreFormatting` penalises any run of 3+ newlines, so the text we
 * hand the scorer must not contain the gaps our per-section spacing naturally creates.
 */
function normaliseText(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
