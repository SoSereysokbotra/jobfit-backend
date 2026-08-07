// Tests for SkillGapService.
//
// The dangerous failure here is a FALSE match: telling a candidate their CV covers a
// requirement it does not. A naive substring test makes "Go" match "Google" and "React"
// match "Reactive", which silently inflates coverage and hides the gaps the feature exists
// to surface. Those cases are pinned below.

import { SkillGapService } from './skill-gap.service';

describe('SkillGapService', () => {
  const build = (
    requirements: string[] | null,
    skills: string[] | null,
    extractedRequirements: string[] = [],
  ) => {
    const prisma: any = {
      job: {
        findUnique: jest.fn().mockResolvedValue(
          requirements === null ? null : { requirements, extractedRequirements },
        ),
      },
      resume: {
        findFirst: jest.fn().mockResolvedValue(
          skills === null ? null : { parsedData: { skills: JSON.stringify(skills) } },
        ),
      },
    };
    return new SkillGapService(prisma as never);
  };

  it('splits requirements into matched and missing', async () => {
    const service = build(
      [
        '3+ years of experience with Docker',
        'Strong knowledge of Kubernetes',
        'Proficient in TypeScript',
      ],
      ['Docker', 'TypeScript'],
    );

    const result = await service.analyse('u1', 'j1');

    expect(result.status).toBe('OK');
    expect(result.matchedCount).toBe(2);
    expect(result.missing).toEqual(['Strong knowledge of Kubernetes']);
  });

  it('reports which skill matched each requirement', async () => {
    const service = build(['Experience with Docker and AWS'], ['Docker', 'AWS', 'React']);

    const { requirements } = await service.analyse('u1', 'j1');

    expect(requirements[0].matchedSkills).toEqual(['Docker', 'AWS']);
  });

  it('quotes requirements verbatim, never paraphrased', async () => {
    const text = '5+ years building distributed systems, ideally in Go';
    const service = build([text], ['Go']);

    const { requirements } = await service.analyse('u1', 'j1');

    expect(requirements[0].text).toBe(text);
  });

  // ── false matches: the failure mode that makes this feature lie ────────────

  it('does not match "Go" against "Google"', async () => {
    const service = build(['Experience with Google Cloud Platform'], ['Go']);

    const result = await service.analyse('u1', 'j1');

    expect(result.matchedCount).toBe(0);
    expect(result.missing).toHaveLength(1);
  });

  it('does not match "React" against "Reactive"', async () => {
    const service = build(['Familiarity with Reactive programming'], ['React']);

    expect((await service.analyse('u1', 'j1')).matchedCount).toBe(0);
  });

  it('still matches skills containing punctuation', async () => {
    // \b is meaningless next to "+" or "/", so those ends must not be anchored.
    const service = build(
      ['Experience with C++ required', 'CI/CD pipelines', 'Built on .NET'],
      ['C++', 'CI/CD', '.NET'],
    );

    expect((await service.analyse('u1', 'j1')).matchedCount).toBe(3);
  });

  it('ignores one-character skills rather than matching them everywhere', async () => {
    const service = build(['Strong communication skills'], ['C']);

    expect((await service.analyse('u1', 'j1')).matchedCount).toBe(0);
  });

  it('matches case-insensitively', async () => {
    const service = build(['deep knowledge of KUBERNETES'], ['kubernetes']);

    expect((await service.analyse('u1', 'j1')).matchedCount).toBe(1);
  });

  // ── the two empty cases, which must not look alike ─────────────────────────

  it('flags a job that listed no requirements instead of implying a perfect fit', async () => {
    const service = build([], ['Docker']);

    const result = await service.analyse('u1', 'j1');

    // `missing` is empty here AND when the CV covers everything. Reporting them the same
    // way would tell the user they match a job we know nothing about.
    expect(result.status).toBe('JOB_HAS_NO_REQUIREMENTS');
    expect(result.missing).toEqual([]);
  });

  it('flags a missing résumé rather than reporting every requirement as a real gap', async () => {
    const service = build(['Docker', 'Kubernetes'], null);

    const result = await service.analyse('u1', 'j1');

    expect(result.status).toBe('NO_PARSED_RESUME');
    expect(result.missing).toHaveLength(2);
    expect(result.skillsConsidered).toEqual([]);
  });

  it('treats an unknown job as having no requirements', async () => {
    const service = build(null, ['Docker']);

    expect((await service.analyse('u1', 'missing')).status).toBe(
      'JOB_HAS_NO_REQUIREMENTS',
    );
  });

  // ── partial matching of multi-word skills ──────────────────────────────────
  //
  // Measured failure this fixes: on a Manufacturing/Automotive posting, a candidate with
  // "Automotive Engineering Technology" and "Project Management" matched 0 of 10
  // requirements — the whole phrase never appears verbatim inside a long requirement
  // sentence, while "Automotive" and "Management" were both literally present.

  it('matches a multi-word skill on a distinctive word', async () => {
    const service = build(
      ['Deep understanding of KPIs in the Automotive/Manufacturing Industry'],
      ['Automotive Engineering Technology'],
    );

    const result = await service.analyse('u1', 'j1');

    expect(result.matchedCount).toBe(1);
    expect(result.requirements[0].matchQuality).toBe('PARTIAL');
  });

  it('labels a verbatim hit EXACT, not PARTIAL', async () => {
    const service = build(['3+ years with Docker'], ['Docker']);

    expect((await service.analyse('u1', 'j1')).requirements[0].matchQuality).toBe('EXACT');
  });

  it('prefers the exact match when both are available', async () => {
    const service = build(
      ['Project Management and Docker experience'],
      ['Docker', 'Project Management'],
    );

    const [req] = (await service.analyse('u1', 'j1')).requirements;

    // "Project Management" is present verbatim too, so this is EXACT — reporting it as
    // PARTIAL would understate what the CV actually evidences.
    expect(req.matchQuality).toBe('EXACT');
  });

  it('does not let a word that is the job’s subject carry a partial match', async () => {
    // Measured failure: on a Welding Engineer posting "welding" appears in most
    // requirements, so "Welding Techniques (MIG, TIG…)" partial-matched a DEGREE, a
    // CERTIFICATION and an AUTOMATION requirement — none of which the skill evidences.
    // A word repeated through the list describes the job, not any one requirement.
    const service = build(
      [
        'Bachelor’s degree in Welding Engineering or a related field',
        'Certification as a Welding Inspector (CWI)',
        'Experience with automation and robotic welding systems',
        'Knowledge of Lean Manufacturing methodologies',
      ],
      ['Welding Techniques (MIG, TIG, SMAW, FCAW)'],
    );

    const result = await service.analyse('u1', 'j1');

    expect(result.matchedCount).toBe(0);
  });

  it('still partial-matches on a word that appears in only one requirement', async () => {
    // The rare-word case must survive the theme-word rule: "Automotive" appearing once
    // across ten requirements is a real discriminator.
    const service = build(
      [
        'Deep understanding of KPIs in the Automotive/Manufacturing Industry',
        'Proven ability to build trusted relationships with stakeholders',
        'Ability to adapt to a fast moving environment',
        'Collaboration with partners and virtual teams',
      ],
      ['Automotive Engineering Technology'],
    );

    const result = await service.analyse('u1', 'j1');

    expect(result.matchedCount).toBe(1);
    expect(result.requirements[0].matchQuality).toBe('PARTIAL');
  });

  it('never treats a word occurring once as the job’s subject', async () => {
    // With very few requirements a single occurrence can exceed the percentage
    // threshold, so the rule also requires the word to appear at least twice.
    const service = build(
      ['Deep knowledge of the Automotive Industry'],
      ['Automotive Engineering Technology'],
    );

    expect((await service.analyse('u1', 'j1')).matchedCount).toBe(1);
  });

  it('does NOT partial-match on generic résumé filler', async () => {
    // The failure that makes the feature lie: "Technical Skills" must not match every
    // requirement that happens to contain the word "skills".
    const service = build(
      ['Strong interpersonal skills and excellent communication'],
      ['Technical Skills'],
    );

    expect((await service.analyse('u1', 'j1')).matchedCount).toBe(0);
  });

  it('does not partial-match single-token skills', async () => {
    // "Go" has no parts; splitting single tokens would also break C++ / CI/CD / .NET.
    const service = build(['Experience with Google Cloud'], ['Go']);

    expect((await service.analyse('u1', 'j1')).matchedCount).toBe(0);
  });

  it('still respects word boundaries when matching partially', async () => {
    const service = build(['Familiarity with Reactive programming'], ['React Development']);

    expect((await service.analyse('u1', 'j1')).matchedCount).toBe(0);
  });

  it('leaves matchQuality unset for a genuine gap', async () => {
    const service = build(['Kubernetes experience required'], ['Docker']);

    const [req] = (await service.analyse('u1', 'j1')).requirements;
    expect(req.matchedSkills).toEqual([]);
    expect(req.matchQuality).toBeUndefined();
  });

  // ── AI-extracted fallback ──────────────────────────────────────────────────

  it('falls back to AI-extracted requirements when the employer wrote none', async () => {
    const service = build([], ['Docker'], ['Docker experience', 'Kubernetes experience']);

    const result = await service.analyse('u1', 'j1');

    expect(result.status).toBe('OK');
    expect(result.requirementsSource).toBe('AI_EXTRACTED');
    expect(result.missing).toEqual(['Kubernetes experience']);
  });

  it('prefers employer-authored requirements over AI-extracted ones', async () => {
    // A human's words are authoritative; a model's reading must never replace them.
    const service = build(['Rust experience'], ['Docker'], ['Docker experience']);

    const result = await service.analyse('u1', 'j1');

    expect(result.requirementsSource).toBe('EMPLOYER');
    expect(result.requirements.map((r) => r.text)).toEqual(['Rust experience']);
  });

  it('reports NONE when neither source has requirements', async () => {
    const service = build([], ['Docker'], []);

    const result = await service.analyse('u1', 'j1');

    expect(result.status).toBe('JOB_HAS_NO_REQUIREMENTS');
    expect(result.requirementsSource).toBe('NONE');
  });

  it('ignores blank requirement entries', async () => {
    const service = build(['  ', 'Docker experience'], ['Docker']);

    const result = await service.analyse('u1', 'j1');

    expect(result.requirements).toHaveLength(1);
    expect(result.matchedCount).toBe(1);
  });
});
