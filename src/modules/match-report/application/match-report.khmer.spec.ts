// A Khmer posting must not get a confident skills table.
//
// MENTOR_REVIEW_2026-08-18 §19. The matchers split on Latin character classes, so on a
// Khmer posting they found only whichever English brand names happened to appear —
// "Excel", "Word" — scored those against the résumé, and rendered a table with a
// confident `missingCount`. "You're missing 11 skills" was computed from nothing.
//
// What must SURVIVE is the match score: it comes from cross-lingual bge-m3 embeddings,
// measured at cosine 0.82 between a Khmer and an English title for the same role. The
// number is evidenced; the word matching is not. Withholding both would be over-correcting.

import { MatchReportService } from './match-report.service';

const KHMER_DESCRIPTION =
  'ការងារគ្រូបង្រៀនគណិតវិទ្យា នៅរាជធានីភ្នំពេញ។ ចេះប្រើ Excel និង Word ' +
  'ត្រូវការបទពិសោធន៍ការងារយ៉ាងតិចពីរឆ្នាំ។';

const ENGLISH_DESCRIPTION =
  'We need a React engineer with TypeScript and Kubernetes experience in Phnom Penh.';

const PARSED = {
  id: 'p1',
  resumeId: 'r1',
  rawText: 'React TypeScript engineer. Proficient in Excel and Word.',
  summary: 'Engineer',
  skills: JSON.stringify(['React', 'Excel']),
  experiences: JSON.stringify([]),
  educations: JSON.stringify([]),
  email: 'a@b.c',
  phone: '123',
  updatedAt: new Date('2026-08-01T00:00:00Z'),
};

function build(over: { requirements?: string[] | null } = {}) {
  const created: Record<string, unknown>[] = [];
  const reports: any = {
    create: jest.fn(async (input: Record<string, unknown>) => {
      created.push(input);
      return 'report-1';
    }),
    findReusable: jest.fn().mockResolvedValue(null),
  };
  const resumes: any = {
    findDefaultByUserId: jest.fn().mockResolvedValue({
      id: 'r1',
      fileName: 'cv.pdf',
      parsingStatus: 'SUCCESS',
      updatedAt: new Date('2026-08-01T00:00:00Z'),
    }),
    findByUserId: jest.fn().mockResolvedValue([]),
  };
  const parsedResumes: any = { findByResumeId: jest.fn().mockResolvedValue(PARSED) };
  const scorer: any = {
    scoreResume: jest.fn().mockResolvedValue({
      atsScore: 60,
      qualityScore: 55,
      breakdown: {},
      suggestions: [],
      scoredBy: 'heuristic',
    }),
  };
  const matchExternalJob: any = {
    execute: jest.fn().mockResolvedValue({
      score: 74,
      breakdown: { skills: 70, experience: 90, location: 80, salary: 50, other: 50 },
      semantic: true,
      companyData: false,
    }),
  };
  const requirements =
    'requirements' in over ? over.requirements : ['Excel', 'Word', 'Teaching'];
  const ai: any = {
    extractJobRequirements: jest.fn(async () => {
      if (requirements === null) throw new Error('AI service unavailable');
      return { requirements, groundedness: 0.9 };
    }),
  };
  const prisma: any = { profile: { findUnique: jest.fn().mockResolvedValue(null) } };

  const service = new MatchReportService(
    reports,
    resumes,
    parsedResumes,
    scorer,
    matchExternalJob,
    ai,
    prisma,
  );
  return { service, created };
}

const payload = (created: Record<string, unknown>[]) =>
  created[0].payload as {
    skills: { available: boolean; reason?: string; hard: unknown[]; soft: unknown[]; missingCount: number };
    matchRate: unknown;
  };

const input = (jobDescription: string) => ({
  externalId: 'bt-1',
  source: 'bongthom',
  title: 'គ្រូបង្រៀនគណិតវិទ្យា',
  company: 'Acme Cambodia',
  location: 'Phnom Penh',
  jobDescription,
});

describe('match report — Khmer postings', () => {
  it('withholds the skills table', async () => {
    const { service, created } = build();
    await service.generate('u1', input(KHMER_DESCRIPTION));

    expect(payload(created).skills.available).toBe(false);
  });

  it('says WHY, so the page can distinguish "not yet" from "try again"', async () => {
    const { service, created } = build();
    await service.generate('u1', input(KHMER_DESCRIPTION));

    expect(payload(created).skills.reason).toBe('LANGUAGE_UNSUPPORTED');
  });

  it('reports no counts rather than a count computed from stray Latin words', async () => {
    // The extractor returned "Excel" and "Word", both of which DO appear in the Khmer
    // text and in the résumé. Before the fix that produced real-looking rows.
    const { service, created } = build();
    await service.generate('u1', input(KHMER_DESCRIPTION));

    const { hard, soft, missingCount } = payload(created).skills;
    expect(hard).toEqual([]);
    expect(soft).toEqual([]);
    expect(missingCount).toBe(0);
  });

  it('STILL shows the match score — it is cross-lingual and evidenced', async () => {
    const { service, created } = build();
    await service.generate('u1', input(KHMER_DESCRIPTION));

    expect(payload(created).matchRate).not.toBeNull();
  });

  it('marks the posting unsupported even when the AI extractor succeeded', async () => {
    // The script is a fact about the POSTING. Checking the AI outcome first would let an
    // outage mask a permanent limitation behind a transient-sounding message.
    const { service, created } = build({ requirements: ['Excel'] });
    await service.generate('u1', input(KHMER_DESCRIPTION));

    expect(payload(created).skills.reason).toBe('LANGUAGE_UNSUPPORTED');
  });
});

describe('match report — English postings are untouched', () => {
  it('still builds a skills table', async () => {
    const { service, created } = build({ requirements: ['React', 'Kubernetes'] });
    await service.generate('u1', input(ENGLISH_DESCRIPTION));

    const skills = payload(created).skills;
    expect(skills.available).toBe(true);
    expect(skills.reason).toBeUndefined();
    expect(skills.hard.length).toBeGreaterThan(0);
  });

  it('reports AI_UNAVAILABLE — not LANGUAGE_UNSUPPORTED — when extraction fails', async () => {
    // The two reasons must not be confusable: one is transient, one is not.
    const { service, created } = build({ requirements: null });
    await service.generate('u1', input(ENGLISH_DESCRIPTION));

    const skills = payload(created).skills;
    expect(skills.available).toBe(false);
    expect(skills.reason).toBe('AI_UNAVAILABLE');
  });
});
