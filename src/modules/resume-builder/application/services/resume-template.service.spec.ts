// Tests for the read-only template catalogue.
//
// The REAL service and REAL repository run over an in-memory Prisma stand-in that
// genuinely evaluates the `where` clause — so "inactive templates are excluded" is
// answered by the query, not by the fake being helpful. Delete `isActive: true`
// from the repository and that test fails.
//
// Query-string coercion is exercised through the REAL ValidationPipe, because the
// interesting bug there (`Boolean('false') === true`) only shows up in transform.

import { BadRequestException, ValidationPipe } from '@nestjs/common';

import type { PrismaService } from '@infra/prisma/prisma.service';
import { ResumeTemplateRepository } from '../../infrastructure/repositories/resume-template.repository';
import { ResumeTemplateService } from './resume-template.service';
import {
  ListResumeTemplatesQueryDto,
  ResumeTemplateResponseDto,
} from '../dtos/resume-template.dto';

type Row = Record<string, any>;

const LAYOUT = { sections: ['header', 'experience'], rules: { columns: 1 } };

/** The three seeded templates, plus a retired one the picker must never see. */
function seedRows(): Row[] {
  return [
    {
      id: 't1',
      name: 'Classic ATS',
      category: 'ats-friendly',
      thumbnailUrl: '/templates/classic-ats.svg',
      isAtsFriendly: true,
      isActive: true,
      layoutConfig: LAYOUT,
    },
    {
      id: 't2',
      name: 'Modern Accent',
      category: 'modern',
      thumbnailUrl: '/templates/modern-accent.svg',
      isAtsFriendly: true,
      isActive: true,
      layoutConfig: LAYOUT,
    },
    {
      id: 't3',
      name: 'Compact Professional',
      category: 'modern',
      thumbnailUrl: '/templates/compact-professional.svg',
      isAtsFriendly: true,
      isActive: true,
      layoutConfig: LAYOUT,
    },
    // Retired: still referenced by old documents (FK is RESTRICT), invisible here.
    {
      id: 't4',
      name: 'Retired Creative',
      category: 'creative',
      thumbnailUrl: '/templates/retired.svg',
      isAtsFriendly: false,
      isActive: false,
      layoutConfig: LAYOUT,
    },
    // Active but NOT ats-friendly — the thing atsOnly must filter out.
    {
      id: 't5',
      name: 'Bold Creative',
      category: 'creative',
      thumbnailUrl: '/templates/bold-creative.svg',
      isAtsFriendly: false,
      isActive: true,
      layoutConfig: LAYOUT,
    },
  ];
}

function build(rows: Row[] = seedRows()) {
  const prisma = {
    resumeTemplate: {
      findMany: jest.fn(async (args: Row = {}) => {
        const where = args.where ?? {};
        let out = rows.filter((r) =>
          Object.entries(where).every(([k, v]) => r[k] === v),
        );
        if (Array.isArray(args.orderBy)) {
          out = [...out].sort((a, b) => {
            for (const term of args.orderBy) {
              const [field, dir] = Object.entries(term)[0] as [string, string];
              if (a[field] === b[field]) continue;
              const c = a[field] < b[field] ? -1 : 1;
              return dir === 'desc' ? -c : c;
            }
            return 0;
          });
        }
        return out.map((r) => ({ ...r }));
      }),
    },
  } as unknown as PrismaService;

  return { service: new ResumeTemplateService(new ResumeTemplateRepository(prisma)) };
}

describe('ResumeTemplateService — listing', () => {
  it('returns the seeded active templates', async () => {
    const { service } = build();

    const rows = await service.list({});

    expect(rows.map((r) => r.name)).toContain('Classic ATS');
    expect(rows.map((r) => r.name)).toContain('Modern Accent');
    expect(rows.map((r) => r.name)).toContain('Compact Professional');
  });

  it('EXCLUDES inactive templates', async () => {
    const { service } = build();

    const rows = await service.list({});

    // Retiring a template must hide it from selection everywhere, even though old
    // documents still reference it (the FK is RESTRICT, so the row survives).
    expect(rows.map((r) => r.name)).not.toContain('Retired Creative');
    expect(rows.every((r) => r.isActive)).toBe(true);
  });

  it('atsOnly=true narrows to ATS-friendly templates', async () => {
    const { service } = build();

    const rows = await service.list({ atsOnly: true });

    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.isAtsFriendly)).toBe(true);
    expect(rows.map((r) => r.name)).not.toContain('Bold Creative');
  });

  it('atsOnly=false means "do not filter", not "show the non-ATS ones"', async () => {
    const { service } = build();

    const rows = await service.list({ atsOnly: false });

    // The flag is a picker toggle, not a tri-state.
    expect(rows).toHaveLength(4); // all ACTIVE templates, ATS or not
    expect(rows.map((r) => r.name)).toContain('Bold Creative');
  });

  it('filters by category', async () => {
    const { service } = build();

    const rows = await service.list({ category: 'modern' });

    expect(rows.map((r) => r.name).sort()).toEqual([
      'Compact Professional',
      'Modern Accent',
    ]);
  });

  it('combines both filters', async () => {
    const { service } = build();

    const rows = await service.list({ atsOnly: true, category: 'creative' });

    // Bold Creative is active + creative but not ATS-friendly.
    expect(rows).toEqual([]);
  });

  it('returns an empty array for an unknown category rather than erroring', async () => {
    const { service } = build();

    await expect(service.list({ category: 'nope' })).resolves.toEqual([]);
  });

  it('orders by category then name, so the picker does not reshuffle', async () => {
    const { service } = build();

    const rows = await service.list({});

    expect(rows.map((r) => `${r.category}/${r.name}`)).toEqual([
      'ats-friendly/Classic ATS',
      'creative/Bold Creative',
      'modern/Compact Professional',
      'modern/Modern Accent',
    ]);
  });
});

describe('ResumeTemplateResponseDto', () => {
  it('exposes a non-empty thumbnailUrl for every result', async () => {
    const { service } = build();

    const dtos = (await service.list({})).map((r) => new ResumeTemplateResponseDto(r));

    expect(dtos.length).toBeGreaterThan(0);
    for (const dto of dtos) {
      expect(typeof dto.thumbnailUrl).toBe('string');
      expect(dto.thumbnailUrl!.length).toBeGreaterThan(0);
      // Root-relative path served by the frontend, not an absolute API URL.
      expect(dto.thumbnailUrl).toMatch(/^\/templates\/.+\.svg$/);
    }
  });

  it('carries layoutConfig so a client can preview section order', async () => {
    const { service } = build();

    const dto = new ResumeTemplateResponseDto((await service.list({}))[0]);

    expect(dto.layoutConfig).toMatchObject({ sections: expect.any(Array) });
  });

  it('does not leak isActive — every returned template is active by definition', async () => {
    const { service } = build();

    const dto = new ResumeTemplateResponseDto((await service.list({}))[0]);

    expect(dto).not.toHaveProperty('isActive');
  });
});

describe('ListResumeTemplatesQueryDto — query-string coercion', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const meta = { type: 'query' as const, metatype: ListResumeTemplatesQueryDto };

  it('coerces ?atsOnly=true to boolean true', async () => {
    await expect(pipe.transform({ atsOnly: 'true' }, meta)).resolves.toMatchObject({
      atsOnly: true,
    });
  });

  it('coerces ?atsOnly=false to boolean FALSE, not true', async () => {
    // The trap this guards: `Boolean('false')` is true, so naive @Type(() => Boolean)
    // would turn an explicit opt-out into an opt-in.
    const out = await pipe.transform({ atsOnly: 'false' }, meta);
    expect(out.atsOnly).toBe(false);
  });

  it('leaves atsOnly undefined when omitted', async () => {
    const out = await pipe.transform({}, meta);
    expect(out.atsOnly).toBeUndefined();
  });

  it('rejects a non-boolean atsOnly', async () => {
    await expect(pipe.transform({ atsOnly: 'maybe' }, meta)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('accepts a category string', async () => {
    await expect(
      pipe.transform({ category: 'modern' }, meta),
    ).resolves.toMatchObject({ category: 'modern' });
  });
});
