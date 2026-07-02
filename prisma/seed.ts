import { PrismaClient } from '@prisma/client';

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

  console.log('✅  Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
