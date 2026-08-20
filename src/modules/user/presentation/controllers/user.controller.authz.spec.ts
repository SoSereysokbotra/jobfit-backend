// src/modules/user/presentation/controllers/user.controller.authz.spec.ts
//
// Authorization regression tests for MENTOR_REVIEW_2026-08-18 §2: any logged-in user could
// PATCH /users/<their id>/subscription to PROFESSIONAL, or DELETE any account.
//
// These drive the REAL RolesGuard against the REAL decorator metadata on UserController —
// not a re-declaration of the rules — so deleting a @Roles('ADMIN') fails a test. A test
// that asserted the controller body would pass either way; the whole defect was that the
// body was never the thing deciding.

import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from '@common/guards/roles.guard';
import { UserController } from './user.controller';

type Principal = { id: string; role: string } | undefined;

/** Minimal ExecutionContext aimed at one real controller method. */
function contextFor(method: keyof UserController, user: Principal): ExecutionContext {
  return {
    getHandler: () => UserController.prototype[method],
    getClass: () => UserController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const guard = new RolesGuard(new Reflector());
const allows = (method: keyof UserController, user: Principal) =>
  guard.canActivate(contextFor(method, user));

const JOB_SEEKER = { id: 'u1', role: 'JOB_SEEKER' };
const EMPLOYER = { id: 'u2', role: 'EMPLOYER' };
const ADMIN = { id: 'a1', role: 'ADMIN' };

describe('UserController authorization', () => {
  // The four routes the review named. `remove` is covered separately — it is gone.
  const adminOnly: Array<keyof UserController> = [
    'create',
    'list',
    'updateSubscription',
  ];

  describe.each(adminOnly)('%s', (method) => {
    it('refuses a JOB_SEEKER', () => {
      expect(allows(method, JOB_SEEKER)).toBe(false);
    });

    it('refuses an EMPLOYER', () => {
      expect(allows(method, EMPLOYER)).toBe(false);
    });

    it('refuses an unauthenticated caller', () => {
      expect(allows(method, undefined)).toBe(false);
    });

    it('allows an ADMIN', () => {
      expect(allows(method, ADMIN)).toBe(true);
    });
  });

  it('the self-upgrade attack is refused: a user cannot retier their own id', () => {
    // The original exploit: PATCH /users/<my own id>/subscription {"tier":"PROFESSIONAL"}.
    // Owning the id in the URL grants nothing — the decision is the role, not the match.
    expect(allows('updateSubscription', { id: 'u1', role: 'JOB_SEEKER' })).toBe(
      false,
    );
  });

  it('exposes no account-deletion route — that lives only on the audited admin path', () => {
    // DELETE /users/:id was an unaudited duplicate of DELETE /admin/users/:id, which
    // writes USER_ACCOUNT_DELETED. Re-adding it here should fail this test.
    const proto = UserController.prototype as unknown as Record<string, unknown>;
    expect(proto.remove).toBeUndefined();

    const routes = Object.getOwnPropertyNames(UserController.prototype);
    expect(routes).not.toContain('remove');
    expect(routes).not.toContain('delete');
    expect(routes).not.toContain('deleteUser');
  });
});
