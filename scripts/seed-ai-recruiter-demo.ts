/**
 * Seed the employer<->seeker loop the AI Recruiter needs (AI_RECRUITER_PLAN.md Phase 1).
 *
 * The employer side of JobFits is fully built but has never been exercised: zero verified
 * companies and ONE application across the whole system. Every employer page is empty for
 * want of data, and no screening threshold can be measured at n=1.
 *
 * This creates a verified company, an internal job with REAL requirements (the existing
 * internal jobs carry only boilerplate like "4+ years of relevant professional
 * experience", which no skill can meaningfully match), and four candidates whose résumés
 * are deliberately spread from strong to unrelated — so the ranking this produces can be
 * checked against an obvious expected order rather than taken on trust.
 *
 * Résumé data is inserted directly rather than uploaded as PDFs: parsing is
 * non-deterministic on qwen3:0.6b, and seed data has to be the same every run.
 *
 * Idempotent. Everything is namespaced @seed.jobfits.test so it can never be mistaken for
 * organic data.
 *
 *   npx ts-node -r tsconfig-paths/register scripts/seed-ai-recruiter-demo.ts
 */

import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'Password123';
const SEED_DOMAIN = '@seed.jobfits.test';

/** Requirements a résumé can actually be checked against, unlike the existing boilerplate. */
const JOB_REQUIREMENTS = [
  '3+ years building production web applications with React and TypeScript',
  'Experience designing and consuming REST APIs with Node.js',
  'Working knowledge of PostgreSQL, including query performance',
  'Comfortable with Docker for local development and deployment',
  'Experience with CI/CD pipelines (GitHub Actions or similar)',
  'Familiarity with automated testing (Jest, Playwright or equivalent)',
  'Experience mentoring junior engineers',
];

/**
 * Candidates ordered by how well they SHOULD rank. Phase 5 compares the computed order
 * against this before any threshold is chosen.
 */
const CANDIDATES = [
  {
    key: 'strong',
    name: 'Dara Sok',
    headline: 'Senior Full-Stack Engineer',
    expectation: 'best fit — covers most requirements',
    skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'Docker', 'GitHub Actions', 'Jest'],
    experiences: [
      { company: 'Acme Web', title: 'Senior Full-Stack Engineer', startDate: '2021-03', endDate: null, highlights: ['Led the React/TypeScript rewrite of the customer portal'] },
      { company: 'Bluebird', title: 'Full-Stack Engineer', startDate: '2018-06', endDate: '2021-02', highlights: ['Built REST APIs in Node.js against PostgreSQL'] },
    ],
  },
  {
    key: 'partial',
    name: 'Sophea Chan',
    headline: 'Backend Engineer',
    expectation: 'partial — backend depth, no React',
    skills: ['Python', 'Django', 'PostgreSQL', 'Docker', 'GitHub Actions'],
    experiences: [
      { company: 'DataForge', title: 'Backend Engineer', startDate: '2020-01', endDate: null, highlights: ['Owned the PostgreSQL data layer and Docker build pipeline'] },
    ],
  },
  {
    key: 'junior',
    name: 'Rithy Meas',
    headline: 'Junior Frontend Developer',
    expectation: 'weaker — front-end only, junior',
    skills: ['React', 'JavaScript', 'CSS'],
    experiences: [
      { company: 'Studio Nine', title: 'Junior Frontend Developer', startDate: '2023-05', endDate: null, highlights: ['Built marketing pages in React'] },
    ],
  },
  {
    key: 'unrelated',
    name: 'Bopha Nou',
    headline: 'Graphic Designer',
    expectation: 'should rank last — unrelated field',
    skills: ['Adobe Photoshop', 'Illustrator', 'Figma', 'Brand Identity'],
    experiences: [
      { company: 'Colour Co', title: 'Graphic Designer', startDate: '2019-09', endDate: null, highlights: ['Produced brand identity systems for retail clients'] },
    ],
  },
];

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // ── company (verified, so the employer flow is actually unblocked) ──────────
  const company = await prisma.company.upsert({
    where: { name: 'Kirirom Tech (Demo)' },
    update: { isVerified: true, verifiedAt: new Date() },
    create: {
      name: 'Kirirom Tech (Demo)',
      description: 'Demo employer used to exercise the JobFits hiring flow end to end.',
      website: 'https://example.com',
      city: 'Phnom Penh',
      country: 'Cambodia',
      isVerified: true,
      verifiedAt: new Date(),
    },
  });
  console.log(`company   ${company.name} (verified)`);

  // ── employer ───────────────────────────────────────────────────────────────
  const employer = await prisma.user.upsert({
    where: { email: `employer${SEED_DOMAIN}` },
    update: { passwordHash, emailVerified: true, isActive: true, deletedAt: null },
    create: {
      email: `employer${SEED_DOMAIN}`,
      name: 'Demo Employer',
      role: UserRole.EMPLOYER,
      passwordHash,
      emailVerified: true,
      isActive: true,
    },
  });
  await prisma.employerProfile.upsert({
    where: { userId: employer.id },
    update: { companyId: company.id },
    create: { userId: employer.id, firstName: 'Demo', lastName: 'Employer', companyId: company.id },
  });
  console.log(`employer  ${employer.email}`);

  // ── the job (INTERNAL, so applications are received here) ───────────────────
  const existing = await prisma.job.findFirst({
    where: { title: 'Full-Stack Engineer (Demo)', companyId: company.id },
    select: { id: true },
  });
  const job = existing
    ? await prisma.job.update({
        where: { id: existing.id },
        data: { requirements: JOB_REQUIREMENTS, status: 'PUBLISHED', sourceType: 'INTERNAL' },
      })
    : await prisma.job.create({
        data: {
          companyId: company.id,
          postedByEmployerId: employer.id,
          title: 'Full-Stack Engineer (Demo)',
          description:
            'We are hiring a full-stack engineer to build and maintain our customer-facing ' +
            'web platform. You will work across a React and TypeScript front end and a ' +
            'Node.js API backed by PostgreSQL, and help keep our Docker-based CI/CD ' +
            'pipeline healthy.',
          status: 'PUBLISHED',
          sourceType: 'INTERNAL',
          remoteType: 'HYBRID',
          location: 'Phnom Penh',
          minSalary: 24000,
          maxSalary: 42000,
          requirements: JOB_REQUIREMENTS,
        },
      });
  console.log(`job       ${job.title} — ${JOB_REQUIREMENTS.length} requirements`);

  // ── candidates + applications ──────────────────────────────────────────────
  for (const c of CANDIDATES) {
    const email = `${c.key}${SEED_DOMAIN}`;
    const user = await prisma.user.upsert({
      where: { email },
      update: { name: c.name, passwordHash, emailVerified: true, isActive: true, deletedAt: null },
      create: {
        email,
        name: c.name,
        role: UserRole.JOB_SEEKER,
        passwordHash,
        emailVerified: true,
        isActive: true,
      },
    });

    const [firstName, ...rest] = c.name.split(' ');
    await prisma.profile.upsert({
      where: { userId: user.id },
      update: { headline: c.headline },
      create: {
        userId: user.id,
        firstName,
        lastName: rest.join(' ') || firstName,
        headline: c.headline,
        city: 'Phnom Penh',
        country: 'Cambodia',
        desiredRemoteTypes: ['HYBRID', 'REMOTE'],
        minSalary: 20000,
        maxSalary: 50000,
      },
    });

    // Résumé written straight to the parsed table: qwen3:0.6b parsing is
    // non-deterministic, and seed data must be identical on every run.
    const resume = await prisma.resume.upsert({
      where: { id: deterministicId(c.key) },
      update: { parsingStatus: 'SUCCESS', deletedAt: null },
      create: {
        id: deterministicId(c.key),
        userId: user.id,
        fileName: `${c.key}-seed-resume.pdf`,
        fileUrl: 'seed://no-file',
        fileSize: 1,
        fileType: 'PDF',
        parsingStatus: 'SUCCESS',
      },
    });
    await prisma.parsedResumeData.upsert({
      where: { resumeId: resume.id },
      update: {
        skills: JSON.stringify(c.skills),
        experiences: JSON.stringify(c.experiences),
        parsedBy: 'seed',
      },
      create: {
        resumeId: resume.id,
        fullName: c.name,
        email,
        skills: JSON.stringify(c.skills),
        experiences: JSON.stringify(c.experiences),
        rawText: `${c.name} — ${c.headline}. Skills: ${c.skills.join(', ')}.`,
        parsedBy: 'seed',
      },
    });

    const application = await prisma.application.upsert({
      where: { userId_jobId: { userId: user.id, jobId: job.id } },
      update: { status: 'SUBMITTED', deletedAt: null },
      create: { userId: user.id, jobId: job.id, resumeId: resume.id, status: 'SUBMITTED' },
    });
    console.log(
      `candidate ${email.padEnd(30)} ${c.skills.length} skills — ${c.expectation}`,
    );
    void application;
  }

  console.log(`\nAll seed accounts use password: ${PASSWORD}`);
  console.log(`Employer applicants page: /employer/jobs/${job.id}/applicants`);
  console.log(
    '\nNOTE: candidate embeddings are NOT generated here (that needs the AI service).\n' +
      '      Run the embedding backfill if you want the skills sub-score populated.',
  );
}

/** Stable per-candidate uuid so re-running updates the same résumé row. */
function deterministicId(key: string): string {
  const suffix = key.padEnd(12, '0').slice(0, 12);
  return `5eed0000-0000-4000-8000-${Buffer.from(suffix).toString('hex').slice(0, 12)}`;
}

void main()
  .catch((err: Error) => {
    console.error('FAILED:', err.message);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
