// Tests for degree/language requirement reading.
//
// Every posting quoted here is REAL — from adverts scanned during development — because
// the failure modes only show up in real wording. The dangerous one is inventing a
// requirement: telling someone they need a degree for a job that advertises the opposite
// is worse than saying nothing.

import { checkHardRequirements, findHardRequirements } from './hard-requirements';

const NO_CV = { rawText: null, educations: [], skills: [] };

describe('findHardRequirements', () => {
  it('reads a degree bar from a real posting', () => {
    // NagaWorld, Food & Beverage Manager.
    const found = findHardRequirements([
      "Bachelor's degree in hospitality management or equivalent education required",
    ]);
    expect(found).toEqual([
      expect.objectContaining({ kind: 'DEGREE', label: "Bachelor's degree" }),
    ]);
  });

  it('reads language bars from a real posting', () => {
    // NagaWorld again.
    const found = findHardRequirements(['English and Mandarin Language proficiency']);
    expect(found.map((r) => r.label).sort()).toEqual(['English', 'Mandarin']);
    expect(found.every((r) => r.kind === 'LANGUAGE')).toBe(true);
  });

  it('reads a CEFR level as a language bar', () => {
    // SME Careers, C++ Engineer.
    const found = findHardRequirements([
      'Minimum C1 English proficiency (written and spoken), with the ability to write clear technical explanations',
    ]);
    expect(found).toEqual([
      expect.objectContaining({ kind: 'LANGUAGE', label: 'English' }),
    ]);
  });

  it('does NOT invent a degree the posting explicitly waives', () => {
    // TELUS: the whole pitch is that no degree is needed. Reporting one here would be
    // the worst kind of wrong — confident and backwards.
    const found = findHardRequirements([
      "You don't need a technical degree or previous experience in AI to succeed here.",
    ]);
    expect(found).toEqual([]);
  });

  it('reads a bar stated as a bare bullet, with no requirement word', () => {
    // VERBATIM from a live JobNet advert (DHL Express, Procurement Officer). The word
    // "required" appears nowhere near it — the "Requirements:" heading carries that, and
    // headings are not part of the bullet. An earlier rule demanded a requirement word in
    // the same sentence and found NOTHING here, which is how most postings are written.
    const found = findHardRequirements([
      "● Bachelor's degree in Accounting, Finance, Business, or a related field ● Proven experience in accounting or procurement",
    ]);
    expect(found).toEqual([
      expect.objectContaining({ kind: 'DEGREE', label: "Bachelor's degree" }),
    ]);
  });

  it('quotes only the bullet that stated the bar, not the whole list', () => {
    const [found] = findHardRequirements([
      "● Bachelor's degree in Accounting ● Proven experience in procurement ● Strong Excel",
    ]);
    expect(found.quote).toContain('Accounting');
    expect(found.quote).not.toContain('Excel');
  });

  it('does not let a hedge in one bullet cancel a bar in another', () => {
    const found = findHardRequirements([
      "● Bachelor's degree in Engineering ● A master's degree is a plus",
    ]);
    expect(found.map((r) => r.label)).toEqual(["Bachelor's degree"]);
  });

  it('ignores a degree mentioned without a requirement word', () => {
    expect(findHardRequirements(['A degree is a plus, but we care more about your work'])).toEqual(
      [],
    );
  });

  it('ignores a language mentioned for another reason', () => {
    // "English-language guidelines" is not a proficiency bar on its own.
    expect(findHardRequirements(['Our documentation lives on an English website'])).toEqual([]);
  });

  it('asks for a language once however often the posting names it', () => {
    const found = findHardRequirements([
      'Fluent English required',
      'English proficiency is a must',
      'Written English must be strong',
    ]);
    expect(found).toHaveLength(1);
  });
});

describe('checkHardRequirements', () => {
  const REQS = findHardRequirements([
    "Bachelor's degree in Computer Science required",
    'Native Indonesian speaker required',
  ]);

  it('says "cannot tell" when there is no parsed CV', () => {
    // Never "you don't have it" — the user simply hasn't uploaded anything readable.
    expect(checkHardRequirements(REQS, NO_CV).every((r) => r.met === null)).toBe(true);
  });

  it('marks a language met only when the CV names it', () => {
    const cv = {
      rawText: 'Fluent in Khmer and English. Built React applications.',
      educations: [{ fieldOfStudy: 'Computer Science' }],
      skills: ['React'],
    };
    const checked = checkHardRequirements(REQS, cv);
    expect(checked.find((r) => r.label === 'Indonesian')?.met).toBe(false);
    expect(checked.find((r) => r.kind === 'DEGREE')?.met).toBe(true);
  });

  it('keeps the posting’s own sentence so the reader can overrule us', () => {
    const checked = checkHardRequirements(REQS, NO_CV);
    expect(checked[0].quote).toContain("Bachelor's degree");
  });
});
