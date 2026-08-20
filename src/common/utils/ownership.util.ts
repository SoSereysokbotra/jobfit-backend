// src/common/utils/ownership.util.ts
//
// Row-level ownership checks for routes that carry a user id in the path.
//
// WHY THESE EXIST. The global guards are secure-by-default for AUTHENTICATION only:
// JwtAuthGuard demands a token, and RolesGuard waves through any route with no @Roles()
// metadata (roles.guard.ts:23-25). Neither knows that `:userId` in a path is supposed to
// be *you*. So any route whose target is named by the URL has to say so itself — and
// before it reads or writes anything, so the refusal cannot be timed or distinguished
// from a 404 to probe whether the row exists.
//
// The rule of thumb: an id in a URL is a permission decision you have to remember to
// make; an id from the token is one you cannot forget. Prefer @CurrentUser() where the
// route has no reason to name anyone but the caller.

import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../guards/jwt-auth.guard';

const ADMIN_ROLE = 'ADMIN';

/**
 * "Own record only" — the JWT subject must equal the path id. Admins are NOT exempt:
 * use this for writes where acting as someone else should go through an audited admin
 * route rather than an ordinary one.
 */
export function assertOwner(
  user: AuthenticatedUser,
  userId: string,
  message = 'You can only modify your own profile',
): void {
  if (user.id !== userId) {
    throw new ForbiddenException(message);
  }
}

/**
 * "Own record, or you are an ADMIN" — for reads where support and admin tooling
 * legitimately need to see another user's data.
 *
 * NOTE for the employer flows: when "an employer may view a candidate who applied to
 * their job" lands (MENTOR_REVIEW_2026-08-18 §9), that is a third branch here — it must
 * be a checked relationship (an application linking the two), never a bare role test.
 * `role === 'EMPLOYER'` alone would re-open the whole candidate table.
 */
export function assertSelfOrAdmin(
  user: AuthenticatedUser,
  userId: string,
  message = 'You can only view your own profile',
): void {
  if (user.id !== userId && user.role !== ADMIN_ROLE) {
    throw new ForbiddenException(message);
  }
}
