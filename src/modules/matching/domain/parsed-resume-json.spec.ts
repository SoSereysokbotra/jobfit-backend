// Splitting résumé skill entries that are really several skills.
//
// Measured need: résumés group skills on one line behind a label — "Languages: C++,
// Python, TypeScript" — and the model returns the whole line as ONE skill. Nothing
// matches that string: no employer writes it, and the matcher's whole-word test cannot
// see the "Python" inside it, so three real skills evidence nothing.
//
// The prompt was tried first. n=8 runs each on a synthetic CV, qwen3:0.6b:
//   v4  14 of 43 entries unusable, 6 of 8 runs affected
//   v5  12 of 45 entries unusable, 4 of 8 runs affected
// v5 states the rule explicitly with worked examples and still glues them together half
// the time. Splitting on a comma has a guaranteed outcome; asking a 0.6b model to do it
// does not.
//
// The dangerous direction here is OVER-splitting: inventing two skills the candidate
// never claimed is the same class of lie as reporting a match that is not there. Those
// cases are pinned first.

import {
  splitSkillEntry,
  toFieldsOfStudy,
  toProjectTechnologies,
  toSkillList,
} from './parsed-resume-json';

describe('splitSkillEntry', () => {
  describe('what it must NOT split', () => {
    it.each([
      'C++',
      'C#',
      'CI/CD',
      'Node.js',
      '.NET',
      'R&D',
      'Objective-C',
      'Ruby on Rails',
      'PID control',
      'Automotive Engineering Technology',
      'Key Stage 2 mathematics',
    ])('leaves %s alone', (skill) => {
      expect(splitSkillEntry(skill)).toEqual([skill]);
    });

    it('does not split on a slash, because CI/CD is one thing', () => {
      // Slashes are deliberately absent from the separator set. "CI/CD" and "R&D" are
      // single skills, and splitting them would credit the candidate with two.
      expect(splitSkillEntry('CI/CD')).toEqual(['CI/CD']);
    });

    it('does not treat a sentence containing a colon as a labelled list', () => {
      // A label is at most three words. Without that bound this dropped "Led a team of
      // six" and kept only the half after the colon — silently discarding real text.
      const entry = 'Led a team of six: delivered the migration ahead of schedule';
      expect(splitSkillEntry(entry)).toEqual([entry]);
    });

    it('does not split on "and", because Health and Safety is one skill', () => {
      // There is no reliable way to tell "Health and Safety" from "Docker and
      // Kubernetes", so neither is split. "Git, Docker and Kubernetes" therefore yields
      // two entries, the second of which matches nothing — under-crediting the
      // candidate. That is the safe direction: inventing a skill nobody claimed is the
      // failure that makes this feature lie.
      expect(splitSkillEntry('Health and Safety')).toEqual(['Health and Safety']);
      expect(splitSkillEntry('Git, Docker and Kubernetes')).toEqual([
        'Git',
        'Docker and Kubernetes',
      ]);
    });
  });

  describe('what it must split', () => {
    it('drops the label and splits the list', () => {
      expect(splitSkillEntry('Languages: C++, Python, TypeScript')).toEqual([
        'C++',
        'Python',
        'TypeScript',
      ]);
    });

    it('splits a bare comma list with no label', () => {
      expect(splitSkillEntry('Git, Docker, AutoCAD')).toEqual([
        'Git',
        'Docker',
        'AutoCAD',
      ]);
    });

    it('handles semicolons, pipes and bullets', () => {
      expect(splitSkillEntry('Welding; Fabrication | Blueprint reading')).toEqual([
        'Welding',
        'Fabrication',
        'Blueprint reading',
      ]);
    });

    it('strips the Oxford-comma "and" tail', () => {
      expect(splitSkillEntry('Git, Docker, and Kubernetes')).toEqual([
        'Git',
        'Docker',
        'Kubernetes',
      ]);
    });

    it('keeps a dotted or plussed name intact while splitting around it', () => {
      expect(splitSkillEntry('Tools: Node.js, .NET, CI/CD')).toEqual([
        'Node.js',
        '.NET',
        'CI/CD',
      ]);
    });

    it('drops empty fragments from trailing separators', () => {
      expect(splitSkillEntry('Python, , Git,')).toEqual(['Python', 'Git']);
    });
  });
});

describe('toSkillList', () => {
  it('splits every entry of a stored skills column', () => {
    const json = JSON.stringify([
      'Languages: C++, Python',
      'Arduino',
      'Hardware: servo motor, PID control',
    ]);

    expect(toSkillList(json)).toEqual([
      'C++',
      'Python',
      'Arduino',
      'servo motor',
      'PID control',
    ]);
  });

  it('returns nothing for a null or malformed column', () => {
    expect(toSkillList(null)).toEqual([]);
    expect(toSkillList('not json')).toEqual([]);
  });
});

describe('toProjectTechnologies / toFieldsOfStudy', () => {
  it('reads technologies across every project', () => {
    const json = JSON.stringify([
      { name: 'Alarm rig', technologies: ['Arduino', 'servo motor'] },
      { name: 'Site', technologies: ['Next.js'] },
    ]);
    expect(toProjectTechnologies(json)).toEqual(['Arduino', 'servo motor', 'Next.js']);
  });

  it('reads the field of study, skipping entries without one', () => {
    const json = JSON.stringify([
      { institution: 'NPIC', fieldOfStudy: 'Automotive Engineering Technology' },
      { institution: 'A school' },
    ]);
    expect(toFieldsOfStudy(json)).toEqual(['Automotive Engineering Technology']);
  });

  it('survives malformed JSON rather than throwing', () => {
    // Rows written before these columns existed, and rows whose JSON did not survive.
    expect(toProjectTechnologies('{{')).toEqual([]);
    expect(toFieldsOfStudy(null)).toEqual([]);
  });
});
