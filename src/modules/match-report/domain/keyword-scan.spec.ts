// Tests for the keyword counting behind the skills table.
//
// The failure these pin is a column that says the same thing on every row. A C++ Engineer
// report (2026-08-25) printed "×11" against four different requirements, because "c++"
// occurs 11 times in the posting and every requirement mentions it. A count that cannot
// tell one row from another is worse than no count: it looks like information.

import { requirementCount } from './keyword-scan';
import { themeWordsOf } from '@modules/matching/application/services/skill-gap.service';

// Shaped after the real posting: the subject word is everywhere, the specifics are not.
const REQUIREMENTS = [
  'Expert-level proficiency in modern C++ (C++11 and later), including templates, move semantics, smart pointers, and the STL',
  'Hands-on experience with C++ build systems, compilers, linkers, debuggers, and profiling tools',
  'Proven experience conducting detailed C++ code reviews and enforcing coding standards',
  'Strong background in systems programming such as concurrency and memory management',
];

const DESCRIPTION = `
  We are hiring a C++ Engineer. You will write C++ every day: modern C++, C++11 and later.
  C++ templates, C++ move semantics and C++ smart pointers are daily work, and the C++ STL
  is assumed. Our C++ build systems use CMake. C++ code reviews are part of the job.
  Concurrency matters. Concurrency and memory management are the hard parts. Concurrency
  again, because it is that important. Debuggers and linkers are used occasionally.
`;

describe('requirementCount', () => {
  it('does not give every requirement the job-subject frequency', () => {
    const themeWords = themeWordsOf(REQUIREMENTS);
    const counts = REQUIREMENTS.map((r) => requirementCount(r, DESCRIPTION, themeWords));

    // The regression: all four came back 11 (the frequency of "c++").
    expect(new Set(counts).size).toBeGreaterThan(1);
    expect(counts).not.toContain(11);
  });

  it('counts a requirement by its own distinctive term', () => {
    const themeWords = themeWordsOf(REQUIREMENTS);
    // "concurrency" appears three times; it is specific to this requirement.
    expect(
      requirementCount(
        'Strong background in systems programming such as concurrency and memory management',
        DESCRIPTION,
        themeWords,
      ),
    ).toBe(3);
  });

  it('never returns 0 — the requirement came out of this description', () => {
    expect(requirementCount('Something not mentioned at all', DESCRIPTION)).toBe(1);
  });

  it('returns 1 when a requirement is nothing but the job subject', () => {
    const themeWords = new Set(['c++', 'engineer']);
    expect(requirementCount('C++ engineer', DESCRIPTION, themeWords)).toBe(1);
  });

  it('still counts normally when no theme words are supplied', () => {
    // Back-compatible: the old single-argument behaviour is unchanged.
    expect(requirementCount('Concurrency', DESCRIPTION)).toBe(3);
  });
});
