// src/modules/user/presentation/controllers/user.controller.authz.spec.ts
//
// Authorization regression tests for MENTOR_REVIEW_2026-08-18 §2 and §3:
//   §2 — any logged-in user could PATCH /users/<their id>/subscription to PROFESSIONAL,
//        or DELETE any account.
//   §3 — GET /users/email/:email was @Public() (an account-existence oracle),
//        GET /users/:id let any authenticated user read any record, and CreateUserDto
//        accepted role: ADMIN.
//
// These drive the REAL RolesGuard against the REAL decorator metadata on UserController —
// not a re-declaration of the rules — so deleting a @Roles('ADMIN') fails a test. A test
// that asserted the controller body would pass either way; the whole defect was that the
// body was never the thing deciding.

import { Reflector } from '@nestjs/core';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import type { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { CreateUserDto } from '../../application/dtos/create-user.dto';
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
    'getByEmail',
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

  // ── §3: nothing on this controller may be reachable without a token ───────────
  describe('public surface', () => {
    const reflector = new Reflector();
    const handlers = Object.getOwnPropertyNames(UserController.prototype).filter(
      (name) => name !== 'constructor',
    );

    it.each(handlers)('%s is not @Public()', (name) => {
      const proto = UserController.prototype as unknown as Record<
        string,
        () => unknown
      >;
      // GET /users/email/:email was @Public(): an unauthenticated caller could confirm
      // whether an address had an account and read its id, role and subscriptionTier.
      expect(reflector.get(IS_PUBLIC_KEY, proto[name])).toBeFalsy();
    });

    it('is not @Public() at the controller level either', () => {
      expect(reflector.get(IS_PUBLIC_KEY, UserController)).toBeFalsy();
    });
  });

  // ── §3: GET /users/:id — own record, or ADMIN ────────────────────────────────
  describe('getById ownership', () => {
    // Only the ownership branch is under test, so the service is never reached on the
    // refusal paths; it returns a bare entity-shaped object on the allowed ones.
    const build = () => {
      const userService = {
        getUserById: jest.fn().mockResolvedValue({
          id: 'target',
          email: 't@x.com',
          role: 'JOB_SEEKER',
          subscriptionTier: 'FREE',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      };
      return {
        controller: new UserController(userService as never),
        userService,
      };
    };

    const principal = (id: string, role: string) =>
      ({ id, email: `${id}@x.com`, role }) as AuthenticatedUser;

    it('refuses reading another user’s record', async () => {
      const { controller, userService } = build();
      await expect(
        controller.getById(principal('u1', 'JOB_SEEKER'), 'target'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // Refused before the lookup — no existence oracle via timing or 404-vs-403.
      expect(userService.getUserById).not.toHaveBeenCalled();
    });

    it('refuses an EMPLOYER reading someone else', async () => {
      const { controller } = build();
      await expect(
        controller.getById(principal('e1', 'EMPLOYER'), 'target'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows reading your own record', async () => {
      const { controller, userService } = build();
      await controller.getById(principal('target', 'JOB_SEEKER'), 'target');
      expect(userService.getUserById).toHaveBeenCalledWith('target');
    });

    it('allows an ADMIN to read anyone', async () => {
      const { controller, userService } = build();
      await controller.getById(principal('a1', 'ADMIN'), 'target');
      expect(userService.getUserById).toHaveBeenCalledWith('target');
    });
  });

  // ── §3: role is not a request field ──────────────────────────────────────────
  it('CreateUserDto carries no role field', () => {
    // "Create an ADMIN at an address I control, then claim it via forgot-password" was a
    // working escalation once §1 made password-reset mail actually deliver.
    const dto = new CreateUserDto();
    expect('role' in dto).toBe(false);

    // At runtime the global ValidationPipe (main.ts:41-46) runs whitelist +
    // forbidNonWhitelisted, so a body carrying `role` is now a 400 rather than a silent
    // strip. This assertion pins the shape itself, so the protection does not depend on
    // that pipe configuration staying put.
    expect(Object.keys(new CreateUserDto())).not.toContain('role');
  });
});
