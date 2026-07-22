import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Seeding database...');

  // Seed Skills
  const skills = [
    { name: 'TypeScript', slug: 'typescript' },
    { name: 'React', slug: 'react' },
    { name: 'Node.js', slug: 'nodejs' },
    { name: 'PostgreSQL', slug: 'postgresql' },
    { name: 'Python', slug: 'python' },
    { name: 'Docker', slug: 'docker' },
    { name: 'AWS', slug: 'aws' },
    { name: 'GraphQL', slug: 'graphql' },
  ];

  for (const skill of skills) {
    await prisma.skill.upsert({
      where: { slug: skill.slug },
      update: {},
      create: skill,
    });
  }

  // Seed Industries
  const industries = [
    { name: 'Technology', slug: 'technology' },
    { name: 'Finance', slug: 'finance' },
    { name: 'Healthcare', slug: 'healthcare' },
    { name: 'Education', slug: 'education' },
    { name: 'E-commerce', slug: 'ecommerce' },
    { name: 'Media & Entertainment', slug: 'media-entertainment' },
    { name: 'Logistics', slug: 'logistics' },
    { name: 'Manufacturing', slug: 'manufacturing' },
  ];

  for (const industry of industries) {
    await prisma.industry.upsert({
      where: { slug: industry.slug },
      update: {},
      create: industry,
    });
  }

  // Look up the industry + skill ids we just upserted, keyed by slug, so jobs can
  // reference real rows regardless of the (random) uuids Prisma assigned them.
  const industryBySlug = new Map(
    (await prisma.industry.findMany()).map((i) => [i.slug, i.id]),
  );
  const skillBySlug = new Map(
    (await prisma.skill.findMany()).map((s) => [s.slug, s.id]),
  );

  // ── Seed Companies ──────────────────────────────────────────────────────────
  // Employer-less demo companies so the public job board has real names/logos.
  // `name` is unique, so upsert-by-name is idempotent.
  const companies = [
    { name: 'Stripe',      industry: 'technology', city: 'San Francisco', state: 'CA', country: 'USA',
      logoUrl: 'https://logo.clearbit.com/stripe.com',  website: 'https://stripe.com',
      description: 'Payments infrastructure for the internet.' },
    { name: 'Airbnb',      industry: 'technology', city: 'San Francisco', state: 'CA', country: 'USA',
      logoUrl: 'https://logo.clearbit.com/airbnb.com',  website: 'https://airbnb.com',
      description: 'Global marketplace for stays and experiences.' },
    { name: 'Figma',       industry: 'technology', city: 'New York',      state: 'NY', country: 'USA',
      logoUrl: 'https://logo.clearbit.com/figma.com',   website: 'https://figma.com',
      description: 'Collaborative interface design tool.' },
    { name: 'Nexus AI',    industry: 'technology', city: 'Seattle',       state: 'WA', country: 'USA',
      logoUrl: null,                                     website: null,
      description: 'Applied machine-learning products.' },
    { name: 'HealthHub',   industry: 'healthcare', city: 'Boston',        state: 'MA', country: 'USA',
      logoUrl: null,                                     website: null,
      description: 'Telehealth and patient-experience platform.' },
    { name: 'GreenGrid',   industry: 'technology', city: 'Portland',      state: 'OR', country: 'USA',
      logoUrl: null,                                     website: null,
      description: 'Monitoring for residential solar fleets.' },
  ];

  const companyByName = new Map<string, string>();
  for (const c of companies) {
    const row = await prisma.company.upsert({
      where: { name: c.name },
      update: {
        industry: industryBySlug.get(c.industry) ?? null,
        logoUrl: c.logoUrl,
        website: c.website,
        description: c.description,
        city: c.city,
        state: c.state,
        country: c.country,
      },
      create: {
        name: c.name,
        industry: industryBySlug.get(c.industry) ?? null,
        logoUrl: c.logoUrl,
        website: c.website,
        description: c.description,
        city: c.city,
        state: c.state,
        country: c.country,
      },
    });
    companyByName.set(c.name, row.id);
  }

  // ── Seed Jobs ───────────────────────────────────────────────────────────────
  // Stable string ids make re-seeding idempotent (upsert by id). All PUBLISHED so
  // the public `GET /jobs?status=PUBLISHED` returns them. remoteType uses the
  // backend's canonical tokens: REMOTE | HYBRID | ON_SITE.
  const jobs: Array<{
    id: string; company: string; title: string; remoteType: string; location: string;
    minSalary: number; maxSalary: number; skills: string[]; description: string;
  }> = [
    { id: '11111111-1111-4111-8111-111111111111', company: 'Stripe', title: 'Senior Frontend Engineer',
      remoteType: 'HYBRID', location: 'San Francisco, CA', minSalary: 165000, maxSalary: 210000,
      skills: ['react', 'typescript'],
      description: 'Build and scale the payment dashboard used by millions of businesses worldwide, working with React, TypeScript, and design systems.' },
    { id: '22222222-2222-4222-8222-222222222222', company: 'Airbnb', title: 'React Specialist Developer',
      remoteType: 'REMOTE', location: 'Remote (US)', minSalary: 150000, maxSalary: 195000,
      skills: ['react', 'typescript', 'nodejs'],
      description: 'Own core booking-flow components and drive performance improvements across the guest experience platform.' },
    { id: '33333333-3333-4333-8333-333333333333', company: 'Figma', title: 'Software Engineer – Platforms',
      remoteType: 'HYBRID', location: 'New York, NY', minSalary: 140000, maxSalary: 185000,
      skills: ['typescript', 'nodejs', 'postgresql'],
      description: 'Develop the multiplayer editing infrastructure that powers real-time collaboration for design teams.' },
    { id: '44444444-4444-4444-8444-444444444444', company: 'Nexus AI', title: 'Machine Learning Engineer',
      remoteType: 'HYBRID', location: 'Seattle, WA', minSalary: 175000, maxSalary: 230000,
      skills: ['python', 'aws', 'docker'],
      description: 'Productionize LLM-powered features end to end, from evaluation pipelines to low-latency serving.' },
    { id: '55555555-5555-4555-8555-555555555555', company: 'HealthHub', title: 'Product Designer',
      remoteType: 'HYBRID', location: 'Boston, MA', minSalary: 110000, maxSalary: 145000,
      skills: ['react'],
      description: 'Design patient-facing telehealth experiences with a focus on accessibility and clinical-workflow integration.' },
    { id: '66666666-6666-4666-8666-666666666666', company: 'GreenGrid', title: 'Full-Stack Engineer',
      remoteType: 'REMOTE', location: 'Portland, OR', minSalary: 125000, maxSalary: 160000,
      skills: ['typescript', 'react', 'postgresql', 'aws'],
      description: 'Build monitoring dashboards and APIs for residential solar fleets using Next.js and PostgreSQL.' },
  ];

  // Heal older seeds that used non-UUID job ids (employer routes require UUIDs):
  // drop their applications (cascades timeline/contacts) then the jobs themselves.
  const legacyJobs = await prisma.job.findMany({
    where: { id: { startsWith: 'seed-job-' } },
    select: { id: true },
  });
  if (legacyJobs.length > 0) {
    const legacyIds = legacyJobs.map((j) => j.id);
    await prisma.application.deleteMany({ where: { jobId: { in: legacyIds } } });
    await prisma.job.deleteMany({ where: { id: { in: legacyIds } } });
    console.log(`   🧹  Removed ${legacyIds.length} legacy string-id job(s).`);
  }

  // Shared structured content for the demo jobs (employers author these per-job in the app).
  const DEFAULT_RESPONSIBILITIES = [
    'Design, build, and maintain scalable services used across the platform.',
    'Write clean, well-tested, efficient code and take part in code reviews.',
    'Collaborate with product managers and designers to ship new features.',
    'Investigate and resolve performance and reliability issues in production.',
  ];
  const DEFAULT_REQUIREMENTS = [
    '4+ years of relevant professional experience.',
    'Strong fundamentals in the core stack for this role.',
    'Excellent written and verbal communication skills.',
    'Comfortable working in an agile, collaborative team.',
  ];
  const DEFAULT_BENEFITS = [
    'Comprehensive health, dental, and vision insurance.',
    '401(k) matching up to 5% of your base salary.',
    '20 days PTO plus 11 paid company holidays.',
    'Flexible, remote-friendly working hours.',
    '$2,000 annual learning and development budget.',
  ];

  for (const j of jobs) {
    const companyId = companyByName.get(j.company);
    if (!companyId) continue;
    const skillLinks = j.skills
      .map((slug) => skillBySlug.get(slug))
      .filter((id): id is string => Boolean(id))
      .map((skillId) => ({ skillId }));

    await prisma.job.upsert({
      where: { id: j.id },
      update: {
        companyId,
        title: j.title,
        description: j.description,
        status: 'PUBLISHED',
        remoteType: j.remoteType,
        location: j.location,
        minSalary: j.minSalary,
        maxSalary: j.maxSalary,
        responsibilities: DEFAULT_RESPONSIBILITIES,
        requirements: DEFAULT_REQUIREMENTS,
        benefits: DEFAULT_BENEFITS,
        bonusPct: 15,
        skills: { deleteMany: {}, create: skillLinks },
      },
      create: {
        id: j.id,
        companyId,
        title: j.title,
        description: j.description,
        status: 'PUBLISHED',
        remoteType: j.remoteType,
        location: j.location,
        minSalary: j.minSalary,
        maxSalary: j.maxSalary,
        responsibilities: DEFAULT_RESPONSIBILITIES,
        requirements: DEFAULT_REQUIREMENTS,
        benefits: DEFAULT_BENEFITS,
        bonusPct: 15,
        skills: { create: skillLinks },
      },
    });
  }

  // ── Seed a demo EMPLOYER (so the employer dashboard has a real, reproducible login) ──
  // Role EMPLOYER + a verified email + an EmployerProfile linking them to Stripe. The
  // email domain (stripe.com) matches Stripe's website so verify-email can be demoed too.
  // One employer per company (each employer only sees THEIR company's applications).
  // Seeding several lets you test a seeker holding offers from multiple companies.
  // One employer per company that has jobs, so every job on the board has a real
  // person who can review applicants and send offers (no "orphan" applications).
  const employers = [
    { email: 'employer@stripe.com', company: 'Stripe', firstName: 'Evan', lastName: 'Employer' },
    { email: 'employer@airbnb.com', company: 'Airbnb', firstName: 'Aisha', lastName: 'Adams' },
    { email: 'employer@figma.com', company: 'Figma', firstName: 'Finn', lastName: 'Ford' },
    { email: 'employer@nexusai.com', company: 'Nexus AI', firstName: 'Nadia', lastName: 'Nolan' },
    { email: 'employer@healthhub.com', company: 'HealthHub', firstName: 'Hana', lastName: 'Hill' },
    { email: 'employer@greengrid.com', company: 'GreenGrid', firstName: 'Gil', lastName: 'Grant' },
  ];
  for (const e of employers) {
    const companyId = companyByName.get(e.company);
    if (!companyId) continue;
    const employer = await prisma.user.upsert({
      where: { email: e.email },
      update: { role: 'EMPLOYER', emailVerified: true },
      create: {
        email: e.email,
        passwordHash: bcrypt.hashSync('Employer123', 10),
        role: 'EMPLOYER',
        emailVerified: true,
      },
    });
    await prisma.employerProfile.upsert({
      where: { userId: employer.id },
      update: { companyId },
      create: { userId: employer.id, companyId, firstName: e.firstName, lastName: e.lastName },
    });
    console.log(`   👔  Employer login: ${e.email} / Employer123 (manages ${e.company})`);
  }

  // ── Seed a demo ADMIN (so the admin console has a real, reproducible login) ──
  await prisma.user.upsert({
    where: { email: 'admin@jobfit.com' },
    update: { role: 'ADMIN', emailVerified: true },
    create: {
      email: 'admin@jobfit.com',
      passwordHash: bcrypt.hashSync('Admin123!', 10),
      role: 'ADMIN',
      emailVerified: true,
    },
  });
  console.log('   🛡️   Admin login: admin@jobfit.com / Admin123! (role ADMIN)');

  console.log(
    `✅  Seed complete — ${companies.length} companies, ${jobs.length} published jobs.`,
  );
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
