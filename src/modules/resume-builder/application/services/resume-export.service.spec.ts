// Tests for the export pipeline.
//
// The renderer is REAL — pdfkit actually runs and produces actual PDF bytes, so
// "does this render" is answered rather than mocked. Storage and Prisma are
// in-memory stand-ins.
//
// The load-bearing assertion in here is the negative one: NO parsing job is ever
// enqueued (decision 2). The upload flow enqueues BullMQ 'resume-parsing'; export
// must not, because the document is already structured. A queue spy that is never
// called is the only way to hold that line.

import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';

import type { PrismaService } from '@infra/prisma/prisma.service';
import type { StorageService } from '@infra/storage/storage.service';
import { ResumeDocumentRepository } from '../../infrastructure/repositories/resume-document.repository';
import { ProfileContentRepository } from '../../infrastructure/repositories/profile-content.repository';
import { ResumeDocumentService } from './resume-document.service';
import { ResumeExportService } from './resume-export.service';
import { ResumePdfRenderer } from './resume-pdf.renderer';
import { ExportResumeDocumentDto } from '../dtos/export-resume-document.dto';

const ME = 'user-me';
const OTHER = 'user-other';
const TEMPLATE = 'tpl-active';

type Row = Record<string, any>;

const LAYOUT_CONFIG = {
  sections: [
    'header',
    'summary',
    'experience',
    'education',
    'skills',
    'certifications',
    'projects',
  ],
  rules: { columns: 1, headingStyle: 'uppercase-rule', bullet: '•', accent: 'none' },
};

/**
 * Minimal in-memory Prisma covering only what the export path touches.
 * `queue` is the spy that must never fire.
 */
function build(over: { uploadFails?: boolean } = {}) {
  const stores = {
    documents: new Map<string, Row>(),
    resumes: new Map<string, Row>(),
    parsed: new Map<string, Row>(),
    templates: new Map<string, Row>([
      [TEMPLATE, { id: TEMPLATE, isActive: true, layoutConfig: LAYOUT_CONFIG }],
    ]),
  };

  const queue = { addJob: jest.fn() };

  const tx = {
    resume: {
      create: jest.fn(async (args: Row) => {
        const { parsedData, ...resume } = args.data;
        stores.resumes.set(resume.id, { ...resume, deletedAt: null });
        if (parsedData?.create) {
          stores.parsed.set(resume.id, { resumeId: resume.id, ...parsedData.create });
        }
        return resume;
      }),
      update: jest.fn(async (args: Row) => {
        const row = stores.resumes.get(args.where.id);
        if (!row) throw new Error('resume not found');
        Object.assign(row, args.data);
        return row;
      }),
    },
    resumeDocument: {
      update: jest.fn(async (args: Row) => {
        const row = stores.documents.get(args.where.id);
        if (!row) throw new Error('document not found');
        Object.assign(row, args.data);
        return row;
      }),
    },
  };

  const prisma = {
    resumeTemplate: {
      findUnique: jest.fn(async (args: Row) => stores.templates.get(args.where.id) ?? null),
    },
    resumeDocument: {
      findFirst: jest.fn(async (args: Row) => {
        const row = [...stores.documents.values()].find(
          (r) =>
            r.id === args.where.id &&
            r.userId === args.where.userId &&
            r.deletedAt === null,
        );
        return row ? { ...row } : null;
      }),
    },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  } as unknown as PrismaService;

  const storage = {
    upload: jest.fn(async () => {
      if (over.uploadFails) throw new Error('storage is down');
      // The real one returns a PUBLIC url; the service must NOT use it.
      return 'https://public.example/not-usable';
    }),
    getSignedUrl: jest.fn(async (_b: string, path: string) => `https://signed/${path}`),
  } as unknown as StorageService;

  const documents = new ResumeDocumentService(
    new ResumeDocumentRepository(prisma),
    new ProfileContentRepository(prisma),
    prisma,
  );

  const service = new ResumeExportService(
    documents,
    new ResumeDocumentRepository(prisma),
    new ResumePdfRenderer(),
    storage,
    prisma,
  );

  return { service, stores, storage, queue, tx };
}

/** A fully populated document, as findOwnedWithSections would return it. */
function seedDocument(stores: ReturnType<typeof build>['stores'], over: Row = {}) {
  const doc: Row = {
    id: 'doc-1',
    userId: ME,
    title: 'Frontend Engineer — Google',
    templateId: TEMPLATE,
    colorScheme: 'navy',
    lineSpacing: 'DEFAULT',
    margin: 'NORMAL',
    fontFamily: null,
    status: 'DRAFT',
    exportedResumeId: null,
    fullName: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+855 12 345 678',
    location: 'Phnom Penh, Cambodia',
    linkedinUrl: 'https://linkedin.com/in/ada',
    portfolioUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    summary: { content: 'Engineer with a decade of experience building web platforms.' },
    experiences: [
      {
        id: 'e1',
        order: 0,
        company: 'Acme',
        title: 'Senior Engineer',
        location: 'Remote',
        startDate: new Date('2020-01-01'),
        endDate: null,
        isCurrentJob: true,
        description: 'Led the platform team and shipped the billing rewrite.',
        technologies: ['TypeScript', 'Postgres'],
      },
    ],
    educations: [
      {
        id: 'd1',
        order: 0,
        institution: 'MIT',
        degreeLevel: 'BACHELOR',
        fieldOfStudy: 'Computer Science',
        startDate: new Date('2012-09-01'),
        endDate: new Date('2016-06-01'),
        gpa: 3.8,
        description: null,
      },
    ],
    skills: [
      { id: 's1', order: 0, name: 'TypeScript', proficiencyLevel: 'EXPERT' },
      { id: 's2', order: 1, name: 'Go', proficiencyLevel: null },
    ],
    certifications: [
      {
        id: 'c1',
        order: 0,
        name: 'AWS Solutions Architect',
        issuer: 'Amazon',
        issueDate: new Date('2022-03-01'),
        expirationDate: null,
        credentialId: 'ABC-123',
        credentialUrl: null,
      },
    ],
    projects: [
      {
        id: 'p1',
        order: 0,
        name: 'Portfolio',
        description: 'Static site generator.',
        technologies: ['Astro'],
        url: 'https://ada.dev',
      },
    ],
    ...over,
  };
  stores.documents.set(doc.id, doc);
  return doc;
}

/** An empty document — every section blank. */
function seedEmptyDocument(stores: ReturnType<typeof build>['stores']) {
  return seedDocument(stores, {
    id: 'doc-empty',
    fullName: null,
    email: null,
    phone: null,
    location: null,
    linkedinUrl: null,
    portfolioUrl: null,
    summary: null,
    experiences: [],
    educations: [],
    skills: [],
    certifications: [],
    projects: [],
  });
}

describe('ResumeExportService — produces a real PDF', () => {
  it('renders a non-empty PDF and uploads it as application/pdf', async () => {
    const { service, stores, storage } = build();
    seedDocument(stores);

    const result = await service.export('doc-1', ME);

    const [bucket, path, buffer, contentType] = (storage.upload as jest.Mock).mock
      .calls[0];
    expect(bucket).toBe('resumes');
    expect(contentType).toBe('application/pdf');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // A real PDF starts with %PDF- and ends with the EOF marker.
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.toString('latin1')).toContain('%%EOF');

    expect(result.fileSize).toBe(buffer.length);
    expect(result.fileName).toBe('frontend-engineer-google.pdf');
    // Deterministic path, matching ResumeService's convention.
    expect(path).toBe(`${ME}/${result.resumeId}/frontend-engineer-google.pdf`);
  });

  it('returns a SIGNED url, never the public one upload() returns', async () => {
    const { service, stores, storage } = build();
    seedDocument(stores);

    const result = await service.export('doc-1', ME);

    expect(storage.getSignedUrl).toHaveBeenCalledWith(
      'resumes',
      `${ME}/${result.resumeId}/frontend-engineer-google.pdf`,
    );
    expect(result.downloadUrl).toContain('https://signed/');
    // The bucket is private — the public URL would not resolve.
    expect(result.downloadUrl).not.toContain('public.example');
  });
});

describe('ResumeExportService — the Resume row', () => {
  it('creates a Resume with all four required file columns', async () => {
    const { service, stores } = build();
    seedDocument(stores);

    const result = await service.export('doc-1', ME);

    const resume = stores.resumes.get(result.resumeId)!;
    expect(resume.fileName).toBe('frontend-engineer-google.pdf');
    expect(resume.fileUrl).toBeTruthy();
    expect(resume.fileSize).toBeGreaterThan(0);
    expect(resume.fileType).toBe('PDF');
    expect(resume.userId).toBe(ME);
    // There is no `source` column on Resume — nothing should have invented one.
    expect(resume.source).toBeUndefined();
  });

  it('links the document back to the new résumé', async () => {
    const { service, stores } = build();
    seedDocument(stores);

    const result = await service.export('doc-1', ME);

    expect(stores.documents.get('doc-1')!.exportedResumeId).toBe(result.resumeId);
  });
});

describe('ResumeExportService — writes ParsedResumeData directly, never re-parses', () => {
  it('NEVER enqueues a parsing job', async () => {
    const { service, stores, queue } = build();
    seedDocument(stores);

    await service.export('doc-1', ME);

    // The whole point of decision 2. Re-parsing a PDF we just generated would cost
    // an AI call, need Redis, and could only degrade data we authored.
    expect(queue.addJob).not.toHaveBeenCalled();
  });

  it('files the résumé as already parsed', async () => {
    const { service, stores } = build();
    seedDocument(stores);

    const result = await service.export('doc-1', ME);

    expect(stores.resumes.get(result.resumeId)!.parsingStatus).toBe('SUCCESS');
    expect(stores.parsed.get(result.resumeId)!.parsedBy).toBe('resume-builder');
  });

  it('maps the header and summary onto ParsedResumeData', async () => {
    const { service, stores } = build();
    seedDocument(stores);

    const result = await service.export('doc-1', ME);

    const parsed = stores.parsed.get(result.resumeId)!;
    expect(parsed.fullName).toBe('Ada Lovelace');
    expect(parsed.email).toBe('ada@example.com');
    expect(parsed.phone).toBe('+855 12 345 678');
    expect(parsed.location).toBe('Phnom Penh, Cambodia');
    expect(parsed.summary).toContain('Engineer with a decade');
  });

  it('stores the section columns as JSON STRINGS, not objects', async () => {
    const { service, stores } = build();
    seedDocument(stores);

    const result = await service.export('doc-1', ME);
    const parsed = stores.parsed.get(result.resumeId)!;

    for (const column of ['experiences', 'educations', 'skills', 'certifications']) {
      expect(typeof parsed[column]).toBe('string');
      expect(Array.isArray(JSON.parse(parsed[column]))).toBe(true);
    }
    expect(JSON.parse(parsed.experiences)[0].company).toBe('Acme');
    expect(JSON.parse(parsed.skills)).toHaveLength(2);
    // Null for MVP — there is no profile-side project data contract yet.
    expect(parsed.projects).toBeNull();
  });

  it('populates rawText — without it the ATS scorer reads a blank résumé', async () => {
    const { service, stores } = build();
    seedDocument(stores);

    const result = await service.export('doc-1', ME);
    const rawText: string = stores.parsed.get(result.resumeId)!.rawText;

    expect(typeof rawText).toBe('string');
    expect(rawText.length).toBeGreaterThan(0);
    // The scorer's inputs: contact details, section headings, real content.
    expect(rawText).toContain('Ada Lovelace');
    expect(rawText).toContain('EXPERIENCE');
    expect(rawText).toContain('Acme');
    expect(rawText).toContain('TypeScript');
    // scoreFormatting looks for bullet glyphs...
    expect(rawText).toContain('•');
    // ...and penalises runs of 3+ newlines.
    expect(rawText).not.toMatch(/\n{3,}/);
    // scoreFormatting also wants >= 10 non-blank lines.
    expect(rawText.split('\n').filter((l) => l.trim()).length).toBeGreaterThanOrEqual(10);
  });
});

describe('ResumeExportService — re-export supersedes the previous résumé', () => {
  it('soft-deletes the prior résumé and repoints the link', async () => {
    const { service, stores } = build();
    seedDocument(stores);

    const first = await service.export('doc-1', ME);
    const second = await service.export('doc-1', ME);

    expect(second.resumeId).not.toBe(first.resumeId);
    // Soft, not hard: Application.resume is onDelete SetNull, so hard-deleting
    // would strip the résumé off applications already submitted with it.
    expect(stores.resumes.get(first.resumeId)!.deletedAt).toBeInstanceOf(Date);
    expect(stores.resumes.has(first.resumeId)).toBe(true);
    expect(stores.resumes.get(second.resumeId)!.deletedAt).toBeNull();
    expect(stores.documents.get('doc-1')!.exportedResumeId).toBe(second.resumeId);
  });

  it('leaves exactly one live résumé per document after repeated exports', async () => {
    const { service, stores } = build();
    seedDocument(stores);

    await service.export('doc-1', ME);
    await service.export('doc-1', ME);
    await service.export('doc-1', ME);

    const live = [...stores.resumes.values()].filter((r) => r.deletedAt === null);
    expect(live).toHaveLength(1);
  });
});

describe('ResumeExportService — empty and awkward documents', () => {
  it('renders a document with every section empty without crashing', async () => {
    const { service, stores, storage } = build();
    seedEmptyDocument(stores);

    const result = await service.export('doc-empty', ME);

    const buffer = (storage.upload as jest.Mock).mock.calls[0][2];
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.fileSize).toBeGreaterThan(0);
  });

  it('skips empty sections rather than printing blank headings', async () => {
    const { service, stores } = build();
    seedEmptyDocument(stores);

    const result = await service.export('doc-empty', ME);
    const rawText: string = stores.parsed.get(result.resumeId)!.rawText;

    expect(rawText).not.toContain('EXPERIENCE');
    expect(rawText).not.toContain('EDUCATION');
    expect(rawText).not.toContain('SKILLS');
    expect(rawText).not.toContain('PROJECTS');
  });

  it('still produces a usable filename when the title has no usable characters', async () => {
    const { service, stores } = build();
    seedDocument(stores, { id: 'doc-odd', title: '—— ///' });

    const result = await service.export('doc-odd', ME);

    expect(result.fileName).toBe('resume.pdf');
  });
});

describe('ResumeExportService — failure handling', () => {
  it('creates nothing when rendering throws', async () => {
    const { service, stores, storage } = build();
    seedDocument(stores);
    // A template whose layoutConfig getter explodes mid-render.
    jest
      .spyOn(ResumePdfRenderer.prototype, 'render')
      .mockRejectedValueOnce(new Error('render exploded'));

    await expect(service.export('doc-1', ME)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    // Nothing uploaded, no Resume row, no changed link.
    expect(storage.upload).not.toHaveBeenCalled();
    expect(stores.resumes.size).toBe(0);
    expect(stores.parsed.size).toBe(0);
    expect(stores.documents.get('doc-1')!.exportedResumeId).toBeNull();
  });

  it('creates no Resume row when the upload fails', async () => {
    const { service, stores } = build({ uploadFails: true });
    seedDocument(stores);

    await expect(service.export('doc-1', ME)).rejects.toThrow('storage is down');

    expect(stores.resumes.size).toBe(0);
    expect(stores.documents.get('doc-1')!.exportedResumeId).toBeNull();
  });

  it('refuses to export a document the caller does not own', async () => {
    const { service, stores, storage } = build();
    seedDocument(stores);

    await expect(service.export('doc-1', OTHER)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

// ── Format validation (decision 6: PDF-only for MVP) ───────────────────────────
// Exercised through the REAL ValidationPipe the app runs globally, so this asserts
// what an actual request would get rather than what the decorators look like.

describe('ExportResumeDocumentDto — format validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const meta = {
    type: 'body' as const,
    metatype: ExportResumeDocumentDto,
  };

  it('accepts "pdf"', async () => {
    await expect(pipe.transform({ format: 'pdf' }, meta)).resolves.toMatchObject({
      format: 'pdf',
    });
  });

  it('defaults to "pdf" when omitted', async () => {
    await expect(pipe.transform({}, meta)).resolves.toMatchObject({ format: 'pdf' });
  });

  it('REJECTS "docx" at validation rather than 501-ing later', async () => {
    // The API must not advertise a format it cannot produce. A 501 would arrive
    // after the client has already committed to the request.
    await expect(pipe.transform({ format: 'docx' }, meta)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('names the supported formats in the error', async () => {
    try {
      await pipe.transform({ format: 'docx' }, meta);
      throw new Error('expected a validation failure');
    } catch (err) {
      const response = (err as BadRequestException).getResponse() as {
        message: string[];
      };
      expect(response.message.join(' ')).toContain('pdf');
      expect(response.message.join(' ')).toMatch(/DOCX export is not available yet/i);
    }
  });

  it('rejects any other nonsense value', async () => {
    await expect(pipe.transform({ format: 'html' }, meta)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
