// scripts/create-test-users.ts
//
// Seeds everything you need to test the full flow via Swagger, without going through
// email verification. Safe to re-run — everything is upserted.
//   - 3 pre-verified users (ADMIN / EMPLOYER / JOB_SEEKER)
//   - 1 Industry, 2 Skills, 1 Company (so the employer + job + application flow works)
// Prints all the IDs you'll paste into request bodies.
//
//   Run:  npx ts-node -r tsconfig-paths/register scripts/create-test-users.ts

import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'Password123';

const TEST_USERS: { email: string; name: string; role: UserRole }[] = [
  { email: 'admin@jobfit.test', name: 'Test Admin', role: UserRole.ADMIN },
  { email: 'employer@jobfit.test', name: 'Test Employer', role: UserRole.EMPLOYER },
  { email: 'seeker@jobfit.test', name: 'Test Seeker', role: UserRole.JOB_SEEKER },
];

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  const users: Record<string, string> = {};
  for (const u of TEST_USERS) {
    const row = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        passwordHash,
        emailVerified: true,
        isActive: true,
        deletedAt: null,
      },
      create: {
        email: u.email,
        name: u.name,
        role: u.role,
        passwordHash,
        emailVerified: true,
        isActive: true,
      },
    });
    users[u.role] = row.id;
    console.log(`  upserted ${u.role.padEnd(11)} ${u.email}`);
  }

  // Catalogue: 1 industry + 2 skills (needed by profile experience & job creation).
  const industry = await prisma.industry.upsert({
    where: { slug: 'software' },
    update: {},
    create: { name: 'Software', slug: 'software' },
  });
  const skillDefs = [
    { name: 'TypeScript', slug: 'typescript' },
    { name: 'Node.js', slug: 'nodejs' },
  ];
  const skills = [];
  for (const s of skillDefs) {
    skills.push(
      await prisma.skill.upsert({
        where: { slug: s.slug },
        update: {},
        create: s,
      }),
    );
  }

  // A company for the employer to claim.
  const company = await prisma.company.upsert({
    where: { name: 'Acme Test Co' },
    update: {},
    create: {
      name: 'Acme Test Co',
      description: 'Seeded company for testing.',
      industry: industry.id,
    },
  });

  console.log('\n────────────────────────────────────────────────────────');
  console.log('Test data ready. Password for all users: ' + PASSWORD);
  console.log('────────────────────────────────────────────────────────');
  console.log('ADMIN_USER_ID    =', users[UserRole.ADMIN]);
  console.log('EMPLOYER_USER_ID =', users[UserRole.EMPLOYER]);
  console.log('SEEKER_USER_ID   =', users[UserRole.JOB_SEEKER]);
  console.log('COMPANY_ID       =', company.id);
  console.log('INDUSTRY_ID      =', industry.id);
  console.log('SKILL_ID_1       =', skills[0].id, '(TypeScript)');
  console.log('SKILL_ID_2       =', skills[1].id, '(Node.js)');
  console.log('────────────────────────────────────────────────────────');
}

main()
  .catch((err) => {
    console.error('Failed to create test users:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
