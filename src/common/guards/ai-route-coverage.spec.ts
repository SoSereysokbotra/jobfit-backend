// Which routes are rate limited, asserted against the REAL decorator metadata.
//
// MENTOR_REVIEW_2026-08-18 §11: "No AI route uses @RateLimit... all authenticated, all
// unlimited." The defect was never in a handler body — it was in what the route did or
// did not DECLARE. So this reads the decorators the same way Nest does at runtime. A test
// that called the handlers would have passed happily both before and after the fix.
//
// It is written as an INVENTORY rather than a set of per-route assertions on purpose: a
// new AI route added without a limiter has to fail something, and a test that only checks
// today's routes cannot do that.

import { GUARDS_METADATA } from '@nestjs/common/constants';
// Not re-exported from the package index; import the constant from its own module.
import { THROTTLER_SKIP } from '@nestjs/throttler/dist/throttler.constants';
import { AiThrottlerGuard } from './ai-throttler.guard';
import { AI_THROTTLER_NAMES, THROTTLERS } from '@config/throttler.config';
import { GenerationController } from '@modules/generation/generation.controller';
import { MatchReportController } from '@modules/match-report/presentation/controllers/match-report.controller';
import { MatchingController } from '@modules/matching/presentation/controllers/matching.controller';
import { ResumeController } from '@modules/resume/presentation/controllers/resume.controller';

const ALL_NAMES = Object.values(THROTTLERS).map((t) => t.name);

type Ctor = new (...args: never[]) => object;

function handlers(controller: Ctor): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (name) => name !== 'constructor' && typeof controller.prototype[name] === 'function',
  );
}

/** Guards attached to the route or, failing that, inherited from the class. */
function guardsFor(controller: Ctor, handler: string): unknown[] {
  const onRoute: unknown[] =
    Reflect.getMetadata(GUARDS_METADATA, controller.prototype[handler]) ?? [];
  const onClass: unknown[] = Reflect.getMetadata(GUARDS_METADATA, controller) ?? [];
  return [...onRoute, ...onClass];
}

function hasAiGuard(controller: Ctor, handler: string): boolean {
  return guardsFor(controller, handler).includes(AiThrottlerGuard);
}

/**
 * The limiters left ACTIVE on a route.
 *
 * @RateLimit works by skipping every OTHER named throttler, so "which limiter applies"
 * is the complement of the skip flags — the same computation the guard performs.
 *
 * Note the key shape: SkipThrottle writes ONE metadata key PER throttler name
 * (`THROTTLER:SKIP` + name), not a single map under `THROTTLER:SKIP`. Reading it as a map
 * returns undefined for every route, which makes "this route is unlimited" assertions
 * pass whether or not they are true — so the per-name read is load-bearing, not a detail.
 */
function activeLimiters(controller: Ctor, handler: string): string[] {
  const target = controller.prototype[handler];
  return ALL_NAMES.filter(
    (name) => Reflect.getMetadata(THROTTLER_SKIP + name, target) !== true,
  );
}

const CONTROLLERS: Array<[string, Ctor]> = [
  ['GenerationController', GenerationController as unknown as Ctor],
  ['MatchReportController', MatchReportController as unknown as Ctor],
  ['MatchingController', MatchingController as unknown as Ctor],
  ['ResumeController', ResumeController as unknown as Ctor],
];

/** Every route that reaches the AI service, and the limiter it must carry. */
const AI_ROUTES: Array<[string, Ctor, string, string]> = [
  ['GenerationController', GenerationController as unknown as Ctor, 'coverLetter', THROTTLERS.aiGenerate.name],
  ['GenerationController', GenerationController as unknown as Ctor, 'interview', THROTTLERS.aiGenerate.name],
  ['GenerationController', GenerationController as unknown as Ctor, 'extensionCoverLetter', THROTTLERS.aiGenerate.name],
  ['GenerationController', GenerationController as unknown as Ctor, 'extensionInterview', THROTTLERS.aiGenerate.name],
  ['MatchReportController', MatchReportController as unknown as Ctor, 'create', THROTTLERS.aiReport.name],
  ['MatchingController', MatchingController as unknown as Ctor, 'list', THROTTLERS.aiRecommendations.name],
  ['MatchingController', MatchingController as unknown as Ctor, 'byJob', THROTTLERS.aiMatch.name],
  ['ResumeController', ResumeController as unknown as Ctor, 'upload', THROTTLERS.aiResume.name],
  ['ResumeController', ResumeController as unknown as Ctor, 'setDefault', THROTTLERS.aiResume.name],
  ['ResumeController', ResumeController as unknown as Ctor, 'atsScore', THROTTLERS.aiResume.name],
  ['ResumeController', ResumeController as unknown as Ctor, 'qualityScore', THROTTLERS.aiResume.name],
  ['ResumeController', ResumeController as unknown as Ctor, 'scores', THROTTLERS.aiResume.name],
  ['ResumeController', ResumeController as unknown as Ctor, 'score', THROTTLERS.aiResume.name],
];

describe('AI route rate-limit coverage', () => {
  describe.each(AI_ROUTES)('%s.%s', (_c, controller, handler, expected) => {
    it('is guarded by AiThrottlerGuard', () => {
      expect(hasAiGuard(controller, handler)).toBe(true);
    });

    it(`is limited by exactly one limiter: ${expected}`, () => {
      // Exactly one: two active limiters means the tighter one silently wins and the
      // documented ceiling is not the real ceiling.
      expect(activeLimiters(controller, handler)).toEqual([expected]);
    });
  });

  it('limits every AI route with an AI limiter, never an auth one', () => {
    for (const [, controller, handler] of AI_ROUTES) {
      const [active] = activeLimiters(controller, handler);
      expect(AI_THROTTLER_NAMES).toContain(active);
    }
  });

  // THE INVARIANT. A guarded route with no @RateLimit is subject to EVERY named
  // throttler, including `resend` at 3 per 15 minutes — so forgetting the decorator does
  // not fail open, it fails absurdly closed, and only in production where SCALE is 1.
  it('never guards a route without also naming its limiter', () => {
    const offenders: string[] = [];
    for (const [name, controller] of CONTROLLERS) {
      for (const handler of handlers(controller)) {
        if (!hasAiGuard(controller, handler)) continue;
        const active = activeLimiters(controller, handler);
        if (active.length !== 1) offenders.push(`${name}.${handler} -> [${active}]`);
      }
    }
    expect(offenders).toEqual([]);
  });

  // The reads that must stay unlimited. `scout` is the interesting one: §7 changed it to
  // score live, which LOOKS expensive, but scoreJobs never calls the AI service. Pinning
  // it here records that as a checked fact rather than an assumption.
  it.each([
    ['MatchingController.scout', MatchingController as unknown as Ctor, 'scout'],
    ['MatchingController.matchForJob', MatchingController as unknown as Ctor, 'matchForJob'],
    ['MatchingController.skillGapForJob', MatchingController as unknown as Ctor, 'skillGapForJob'],
    ['MatchReportController.findOne', MatchReportController as unknown as Ctor, 'findOne'],
    ['ResumeController.list', ResumeController as unknown as Ctor, 'list'],
    ['ResumeController.remove', ResumeController as unknown as Ctor, 'remove'],
  ])('leaves %s unthrottled — it does not reach the AI service', (_n, controller, handler) => {
    expect(hasAiGuard(controller, handler)).toBe(false);
  });
});
