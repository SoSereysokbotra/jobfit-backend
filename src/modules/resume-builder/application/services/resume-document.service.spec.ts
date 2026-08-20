// Integration tests for builder document CRUD and the content sections.
//
// The REAL service and REAL repository run over an in-memory Prisma stand-in that
// genuinely honours the `where` clause — including `userId` and `deletedAt`. That
// fidelity is the point: a fake that ignored `where` would let the cross-user tests
// pass even if the ownership term were deleted from the repository. Here, removing
// it makes them fail.

import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { PrismaService } from '@infra/prisma/prisma.service';
import { ResumeDocumentRepository } from '../../infrastructure/repositories/resume-document.repository';
import { ProfileContentRepository } from '../../infrastructure/repositories/profile-content.repository';
import { ResumeDocumentService } from './resume-document.service';
import { DEFAULT_COLOR_PRESET } from '../dtos/color-presets';
import { ResumeDocumentDetailDto } from '../dtos/resume-document-response.dto';

const ME = 'user-me';
const OTHER = 'user-other';
const TEMPLATE = 'tpl-active';
const RETIRED_TEMPLATE = 'tpl-retired';

type Row = Record<string, any>;

// ── In-memory Prisma ────────────────────────────────────────────────────────────

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (cond === null) return row[key] === null || row[key] === undefined;
    if (cond !== null && typeof cond === 'object' && 'in' in cond) {
      return (cond.in as unknown[]).includes(row[key]);
    }
    return row[key] === cond;
  });
}

/** A table honouring the subset of the Prisma API this module actually uses. */
function table(store: Map<string, Row>, name: string) {
  let seq = 0;

  // Declared before `api` so `upsert` can reuse it without the object referring to
  // itself inside its own initializer (which defeats type inference).
  const createRow = async (data: Row): Promise<Row> => {
    seq += 1;
    const row: Row = { id: data.id ?? `${name}-${seq}`, ...data };
    row.createdAt ??= new Date();
    row.updatedAt ??= new Date();
    row.deletedAt ??= null;
    store.set(row.id, row);
    return { ...row };
  };

  const api = {
    findMany: jest.fn(async (args: Row = {}) => {
      const rows = [...store.values()].filter((r) => matches(r, args.where));
      if (args.orderBy) {
        // Supports both `{ field: 'asc' }` and one level of relation ordering,
        // e.g. `{ skill: { name: 'asc' } }` as used by the skills import.
        const [field, spec] = Object.entries(args.orderBy)[0] as [string, unknown];
        const nested = typeof spec === 'object' && spec !== null;
        const [subField, dir] = nested
          ? (Object.entries(spec as Row)[0] as [string, string])
          : [null, spec as string];
        rows.sort((a, b) => {
          const x = nested ? a[field]?.[subField!] : a[field];
          const y = nested ? b[field]?.[subField!] : b[field];
          const c = x === y ? 0 : x < y ? -1 : 1;
          return dir === 'desc' ? -c : c;
        });
      }
      return rows.map((r) => ({ ...r }));
    }),
    findFirst: jest.fn(async (args: Row = {}) => {
      const row = [...store.values()].find((r) => matches(r, args.where));
      return row ? { ...row } : null;
    }),
    findUnique: jest.fn(async (args: Row = {}) => {
      const row = [...store.values()].find((r) => matches(r, args.where));
      return row ? { ...row } : null;
    }),
    create: jest.fn(async (args: Row) => createRow(args.data)),
    createMany: jest.fn(async (args: Row) => {
      for (const data of args.data) {
        seq += 1;
        const row = { id: `${name}-${seq}`, createdAt: new Date(), updatedAt: new Date(), ...data };
        store.set(row.id, row);
      }
      return { count: args.data.length };
    }),
    update: jest.fn(async (args: Row) => {
      const row = [...store.values()].find((r) => matches(r, args.where));
      if (!row) throw new Error('record not found');
      Object.assign(row, args.data);
      return { ...row };
    }),
    upsert: jest.fn(async (args: Row): Promise<Row> => {
      const row = [...store.values()].find((r) => matches(r, args.where));
      if (row) { Object.assign(row, args.update); return { ...row }; }
      return createRow(args.create);
    }),
    deleteMany: jest.fn(async (args: Row = {}) => {
      let count = 0;
      for (const [k, v] of store) {
        if (matches(v, args.where)) { store.delete(k); count += 1; }
      }
      return { count };
    }),
  };
  return api;
}

function build() {
  const stores = {
    documents: new Map<string, Row>(),
    summaries: new Map<string, Row>(),
    experiences: new Map<string, Row>(),
    educations: new Map<string, Row>(),
    skills: new Map<string, Row>(),
    certifications: new Map<string, Row>(),
    projects: new Map<string, Row>(),
    templates: new Map<string, Row>(),
    users: new Map<string, Row>(),
    // Profile-side content the import reads. These are the REAL tables
    // (Experience/Education/Certification/UserSkill/Profile), separate from the
    // document's own copies — which is exactly what the isolation tests check.
    profiles: new Map<string, Row>(),
    profileExperiences: new Map<string, Row>(),
    profileEducations: new Map<string, Row>(),
    profileUserSkills: new Map<string, Row>(),
    profileCertifications: new Map<string, Row>(),
  };

  stores.templates.set(TEMPLATE, { id: TEMPLATE, isActive: true });
  stores.templates.set(RETIRED_TEMPLATE, { id: RETIRED_TEMPLATE, isActive: false });

  const documentTable = table(stores.documents, 'doc');

  const prisma = {
    resumeDocument: documentTable,
    resumeDocumentSummary: table(stores.summaries, 'sum'),
    resumeDocumentExperience: table(stores.experiences, 'exp'),
    resumeDocumentEducation: table(stores.educations, 'edu'),
    resumeDocumentSkill: table(stores.skills, 'skl'),
    resumeDocumentCertification: table(stores.certifications, 'crt'),
    resumeDocumentProject: table(stores.projects, 'prj'),
    resumeTemplate: table(stores.templates, 'tpl'),
    user: table(stores.users, 'usr'),
    profile: table(stores.profiles, 'prf'),
    experience: table(stores.profileExperiences, 'pexp'),
    education: table(stores.profileEducations, 'pedu'),
    userSkill: table(stores.profileUserSkills, 'pskl'),
    certification: table(stores.profileCertifications, 'pcrt'),
    // The repository builds arrays of PrismaPromises; here they are already
    // in-flight promises, so awaiting them all is a faithful enough transaction
    // for these tests (no partial-failure rollback is asserted).
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (tx: unknown) => unknown)(prisma)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;

  // findOwnedWithSections uses `include`; the generic table ignores it, so wrap it.
  const rawFindFirst = documentTable.findFirst;
  documentTable.findFirst = jest.fn(async (args: Row = {}) => {
    const row = await rawFindFirst(args);
    if (!row || !args.include) return row;
    const of = (m: Map<string, Row>) =>
      [...m.values()]
        .filter((r) => r.resumeDocumentId === row.id)
        .sort((a, b) => a.order - b.order);
    return {
      ...row,
      summary: [...stores.summaries.values()].find((s) => s.resumeDocumentId === row.id) ?? null,
      experiences: of(stores.experiences),
      educations: of(stores.educations),
      skills: of(stores.skills),
      certifications: of(stores.certifications),
      projects: of(stores.projects),
    };
  }) as never;

  const repo = new ResumeDocumentRepository(prisma);
  const profileContent = new ProfileContentRepository(prisma);
  const service = new ResumeDocumentService(repo, profileContent, prisma);
  return { service, stores };
}

/**
 * A user with a filled-in profile.
 *
 * Written twice on purpose: the header snapshot reads it as a nested relation off
 * `user`, while import-from-profile reads the `profile` table directly. Both code
 * paths are real, so the fake has to back both.
 */
function seedUser(stores: ReturnType<typeof build>['stores'], id: string, over: Row = {}) {
  const profile = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: '+855 12 345 678',
    city: 'Phnom Penh',
    state: null,
    country: 'Cambodia',
    linkedinUrl: 'https://linkedin.com/in/ada',
    portfolioUrl: null,
    bio: null,
    headline: null,
    ...over,
  };
  stores.users.set(id, { id, email: `${id}@example.com`, profile });
  stores.profiles.set(id, { id: `profile-${id}`, userId: id, deletedAt: null, ...profile });
}

/** Add a row to one of the REAL profile-side tables the import reads. */
function seedProfileRow(
  store: Map<string, Row>,
  id: string,
  row: Row,
): void {
  store.set(id, { id, deletedAt: null, ...row });
}

const newDoc = { title: 'Frontend Engineer — Google', templateId: TEMPLATE };

/**
 * What the client actually receives. `service.get` returns the raw row (summary is
 * a row, not a string); the DTO is the contract, so assert through it.
 */
async function detail(
  service: ResumeDocumentService,
  id: string,
  userId: string,
): Promise<ResumeDocumentDetailDto> {
  return new ResumeDocumentDetailDto(await service.get(id, userId));
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('ResumeDocumentService — create', () => {
  it('creates a draft with sensible defaults', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);

    const doc = await service.create(ME, newDoc);

    expect(doc.title).toBe('Frontend Engineer — Google');
    expect(doc.colorScheme).toBe(DEFAULT_COLOR_PRESET);
    expect(doc.lineSpacing).toBe('DEFAULT');
    expect(doc.margin).toBe('NORMAL');
  });

  it('snapshots the résumé header from the profile', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);

    const doc = await service.create(ME, newDoc);

    expect(doc.fullName).toBe('Ada Lovelace');
    expect(doc.email).toBe('user-me@example.com');
    expect(doc.phone).toBe('+855 12 345 678');
    expect(doc.location).toBe('Phnom Penh, Cambodia'); // null state skipped
    expect(doc.linkedinUrl).toBe('https://linkedin.com/in/ada');
    expect(doc.portfolioUrl).toBeNull();
  });

  it('still creates a usable document when the user has no profile', async () => {
    const { service, stores } = build();
    stores.users.set(ME, { id: ME, email: 'nop@example.com', profile: null });

    const doc = await service.create(ME, newDoc);

    expect(doc.id).toBeDefined();
    expect(doc.fullName).toBeNull();
    expect(doc.location).toBeNull();
    expect(doc.email).toBe('nop@example.com'); // email comes from User, not Profile
  });

  it('rejects an unknown or retired template', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);

    await expect(
      service.create(ME, { ...newDoc, templateId: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create(ME, { ...newDoc, templateId: RETIRED_TEMPLATE }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ResumeDocumentService — header is a snapshot, not a live link', () => {
  it('editing the document header does not touch the profile', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    await service.update(doc.id, ME, { fullName: 'A. Lovelace', phone: '+1 555 0100' });

    const profile = stores.users.get(ME)!.profile;
    expect(profile.firstName).toBe('Ada');
    expect(profile.phone).toBe('+855 12 345 678'); // untouched
  });

  it('editing the profile afterwards does not change an existing document', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    // The user later moves and renames themselves on their master profile.
    const profile = stores.users.get(ME)!.profile;
    profile.firstName = 'Augusta';
    profile.city = 'London';
    profile.country = 'UK';

    const reloaded = await service.get(doc.id, ME);
    expect(reloaded.fullName).toBe('Ada Lovelace');
    expect(reloaded.location).toBe('Phnom Penh, Cambodia');
  });
});

describe('ResumeDocumentService — ownership (404, never 403)', () => {
  it('list returns only the caller’s own documents', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedUser(stores, OTHER);
    await service.create(ME, { ...newDoc, title: 'mine' });
    await service.create(OTHER, { ...newDoc, title: 'theirs' });

    const rows = await service.list(ME);

    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('mine');
  });

  // The critical one: delete the userId term from the repository and these fail.
  it.each([
    ['get', (s: any, id: string) => s.get(id, OTHER)],
    ['update', (s: any, id: string) => s.update(id, OTHER, { title: 'hijacked' })],
    ['remove', (s: any, id: string) => s.remove(id, OTHER)],
    ['duplicate', (s: any, id: string) => s.duplicate(id, OTHER)],
    ['putSummary', (s: any, id: string) => s.putSummary(id, OTHER, { content: 'x' })],
    ['putExperience', (s: any, id: string) => s.putExperience(id, OTHER, { items: [] })],
  ])('%s on another user’s document is a 404', async (_name, call) => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    await expect(call(service, doc.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not leak the other user’s data through a failed write', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    await expect(
      service.update(doc.id, OTHER, { title: 'hijacked' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const mine = await service.get(doc.id, ME);
    expect(mine.title).toBe('Frontend Engineer — Google'); // unchanged
  });

  it('a soft-deleted document is a 404 afterwards', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    await service.remove(doc.id, ME);

    await expect(service.get(doc.id, ME)).rejects.toBeInstanceOf(NotFoundException);
    expect(await service.list(ME)).toHaveLength(0);
    // Soft, not hard — the row is still there with a tombstone.
    expect(stores.documents.get(doc.id)!.deletedAt).toBeInstanceOf(Date);
  });
});

describe('ResumeDocumentService — content sections replace, not append', () => {
  it('putting a shorter array removes the extra rows', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    await service.putSkills(doc.id, ME, {
      items: [{ name: 'TypeScript' }, { name: 'React' }, { name: 'Go' }],
    });
    expect(stores.skills.size).toBe(3);

    await service.putSkills(doc.id, ME, { items: [{ name: 'Rust' }] });

    expect(stores.skills.size).toBe(1);
    const reloaded = await service.get(doc.id, ME);
    expect(reloaded.skills.map((s) => s.name)).toEqual(['Rust']);
  });

  it('sets `order` from array index', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    await service.putSkills(doc.id, ME, {
      items: [{ name: 'first' }, { name: 'second' }, { name: 'third' }],
    });

    const reloaded = await service.get(doc.id, ME);
    expect(reloaded.skills.map((s) => [s.name, s.order])).toEqual([
      ['first', 0],
      ['second', 1],
      ['third', 2],
    ]);
  });

  it('an empty array clears the section', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    await service.putProjects(doc.id, ME, { items: [{ name: 'Portfolio' }] });
    await service.putProjects(doc.id, ME, { items: [] });

    expect(stores.projects.size).toBe(0);
    expect((await service.get(doc.id, ME)).projects).toEqual([]);
  });

  it('summary is 1:1 — replacing overwrites rather than adding a row', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    await service.putSummary(doc.id, ME, { content: 'first draft' });
    await service.putSummary(doc.id, ME, { content: 'second draft' });

    expect(stores.summaries.size).toBe(1);
    expect((await detail(service, doc.id, ME)).summary).toBe('second draft');
  });

  it('one section PUT does not disturb the others', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    await service.putSkills(doc.id, ME, { items: [{ name: 'Go' }] });
    await service.putProjects(doc.id, ME, { items: [{ name: 'Portfolio' }] });
    await service.putSkills(doc.id, ME, { items: [{ name: 'Rust' }, { name: 'Zig' }] });

    const reloaded = await service.get(doc.id, ME);
    expect(reloaded.skills).toHaveLength(2);
    expect(reloaded.projects.map((p) => p.name)).toEqual(['Portfolio']);
  });
});

describe('ResumeDocumentService — get returns the full nested document', () => {
  it('returns settings plus all six sections in one call', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    await service.putSummary(doc.id, ME, { content: 'Engineer' });
    await service.putExperience(doc.id, ME, {
      items: [{ company: 'Acme', title: 'Dev', startDate: new Date('2020-01-01') }],
    });
    await service.putEducation(doc.id, ME, {
      items: [{
        institution: 'MIT', degreeLevel: 'BACHELOR', fieldOfStudy: 'CS',
        startDate: new Date('2016-01-01'),
      }],
    });
    await service.putSkills(doc.id, ME, { items: [{ name: 'Go' }] });
    await service.putCertifications(doc.id, ME, {
      items: [{ name: 'AWS SA', issuer: 'Amazon', issueDate: new Date('2022-01-01') }],
    });
    await service.putProjects(doc.id, ME, { items: [{ name: 'Portfolio' }] });

    const full = await detail(service, doc.id, ME);

    expect(full.summary).toBe('Engineer');
    expect(full.experiences).toHaveLength(1);
    expect(full.educations).toHaveLength(1);
    expect(full.skills).toHaveLength(1);
    expect(full.certifications).toHaveLength(1);
    expect(full.projects).toHaveLength(1);
  });

  it('a brand-new document reports empty sections, not nulls', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    const full = await detail(service, doc.id, ME);

    expect(full.summary).toBe(''); // no row yet -> empty string, never null
    expect(full.experiences).toEqual([]);
    expect(full.skills).toEqual([]);
  });
});

describe('ResumeDocumentService — duplicate', () => {
  it('deep-copies settings, header and every content row', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, { ...newDoc, colorScheme: 'navy' });
    await service.putSummary(doc.id, ME, { content: 'Engineer' });
    await service.putSkills(doc.id, ME, { items: [{ name: 'Go' }, { name: 'Rust' }] });
    await service.putProjects(doc.id, ME, { items: [{ name: 'Portfolio' }] });

    const copy = await service.duplicate(doc.id, ME);

    expect(copy.id).not.toBe(doc.id);
    expect(copy.title).toBe('Frontend Engineer — Google (Copy)');
    expect(copy.colorScheme).toBe('navy');
    expect(copy.fullName).toBe('Ada Lovelace');

    const full = await detail(service, copy.id, ME);
    expect(full.summary).toBe('Engineer');
    expect(full.skills.map((s) => s.name)).toEqual(['Go', 'Rust']);
    expect(full.projects.map((p) => p.name)).toEqual(['Portfolio']);
  });

  it('resets status to DRAFT and does not carry the export link', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);
    // Pretend the original was finalised and exported.
    stores.documents.get(doc.id)!.status = 'FINALIZED';
    stores.documents.get(doc.id)!.exportedResumeId = 'resume-123';

    const copy = await service.duplicate(doc.id, ME);

    expect(copy.status).toBe('DRAFT');
    // Two documents pointing at one résumé would make re-export soft-delete a file
    // the original still owns.
    expect(copy.exportedResumeId).toBeNull();
  });

  it('the copy is independent — editing it leaves the original alone', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);
    await service.putSkills(doc.id, ME, { items: [{ name: 'Go' }] });

    const copy = await service.duplicate(doc.id, ME);
    await service.putSkills(copy.id, ME, { items: [{ name: 'Rust' }, { name: 'Zig' }] });

    expect((await service.get(doc.id, ME)).skills.map((s) => s.name)).toEqual(['Go']);
    expect((await service.get(copy.id, ME)).skills).toHaveLength(2);
  });
});

describe('ResumeDocumentService — update', () => {
  it('patches only the fields provided', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    const updated = await service.update(doc.id, ME, { margin: 'WIDE' });

    expect(updated.margin).toBe('WIDE');
    expect(updated.lineSpacing).toBe('DEFAULT'); // untouched
    expect(updated.title).toBe('Frontend Engineer — Google');
  });

  it('refuses a switch to a retired template', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    const doc = await service.create(ME, newDoc);

    await expect(
      service.update(doc.id, ME, { templateId: RETIRED_TEMPLATE }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ── Import from profile (Phase 4) ───────────────────────────────────────────────

describe('ResumeDocumentService — import from profile', () => {
  /** A user with content on their REAL profile tables. */
  function seedProfileContent(stores: ReturnType<typeof build>['stores']) {
    ['a', 'b', 'c'].forEach((k, i) =>
      seedProfileRow(stores.profileExperiences, `exp-${k}`, {
        userId: ME,
        company: `Company ${k.toUpperCase()}`,
        title: `Engineer ${k.toUpperCase()}`,
        startDate: new Date(`202${i}-01-01`),
        endDate: null,
        isCurrentJob: i === 2,
        description: null,
        technologies: ['TypeScript'],
      }),
    );

    seedProfileRow(stores.profileEducations, 'edu-a', {
      userId: ME,
      institution: 'MIT',
      degreeLevel: 'BACHELOR',
      fieldOfStudy: 'Computer Science',
      startDate: new Date('2016-01-01'),
      endDate: new Date('2020-01-01'),
      gpa: 3.8,
      description: null,
    });

    seedProfileRow(stores.profileUserSkills, 'us-a', {
      userId: ME,
      proficiencyLevel: 'EXPERT',
      skill: { name: 'TypeScript' },
    });
    seedProfileRow(stores.profileUserSkills, 'us-b', {
      userId: ME,
      proficiencyLevel: 'INTERMEDIATE',
      skill: { name: 'Go' },
    });

    seedProfileRow(stores.profileCertifications, 'cert-a', {
      userId: ME,
      name: 'AWS Solutions Architect',
      issuer: 'Amazon',
      issueDate: new Date('2022-01-01'),
      expirationDate: null,
      credentialId: 'ABC-123',
      credentialUrl: null,
    });
  }

  it('imports 3 profile experiences as 3 rows on the document', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedProfileContent(stores);
    const doc = await service.create(ME, newDoc);

    await service.importFromProfile(doc.id, ME, { sections: ['experience'] });

    const full = await detail(service, doc.id, ME);
    expect(full.experiences).toHaveLength(3);
    expect(full.experiences.map((e) => e.company).sort()).toEqual([
      'Company A',
      'Company B',
      'Company C',
    ]);
    // `order` is assigned from import order, so the section renders as-is.
    expect(full.experiences.map((e) => e.order)).toEqual([0, 1, 2]);
  });

  it('leaves the document location empty — Experience has no location column', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedProfileContent(stores);
    const doc = await service.create(ME, newDoc);

    await service.importFromProfile(doc.id, ME, { sections: ['experience'] });

    const full = await detail(service, doc.id, ME);
    expect(full.experiences.every((e) => e.location === undefined)).toBe(true);
  });

  it('maps education and certification fields to the right columns', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedProfileContent(stores);
    const doc = await service.create(ME, newDoc);

    await service.importFromProfile(doc.id, ME, {
      sections: ['education', 'certifications'],
    });

    const full = await detail(service, doc.id, ME);
    // startDate/endDate, not graduationDate; degreeLevel/fieldOfStudy, not degree/field.
    expect(full.educations[0]).toMatchObject({
      institution: 'MIT',
      degreeLevel: 'BACHELOR',
      fieldOfStudy: 'Computer Science',
      gpa: 3.8,
    });
    expect(full.educations[0].startDate).toBeInstanceOf(Date);
    // issuer/issueDate, not organization/issuedDate.
    expect(full.certifications[0]).toMatchObject({
      name: 'AWS Solutions Architect',
      issuer: 'Amazon',
      credentialId: 'ABC-123',
    });
  });

  it('joins UserSkill -> Skill for the display name', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedProfileContent(stores);
    const doc = await service.create(ME, newDoc);

    await service.importFromProfile(doc.id, ME, { sections: ['skills'] });

    const full = await detail(service, doc.id, ME);
    // Alphabetical by skill name.
    expect(full.skills.map((s) => s.name)).toEqual(['Go', 'TypeScript']);
    expect(full.skills.map((s) => s.proficiencyLevel)).toEqual([
      'INTERMEDIATE',
      'EXPERT',
    ]);
  });

  it('excludes soft-deleted profile rows', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedProfileContent(stores);
    // The user deleted one job from their profile — it must not resurface here.
    stores.profileExperiences.get('exp-b')!.deletedAt = new Date();
    const doc = await service.create(ME, newDoc);

    await service.importFromProfile(doc.id, ME, { sections: ['experience'] });

    const full = await detail(service, doc.id, ME);
    expect(full.experiences).toHaveLength(2);
    expect(full.experiences.map((e) => e.company)).not.toContain('Company B');
  });

  it('imports an empty section when the user has no profile data — not an error', async () => {
    const { service, stores } = build();
    seedUser(stores, ME); // profile exists, but no experience/education/etc rows
    const doc = await service.create(ME, newDoc);

    await expect(
      service.importFromProfile(doc.id, ME, {
        sections: ['experience', 'education', 'skills', 'certifications'],
      }),
    ).resolves.toBeDefined();

    const full = await detail(service, doc.id, ME);
    expect(full.experiences).toEqual([]);
    expect(full.educations).toEqual([]);
    expect(full.skills).toEqual([]);
    expect(full.certifications).toEqual([]);
  });

  it('replaces rather than appends — importing twice does not duplicate', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedProfileContent(stores);
    const doc = await service.create(ME, newDoc);

    await service.importFromProfile(doc.id, ME, { sections: ['experience'] });
    await service.importFromProfile(doc.id, ME, { sections: ['experience'] });

    expect((await detail(service, doc.id, ME)).experiences).toHaveLength(3);
  });

  it('replaces whatever the user had typed in that section', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedProfileContent(stores);
    const doc = await service.create(ME, newDoc);
    await service.putSkills(doc.id, ME, { items: [{ name: 'Hand-typed' }] });

    await service.importFromProfile(doc.id, ME, { sections: ['skills'] });

    const full = await detail(service, doc.id, ME);
    expect(full.skills.map((s) => s.name)).toEqual(['Go', 'TypeScript']);
  });

  it('leaves sections that were not named untouched', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedProfileContent(stores);
    const doc = await service.create(ME, newDoc);
    await service.putProjects(doc.id, ME, { items: [{ name: 'My Project' }] });

    await service.importFromProfile(doc.id, ME, { sections: ['experience'] });

    const full = await detail(service, doc.id, ME);
    expect(full.projects.map((p) => p.name)).toEqual(['My Project']);
  });

  it('does not touch template, settings or the snapshotted header', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedProfileContent(stores);
    const doc = await service.create(ME, { ...newDoc, colorScheme: 'navy' });
    await service.update(doc.id, ME, { fullName: 'Hand-edited Name', margin: 'WIDE' });

    await service.importFromProfile(doc.id, ME, {
      sections: ['experience', 'skills'],
    });

    const full = await detail(service, doc.id, ME);
    expect(full.fullName).toBe('Hand-edited Name'); // header untouched
    expect(full.colorScheme).toBe('navy');
    expect(full.margin).toBe('WIDE');
    expect(full.templateId).toBe(TEMPLATE);
  });

  it('is a one-time copy — editing the document does not touch the profile', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedProfileContent(stores);
    const doc = await service.create(ME, newDoc);
    await service.importFromProfile(doc.id, ME, { sections: ['experience'] });

    await service.putExperience(doc.id, ME, {
      items: [
        { company: 'Rewritten', title: 'Tailored', startDate: new Date('2021-01-01') },
      ],
    });

    // The user's real profile history is unchanged.
    expect(stores.profileExperiences.size).toBe(3);
    expect(
      [...stores.profileExperiences.values()].map((e) => e.company).sort(),
    ).toEqual(['Company A', 'Company B', 'Company C']);
  });

  it('is a one-time copy — later profile edits do not change the document', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedProfileContent(stores);
    const doc = await service.create(ME, newDoc);
    await service.importFromProfile(doc.id, ME, { sections: ['experience'] });

    // The user later renames one job and deletes another on their master profile.
    stores.profileExperiences.get('exp-a')!.company = 'Renamed Later';
    stores.profileExperiences.get('exp-c')!.deletedAt = new Date();

    const full = await detail(service, doc.id, ME);
    expect(full.experiences).toHaveLength(3);
    expect(full.experiences.map((e) => e.company)).toContain('Company A');
    expect(full.experiences.map((e) => e.company)).not.toContain('Renamed Later');
  });

  describe('summary', () => {
    it('imports Profile.bio when present', async () => {
      const { service, stores } = build();
      seedUser(stores, ME, { bio: 'Seasoned engineer.', headline: 'Senior Dev' });
      const doc = await service.create(ME, newDoc);

      await service.importFromProfile(doc.id, ME, { sections: ['summary'] });

      expect((await detail(service, doc.id, ME)).summary).toBe('Seasoned engineer.');
    });

    it('falls back to headline when bio is blank', async () => {
      const { service, stores } = build();
      seedUser(stores, ME, { bio: '   ', headline: 'Senior Software Engineer' });
      const doc = await service.create(ME, newDoc);

      await service.importFromProfile(doc.id, ME, { sections: ['summary'] });

      expect((await detail(service, doc.id, ME)).summary).toBe(
        'Senior Software Engineer',
      );
    });

    it('yields an empty summary when both are empty — success, not an error', async () => {
      const { service, stores } = build();
      seedUser(stores, ME, { bio: null, headline: null });
      const doc = await service.create(ME, newDoc);

      await expect(
        service.importFromProfile(doc.id, ME, { sections: ['summary'] }),
      ).resolves.toBeDefined();

      expect((await detail(service, doc.id, ME)).summary).toBe('');
    });

    it('overwrites the single summary row rather than adding one', async () => {
      const { service, stores } = build();
      seedUser(stores, ME, { bio: 'From profile.' });
      const doc = await service.create(ME, newDoc);
      await service.putSummary(doc.id, ME, { content: 'Hand-written.' });

      await service.importFromProfile(doc.id, ME, { sections: ['summary'] });

      expect(stores.summaries.size).toBe(1);
      expect((await detail(service, doc.id, ME)).summary).toBe('From profile.');
    });
  });

  it('cannot be triggered on a document the caller does not own', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedUser(stores, OTHER);
    seedProfileContent(stores);
    const doc = await service.create(ME, newDoc);

    await expect(
      service.importFromProfile(doc.id, OTHER, { sections: ['experience'] }),
    ).rejects.toBeInstanceOf(NotFoundException);

    // And nothing was written to the victim's document.
    expect((await detail(service, doc.id, ME)).experiences).toEqual([]);
  });

  it('only imports the caller own profile rows, never another user rows', async () => {
    const { service, stores } = build();
    seedUser(stores, ME);
    seedUser(stores, OTHER);
    seedProfileRow(stores.profileExperiences, 'theirs', {
      userId: OTHER,
      company: 'Their Company',
      title: 'Their Role',
      startDate: new Date('2020-01-01'),
      endDate: null,
      isCurrentJob: false,
      description: null,
      technologies: [],
    });
    const doc = await service.create(ME, newDoc);

    await service.importFromProfile(doc.id, ME, { sections: ['experience'] });

    expect((await detail(service, doc.id, ME)).experiences).toEqual([]);
  });
});
