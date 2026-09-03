// Does changing a candidate's country actually change WHICH jobs they are shown?
//
// Reproduces the reported bug end to end against the real database and reports the pool
// overlap. Kept because the answer is not visible from a unit test: the failure was that
// retrieval picked the candidate pool blind to geography, so the same 50 rows came back
// and were merely re-sorted. Only a run against a real corpus shows the set moving.
//
// Measured on the live corpus (368 published jobs, 2026-09-03):
//   before the fix   entered=0   left=0    KH 14 -> 14
//   after  the fix   entered=28  left=28   KH  7 -> 32,  US 32 -> 11
//
// Run: npx ts-node -r tsconfig-paths/register scripts/diagnostics/location-change-repro.ts
//
// Creates a disposable user + profile (embedding copied from an existing profile so no
// AI service is needed), recomputes at a US location, moves it to Cambodia, recomputes
// again, and prints what actually changed. Cleans up after itself.

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/infra/prisma/prisma.service';
import { RecomputeUserMatchesUseCase } from '../../src/modules/matching/application/use-cases/recompute-user-matches.use-case';

const TEST_EMAIL = 'location-repro@jobfit.test';

interface Row {
  jobId: string;
  score: number;
  location: string | null;
  locScore: number | null;
  locationKnown: boolean;
}

async function snapshot(prisma: PrismaService, userId: string): Promise<Row[]> {
  const rows = await prisma.recommendation.findMany({
    where: { userId, dismissedAt: null, job: { status: 'PUBLISHED' } },
    orderBy: [{ score: 'desc' }, { locationKnown: 'desc' }, { jobId: 'asc' }],
    take: 50,
    include: { job: { select: { location: true, remoteType: true } } },
  });
  return rows.map((r) => ({
    jobId: r.jobId,
    score: r.score,
    location: r.job.location,
    locScore: (r.breakdown as Record<string, number | null> | null)?.location ?? null,
    locationKnown: r.locationKnown,
  }));
}

function isCambodian(loc: string | null): boolean {
  if (!loc) return false;
  const l = loc.toLowerCase();
  return l.includes('phnom') || l.includes('cambodia') || l.trim().toLowerCase() === 'pp' ||
    l.includes('siem reap') || l.includes('battambang');
}
function isUs(loc: string | null): boolean {
  if (!loc) return false;
  return /,\s*(ny|ca|tx|fl|wa|az|il|ma|co|ga|nc|oh|pa|mi|va|nj|or|ut|nv)\b/i.test(loc) ||
    /\bunited states|\bUSA\b/i.test(loc);
}

function report(label: string, rows: Row[]): void {
  const kh = rows.filter((r) => isCambodian(r.location)).length;
  const us = rows.filter((r) => isUs(r.location)).length;
  const located = rows.filter((r) => r.location && r.location.trim()).length;
  const measured = rows.filter((r) => r.locScore !== null).length;
  console.log(
    `${label.padEnd(28)} rows=${String(rows.length).padStart(2)} ` +
      `KH=${String(kh).padStart(2)} US=${String(us).padStart(2)} ` +
      `withLocationText=${String(located).padStart(2)} locationMeasured=${String(measured).padStart(2)}`,
  );
  console.log(`   top 10: ${rows.slice(0, 10).map((r) => `${r.score}${r.location ? `[${r.location.slice(0, 18)}]` : '[-]'}`).join(' ')}`);
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const recompute = app.get(RecomputeUserMatchesUseCase);
  let userId: string | null = null;

  try {
    // Donor embedding: any profile that has one. No AI service required.
    const [donor] = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT id FROM profiles WHERE embedding IS NOT NULL LIMIT 1`,
    );
    if (!donor) throw new Error('No profile with an embedding to copy — cannot run.');

    await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
    const user = await prisma.user.create({
      data: { email: TEST_EMAIL, passwordHash: 'x', role: 'JOB_SEEKER', isActive: true },
      select: { id: true },
    });
    userId = user.id;

    const profile = await prisma.profile.create({
      data: {
        userId: user.id,
        firstName: 'Loc',
        lastName: 'Repro',
        headline: 'Software Engineer',
        city: 'San Francisco',
        state: 'CA',
        country: 'United States',
      },
      select: { id: true },
    });
    await prisma.$executeRawUnsafe(
      `UPDATE profiles SET embedding = (SELECT embedding FROM profiles WHERE id = $1),
              "embeddingStatus" = 'SUCCESS' WHERE id = $2`,
      donor.id,
      profile.id,
    );

    console.log('\n=== BEFORE: profile in San Francisco, United States ===');
    await recompute.execute(user.id, 50);
    const before = await snapshot(prisma, user.id);
    report('US (San Francisco)', before);

    await prisma.profile.update({
      where: { id: profile.id },
      data: { city: 'Phnom Penh', state: '', country: 'Cambodia' },
    });

    console.log('\n=== AFTER: same profile moved to Phnom Penh, Cambodia ===');
    await recompute.execute(user.id, 50);
    const after = await snapshot(prisma, user.id);
    report('KH (Phnom Penh)', after);

    const beforeIds = new Set(before.map((r) => r.jobId));
    const afterIds = new Set(after.map((r) => r.jobId));
    const entered = [...afterIds].filter((id) => !beforeIds.has(id));
    const left = [...beforeIds].filter((id) => !afterIds.has(id));
    const enteredRows = after.filter((r) => entered.includes(r.jobId));

    console.log('\n=== POOL CHANGE ===');
    console.log(`jobs that ENTERED the pool after the move : ${entered.length}`);
    console.log(`jobs that LEFT the pool after the move    : ${left.length}`);
    console.log(`of the entrants, Cambodian                : ${enteredRows.filter((r) => isCambodian(r.location)).length}`);
    if (enteredRows.length > 0) {
      console.log(`entrants: ${enteredRows.map((r) => `${r.score}[${r.location ?? '-'}]`).join(', ')}`);
    }
    const topBefore = before.slice(0, 10).map((r) => r.jobId);
    const topAfter = after.slice(0, 10).map((r) => r.jobId);
    console.log(`top-10 identical                          : ${JSON.stringify(topBefore) === JSON.stringify(topAfter)}`);
  } finally {
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  }
}

void main();
