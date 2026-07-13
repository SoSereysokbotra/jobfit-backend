// src/modules/learning/domain/learning-resources.catalog.ts
//
// Curated learning-resource catalog (no external course API). Keyed by lowercased skill
// name; unknown skills fall back to generic search links. IN_DEMAND_SKILLS drives the
// skill-gap analysis.

export interface LearningResource {
  title: string;
  provider: string;
  url: string;
}

const CATALOG: Record<string, LearningResource[]> = {
  typescript: [
    { title: 'The TypeScript Handbook', provider: 'typescriptlang.org', url: 'https://www.typescriptlang.org/docs/handbook/intro.html' },
    { title: 'Understanding TypeScript', provider: 'Udemy', url: 'https://www.udemy.com/course/understanding-typescript/' },
  ],
  react: [
    { title: 'React Official Docs', provider: 'react.dev', url: 'https://react.dev/learn' },
    { title: 'Epic React', provider: 'epicreact.dev', url: 'https://epicreact.dev/' },
  ],
  'node.js': [
    { title: 'Node.js Docs', provider: 'nodejs.org', url: 'https://nodejs.org/en/learn' },
    { title: 'Node.js: The Complete Guide', provider: 'Udemy', url: 'https://www.udemy.com/course/nodejs-the-complete-guide/' },
  ],
  python: [
    { title: 'Python for Everybody', provider: 'Coursera', url: 'https://www.coursera.org/specializations/python' },
    { title: 'Official Python Tutorial', provider: 'python.org', url: 'https://docs.python.org/3/tutorial/' },
  ],
  aws: [
    { title: 'AWS Cloud Practitioner Essentials', provider: 'AWS', url: 'https://aws.amazon.com/training/learn-about/cloud-practitioner/' },
    { title: 'AWS Certified Solutions Architect', provider: 'Udemy', url: 'https://www.udemy.com/course/aws-certified-solutions-architect-associate-saa-c03/' },
  ],
  docker: [
    { title: 'Docker Getting Started', provider: 'docker.com', url: 'https://docs.docker.com/get-started/' },
    { title: 'Docker & Kubernetes: The Practical Guide', provider: 'Udemy', url: 'https://www.udemy.com/course/docker-kubernetes-the-practical-guide/' },
  ],
  kubernetes: [
    { title: 'Kubernetes Basics', provider: 'kubernetes.io', url: 'https://kubernetes.io/docs/tutorials/kubernetes-basics/' },
  ],
  sql: [
    { title: 'SQL for Data Science', provider: 'Coursera', url: 'https://www.coursera.org/learn/sql-for-data-science' },
    { title: 'SQLBolt Interactive Lessons', provider: 'sqlbolt.com', url: 'https://sqlbolt.com/' },
  ],
  'system design': [
    { title: 'System Design Primer', provider: 'GitHub', url: 'https://github.com/donnemartin/system-design-primer' },
    { title: 'Grokking the System Design Interview', provider: 'Educative', url: 'https://www.educative.io/courses/grokking-the-system-design-interview' },
  ],
  communication: [
    { title: 'Improving Communication Skills', provider: 'Coursera', url: 'https://www.coursera.org/learn/wharton-communication-skills' },
  ],
};

/** Skills commonly in demand; a user missing these gets them as gap recommendations. */
export const IN_DEMAND_SKILLS: string[] = Object.keys(CATALOG);

/** Resources for a skill name — curated when known, otherwise generic search links. */
export function resourcesForSkill(skillName: string): LearningResource[] {
  const key = skillName.trim().toLowerCase();
  return CATALOG[key] ?? genericResources(skillName);
}

function genericResources(skillName: string): LearningResource[] {
  const q = encodeURIComponent(skillName);
  return [
    { title: `Search Coursera for "${skillName}"`, provider: 'Coursera', url: `https://www.coursera.org/search?query=${q}` },
    { title: `Search Udemy for "${skillName}"`, provider: 'Udemy', url: `https://www.udemy.com/courses/search/?q=${q}` },
    { title: `${skillName} tutorials`, provider: 'Google', url: `https://www.google.com/search?q=${q}+tutorial` },
  ];
}
