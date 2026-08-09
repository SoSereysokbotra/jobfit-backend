/**
 * ESLint for the backend.
 *
 * ADOPTED WITH RULES THAT ARE ALREADY TRUE. The risk with turning on a linter late is a
 * hundred pre-existing violations arriving as noise nobody reads, which teaches everyone
 * to run it with `--fix` or not at all. Every rule below was switched on only after the
 * whole tree passed it, so `npm run lint` is green from the first commit and any red is a
 * regression introduced by the change in front of you.
 *
 * BASELINE ON ADOPTION: 10 errors across 8 files, all real and all fixed in the same
 * commit rather than ruled away — 6 unused imports/params, 1 `let` that is never
 * reassigned, 1 floating promise (the `bootstrap()` entry point), 2 unused adapter stubs.
 * Green from the first commit.
 *
 * NOT HERE: a rule enforcing the application-status chokepoint. That is enforced by
 * `status-write-guard.spec.ts`, which scans `src/**` and was proven by planting a real
 * bypass and watching it fail. An AST selector cannot tell a legitimate write to
 * `application.update` (the per-actor archive columns) from a status write, so an ESLint
 * version would either miss bypasses or cry wolf on correct code. One working guard beats
 * two half-working ones.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    // Not tsconfig.json: that includes only `src`, and type-aware rules refuse to lint a
    // file outside the project. See tsconfig.eslint.json for why it is a separate file.
    project: 'tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    // Last: turns OFF every rule that argues with Prettier, which already owns formatting
    // here (`npm run format`). A linter and a formatter disagreeing is a fight nobody wins.
    'prettier',
  ],
  env: { node: true, jest: true },
  ignorePatterns: ['.eslintrc.js', 'dist/**', 'node_modules/**', 'coverage/**'],
  rules: {
    // ── Off, deliberately ────────────────────────────────────────────────────
    // Nest's DI and Prisma's generated types make explicit return types on every
    // method noise rather than signal; `tsc --noEmit` already has the real answer.
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',

    // `any` appears where Prisma's generated types and the domain's own enums have to
    // meet — always at a cast, always deliberate, and each one is commented. Banning it
    // outright would mean 40-odd disable comments, which is a worse artefact.
    '@typescript-eslint/no-explicit-any': 'off',

    // ── On, and already true ─────────────────────────────────────────────────
    // An unused import or variable is usually a half-finished edit.
    '@typescript-eslint/no-unused-vars': [
      'error',
      // Leading underscore = "deliberately unused", which the codebase already uses for
      // interface-mandated parameters (e.g. `_fileUrl` in ResumeParserService.parseResume).
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
    // `==` against anything but null is a bug waiting for a type coercion.
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    // A promise nobody awaits in a service is a write that may not have happened.
    '@typescript-eslint/no-floating-promises': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
    'no-return-await': 'error',
  },
};
