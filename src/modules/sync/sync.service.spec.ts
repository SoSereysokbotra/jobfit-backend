// Integration tests for delta sync.
//
// These run the REAL repositories, the REAL delta helper and the REAL SyncService over an
// in-memory Prisma stand-in that genuinely evaluates the `where` clause it is given —
// AND/OR nesting, `gt` comparisons, equality, ordering and `take` included.
//
// That fidelity is the point. A fake that ignored `where` would make the cross-user
// isolation test pass even if the userId term were deleted from deltaWhere(). Here,
// removing it makes that test fail — which is the only way the test is worth writing.

import type { PrismaService } from '@infra/prisma/prisma.service';
import { ApplicationRepository } from '@modules/application/infrastructure/repositories/application.repository';
import { ExperienceRepository } from '@modules/user/infrastructure/repositories/experience.repository';
import { EducationRepository } from '@modules/user/infrastructure/repositories/education.repository';
import { UserSkillRepository } from '@modules/user/infrastructure/repositories/user-skill.repository';
import { ProfileRepository } from '@modules/user/infrastructure/repositories/profile.repository';
import { SavedJobRepository } from '@modules/saved-job/infrastructure/repositories/saved-job.repository';
import { SyncService } from './sync.service';

const ME = 'user-me';
const OTHER = 'user-other';

const T0 = new Date('2026-08-01T00:00:00.000Z'); // before `since`
const SINCE = new Date('2026-08-05T00:00:00.000Z');
const T2 = new Date('2026-08-09T00:00:00.000Z'); // after `since`
const T3 = new Date('2026-08-10T00:00:00.000Z'); // after `since`, later

// ── In-memory Prisma ────────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;

  return Object.entries(where).every(([key, cond]) => {
    if (key === 'AND') return (cond as Row[]).every((c) => matches(row, c));
    if (key === 'OR') return (cond as Row[]).some((c) => matches(row, c));
    return matchesField(row[key], cond);
  });
}

function matchesField(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return asTime(value) === cond.getTime();

  if (cond !== null && typeof cond === 'object') {
    return Object.entries(cond as Row).every(([op, operand]) => {
      switch (op) {
        case 'gt':
          return compare(value, operand) > 0;
        case 'lt':
          return compare(value, operand) < 0;
        case 'equals':
          return compare(value, operand) === 0;
        case 'not':
          return compare(value, operand) !== 0;
        default:
          throw new Error(`fake prisma: unsupported operator ${op}`);
      }
    });
  }

  return value === cond;
}

function asTime(v: unknown): number | undefined {
  return v instanceof Date ? v.getTime() : undefined;
}

function compare(a: unknown, b: unknown): number {
  if (a instanceof Date || b instanceof Date) {
    const x = asTime(a) ?? -Infinity;
    const y = asTime(b) ?? -Infinity;
    return x === y ? 0 : x < y ? -1 : 1;
  }
  if (a === b) return 0;
  return (a as string) < (b as string) ? -1 : 1;
}

function sortRows(rows: Row[], orderBy: Row | Row[] | undefined): Row[] {
  if (!orderBy) return rows;
  const terms = Array.isArray(orderBy) ? orderBy : [orderBy];

  return [...rows].sort((a, b) => {
    for (const term of terms) {
      const [field, dir] = Object.entries(term)[0];
      const c = compare(a[field], b[field]);
      if (c !== 0) return dir === 'desc' ? -c : c;
    }
    return 0;
  });
}

/** A table supporting the subset of the Prisma API the sync path actually uses. */
function table(rows: Row[]) {
  return {
    findMany: jest.fn(async (args: Row = {}) => {
      const filtered = rows.filter((r) => matches(r, args.where as Row));
      const sorted = sortRows(filtered, args.orderBy as Row[]);
      return typeof args.take === 'number' ? sorted.slice(0, args.take) : sorted;
    }),
  };
}

function build(seed: {
  applications?: Row[];
  experiences?: Row[];
  educations?: Row[];
  userSkills?: Row[];
  profiles?: Row[];
  certifications?: Row[];
  recommendations?: Row[];
  savedJobs?: Row[];
}) {
  const prisma = {
    application: table(seed.applications ?? []),
    experience: table(seed.experiences ?? []),
    education: table(seed.educations ?? []),
    userSkill: table(seed.userSkills ?? []),
    profile: table(seed.profiles ?? []),
    certification: table(seed.certifications ?? []),
    recommendation: table(seed.recommendations ?? []),
    savedJob: table(seed.savedJobs ?? []),
  } as unknown as PrismaService;

  return new SyncService(
    prisma,
    new ApplicationRepository(prisma),
    new ProfileRepository(prisma),
    new ExperienceRepository(prisma),
    new EducationRepository(prisma),
    new UserSkillRepository(prisma),
    new SavedJobRepository(prisma),
  );
}

// ── Row builders ────────────────────────────────────────────────────────────────

function application(over: Partial<Row> = {}): Row {
  return {
    id: 'app-1',
    userId: ME,
    jobId: 'job-1',
    resumeId: null,
    status: 'SUBMITTED',
    appliedAt: T2,
    notes: null,
    coverLetter: null,
    archivedByCandidateAt: null,
    createdAt: T0,
    updatedAt: T2,
    deletedAt: null,
    ...over,
  };
}

function experience(over: Partial<Row> = {}): Row {
  return {
    id: 'exp-1',
    userId: ME,
    company: 'Acme',
    title: 'Engineer',
    jobLevel: 'MID',
    employmentType: 'FULL_TIME',
    industry: 'Software',
    description: null,
    isCurrentJob: false,
    startDate: T0,
    endDate: null,
    technologies: [],
    createdAt: T0,
    updatedAt: T2,
    deletedAt: null,
    ...over,
  };
}

function recommendation(over: Partial<Row> = {}): Row {
  return {
    id: 'rec-1',
    userId: ME,
    jobId: 'job-1',
    score: 88.4,
    reasonExplanation: 'matches your skills',
    breakdown: null,
    createdAt: T0,
    updatedAt: T2,
    job: {
      id: 'job-1',
      companyId: 'co-1',
      company: { name: 'Acme' },
      title: 'Engineer',
      description: 'desc',
      status: 'PUBLISHED',
      remoteType: 'REMOTE',
      location: null,
      minSalary: null,
      maxSalary: null,
      skills: [],
      createdAt: T0,
      updatedAt: T2,
    },
    ...over,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────────

describe('SyncService — delta semantics', () => {
  it('includes a row updated AFTER since in upserts', async () => {
    const sync = build({ applications: [application({ updatedAt: T2 })] });

    const res = await sync.syncApplications(ME, { since: SINCE.toISOString() });

    expect(res.upserts).toHaveLength(1);
    expect(res.upserts[0].id).toBe('app-1');
    expect(res.deletes).toEqual([]);
  });

  it('excludes a row updated BEFORE since', async () => {
    const sync = build({ applications: [application({ updatedAt: T0 })] });

    const res = await sync.syncApplications(ME, { since: SINCE.toISOString() });

    expect(res.upserts).toEqual([]);
    expect(res.deletes).toEqual([]);
  });

  it('reports a soft-deleted row in deletes, never in upserts', async () => {
    const sync = build({
      applications: [
        application({ id: 'app-live', updatedAt: T2 }),
        application({ id: 'app-gone', updatedAt: T3, deletedAt: T3 }),
      ],
    });

    const res = await sync.syncApplications(ME, { since: SINCE.toISOString() });

    expect(res.deletes).toEqual(['app-gone']);
    expect(res.upserts.map((u) => u.id)).toEqual(['app-live']);
  });

  it('returns everything when since is omitted (initial full sync)', async () => {
    const sync = build({
      applications: [
        application({ id: 'old', updatedAt: T0 }),
        application({ id: 'new', updatedAt: T3 }),
      ],
    });

    const res = await sync.syncApplications(ME, {});

    expect(res.upserts.map((u) => u.id).sort()).toEqual(['new', 'old']);
    expect(res.since).toBeNull();
  });

  it('echoes since and stamps a serverTime for the next watermark', async () => {
    const sync = build({ applications: [] });

    const res = await sync.syncApplications(ME, { since: SINCE.toISOString() });

    expect(res.since).toBe(SINCE.toISOString());
    expect(new Date(res.serverTime).getTime()).toBeGreaterThan(T3.getTime());
  });

  it('applies the same rules to the profile bundle', async () => {
    const sync = build({
      experiences: [
        experience({ id: 'exp-old', updatedAt: T0 }),
        experience({ id: 'exp-new', updatedAt: T2 }),
        experience({ id: 'exp-gone', updatedAt: T3, deletedAt: T3 }),
      ],
    });

    const res = await sync.syncExperiences(ME, { since: SINCE.toISOString() });

    expect(res.upserts.map((u) => u.id)).toEqual(['exp-new']);
    expect(res.deletes).toEqual(['exp-gone']);
  });
});

describe('SyncService — cross-user isolation', () => {
  // The critical one. If the userId term were dropped from deltaWhere(), every
  // assertion below would fail rather than silently leaking.
  it('never returns another user’s applications', async () => {
    const sync = build({
      applications: [
        application({ id: 'mine', userId: ME, updatedAt: T2 }),
        application({ id: 'theirs', userId: OTHER, updatedAt: T2 }),
      ],
    });

    const res = await sync.syncApplications(ME, { since: SINCE.toISOString() });

    expect(res.upserts.map((u) => u.id)).toEqual(['mine']);
    expect(res.upserts.every((u) => u.userId === ME)).toBe(true);
  });

  it('never leaks another user’s soft-deleted ids as tombstones', async () => {
    // A tombstone is still an id. Leaking one tells an attacker a row existed.
    const sync = build({
      applications: [
        application({ id: 'theirs-gone', userId: OTHER, updatedAt: T3, deletedAt: T3 }),
      ],
    });

    const res = await sync.syncApplications(ME, { since: SINCE.toISOString() });

    expect(res.deletes).toEqual([]);
    expect(res.upserts).toEqual([]);
  });

  it('never returns another user’s profile data', async () => {
    const sync = build({
      experiences: [
        experience({ id: 'theirs', userId: OTHER, updatedAt: T2 }),
        experience({ id: 'mine', userId: ME, updatedAt: T2 }),
      ],
    });

    const res = await sync.syncExperiences(ME, { since: SINCE.toISOString() });

    expect(res.upserts.map((u) => u.id)).toEqual(['mine']);
  });

  it('never returns another user’s recommendations or saved jobs', async () => {
    const sync = build({
      recommendations: [
        recommendation({ id: 'rec-mine', userId: ME }),
        recommendation({ id: 'rec-theirs', userId: OTHER }),
      ],
      savedJobs: [
        { id: 'sj-mine', userId: ME, jobId: 'job-a', createdAt: T2 },
        { id: 'sj-theirs', userId: OTHER, jobId: 'job-b', createdAt: T2 },
      ],
    });

    const recs = await sync.syncRecommendations(ME, {});
    const saved = await sync.syncSavedJobs(ME, {});

    expect(recs.upserts.map((r) => r.id)).toEqual(['job-1']); // the job of MY recommendation
    expect(saved.upserts.map((s) => s.jobId)).toEqual(['job-a']);
  });

  it('scopes the whole bootstrap snapshot to the caller', async () => {
    const sync = build({
      applications: [
        application({ id: 'mine', userId: ME }),
        application({ id: 'theirs', userId: OTHER }),
      ],
      experiences: [experience({ id: 'exp-theirs', userId: OTHER })],
      savedJobs: [{ id: 'sj-theirs', userId: OTHER, jobId: 'job-x', createdAt: T2 }],
    });

    const boot = await sync.bootstrap(ME);

    expect(boot.resources.applications.upserts.map((a) => a.id)).toEqual(['mine']);
    expect(boot.resources.experiences.upserts).toEqual([]);
    expect(boot.resources.savedJobs.upserts).toEqual([]);
  });
});

describe('SyncService — paging', () => {
  it('pages with a cursor and resumes exactly where it left off', async () => {
    const rows = [1, 2, 3, 4, 5].map((n) =>
      application({
        id: `app-${n}`,
        updatedAt: new Date(T2.getTime() + n * 1000),
      }),
    );
    const sync = build({ applications: rows });

    const first = await sync.syncApplications(ME, { limit: 2 });
    expect(first.upserts.map((a) => a.id)).toEqual(['app-1', 'app-2']);
    expect(first.nextCursor).not.toBeNull();

    const second = await sync.syncApplications(ME, {
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.upserts.map((a) => a.id)).toEqual(['app-3', 'app-4']);

    const third = await sync.syncApplications(ME, {
      limit: 2,
      cursor: second.nextCursor!,
    });
    expect(third.upserts.map((a) => a.id)).toEqual(['app-5']);
    expect(third.nextCursor).toBeNull(); // drained
  });

  it('breaks updatedAt ties on id so a page boundary cannot lose a row', async () => {
    // Three rows sharing one timestamp, paged two at a time. Without the id tie-break
    // the cursor could not distinguish them and a row would be skipped or repeated.
    const rows = ['a', 'b', 'c'].map((s) =>
      application({ id: `app-${s}`, updatedAt: T2 }),
    );
    const sync = build({ applications: rows });

    const first = await sync.syncApplications(ME, { limit: 2 });
    const second = await sync.syncApplications(ME, {
      limit: 2,
      cursor: first.nextCursor!,
    });

    expect([...first.upserts, ...second.upserts].map((a) => a.id)).toEqual([
      'app-a',
      'app-b',
      'app-c',
    ]);
  });

  it('ignores an unparseable cursor rather than failing the sync', async () => {
    const sync = build({ applications: [application()] });

    const res = await sync.syncApplications(ME, { cursor: 'not-a-real-cursor' });

    expect(res.upserts).toHaveLength(1);
  });
});

describe('SyncService — resources that cannot express a true delta', () => {
  it('returns saved jobs as a full replace, ignoring since', async () => {
    const sync = build({
      savedJobs: [
        { id: 'sj-1', userId: ME, jobId: 'job-a', createdAt: T0 },
        { id: 'sj-2', userId: ME, jobId: 'job-b', createdAt: T3 },
      ],
    });

    // T0 predates `since`, but a full replace must still include it — otherwise the
    // client would drop a bookmark it still has.
    const res = await sync.syncSavedJobs(ME, { since: SINCE.toISOString() });

    expect(res.fullReplace).toBe(true);
    expect(res.upserts.map((s) => s.jobId).sort()).toEqual(['job-a', 'job-b']);
    expect(res.nextCursor).toBeNull();
  });

  it('always reports an empty deletes array for recommendations', async () => {
    const sync = build({ recommendations: [recommendation({ updatedAt: T3 })] });

    const res = await sync.syncRecommendations(ME, { since: SINCE.toISOString() });

    expect(res.upserts).toHaveLength(1);
    expect(res.deletes).toEqual([]);
  });

  it('serves recommendations in the same shape as GET /recommendations', async () => {
    const sync = build({ recommendations: [recommendation()] });

    const res = await sync.syncRecommendations(ME, {});

    // Shape produced by the shared toRecommendedJobDto mapper.
    expect(res.upserts[0]).toMatchObject({
      id: 'job-1',
      companyName: 'Acme',
      title: 'Engineer',
      match: 88, // rounded
      reason: 'matches your skills',
    });
  });
});

describe('SyncService — bootstrap', () => {
  it('returns every in-scope resource under one serverTime', async () => {
    const sync = build({
      applications: [application()],
      experiences: [experience()],
      savedJobs: [{ id: 'sj-1', userId: ME, jobId: 'job-a', createdAt: T2 }],
      recommendations: [recommendation()],
    });

    const boot = await sync.bootstrap(ME);

    expect(Object.keys(boot.resources).sort()).toEqual([
      'applications',
      'certifications',
      'education',
      'experiences',
      'profile',
      'recommendations',
      'savedJobs',
      'skills',
    ]);
    expect(boot.serverTime).toEqual(expect.any(String));
    // A bootstrap is by definition a full sync — no watermark was supplied.
    expect(boot.resources.applications.since).toBeNull();
    expect(boot.resources.applications.upserts).toHaveLength(1);
  });
});
