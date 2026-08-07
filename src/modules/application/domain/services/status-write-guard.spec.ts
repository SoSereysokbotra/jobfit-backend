// The guard that keeps the chokepoint a chokepoint.
//
// A convention living only in a comment is what produced the situation this refactor
// fixed: nine places wrote application status, seven of them validated nothing, and each
// author had no way to know the rule existed. This test is how the tenth author finds out.
//
// It is a source scan rather than a lint rule on purpose. An AST rule matches shapes and
// misses `data: buildPayload()`, updateMany, and raw SQL; a text scan catches those. It
// also runs inside the suite everyone already runs, and cannot be silenced with an
// inline disable comment — going around it means editing ALLOWED below, deliberately,
// where a reviewer will see it.

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

const SRC = join(__dirname, '..', '..', '..', '..');

/**
 * Files permitted to write Application.status directly, and why.
 *
 * This list is asserted to be exactly these two entries. Adding a third is a deliberate,
 * reviewable act — which is the entire point.
 */
const ALLOWED: Record<string, string> = {
  'modules/application/domain/services/application-transition.service.ts':
    'The chokepoint itself — the one road every status change takes.',
  'modules/application/infrastructure/repositories/application.repository.ts':
    'Sets the opening status on CREATE only. A new application has no previous state to ' +
    'transition from; its update branch deliberately omits status.',
};

/** Prisma writes to the Application model that could carry a status. */
const WRITE_CALL = /\.application\.(update|updateMany|upsert)\s*\(/g;

const tsFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) return [];
    return [full];
  });

/** The text of a call's argument list, by matching parentheses from `open`. */
const argumentsAt = (source: string, open: number): string => {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '(') depth++;
    else if (source[i] === ')') {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
};

describe('Application.status has exactly one road in', () => {
  const files = tsFiles(SRC);

  it('finds source to scan (the scan is worthless if the walk is broken)', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(
      files.some((f) => f.endsWith(join('services', 'application-transition.service.ts'))),
    ).toBe(true);
  });

  it('has no Prisma status write outside the transition service', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(SRC, file).split(sep).join('/');
      if (ALLOWED[rel]) continue;

      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(WRITE_CALL)) {
        const open = match.index! + match[0].length - 1;
        if (/\bstatus\s*:/.test(argumentsAt(source, open))) {
          const line = source.slice(0, match.index!).split('\n').length;
          offenders.push(`${rel}:${line} — ${match[1]} writes status`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('has no raw SQL writing the column either', () => {
    const offenders: string[] = [];

    for (const file of files) {
      const rel = relative(SRC, file).split(sep).join('/');
      if (ALLOWED[rel]) continue;

      const source = readFileSync(file, 'utf8');
      // UPDATE ... applications ... SET ... status — the escape hatch an AST rule misses.
      if (/UPDATE\s+"?applications"?[\s\S]{0,200}?\bSET\b[\s\S]{0,200}?\bstatus\b/i.test(source)) {
        offenders.push(`${rel} — raw UPDATE on applications.status`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('keeps the exemption list to the two files that earned it', () => {
    // If this fails, someone widened the guard. That is allowed — but it should be a
    // decision someone made, not a side effect of getting a test to pass.
    expect(Object.keys(ALLOWED).sort()).toEqual([
      'modules/application/domain/services/application-transition.service.ts',
      'modules/application/infrastructure/repositories/application.repository.ts',
    ]);
  });

  it('catches a bypass when one is introduced', () => {
    // Proving the scan works, rather than trusting that an empty result means clean.
    const planted = `
      await this.prisma.application.update({
        where: { id },
        data: { status: 'ACCEPTED' },
      });
    `;
    const match = [...planted.matchAll(WRITE_CALL)][0];
    const open = match.index! + match[0].length - 1;

    expect(/\bstatus\s*:/.test(argumentsAt(planted, open))).toBe(true);
  });

  it('does not flag a write that leaves status alone', () => {
    const benign = `
      await this.prisma.application.update({
        where: { id },
        data: { coverLetter: result.coverLetter },
      });
    `;
    const match = [...benign.matchAll(WRITE_CALL)][0];
    const open = match.index! + match[0].length - 1;

    expect(/\bstatus\s*:/.test(argumentsAt(benign, open))).toBe(false);
  });
});
