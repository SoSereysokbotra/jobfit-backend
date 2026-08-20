import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../guards/jwt-auth.guard';
import { assertOwner, assertSelfOrAdmin } from './ownership.util';

const user = (id: string, role = 'JOB_SEEKER') =>
  ({ id, email: `${id}@x.com`, role }) as AuthenticatedUser;

describe('assertOwner', () => {
  it('passes for the owner', () => {
    expect(() => assertOwner(user('u1'), 'u1')).not.toThrow();
  });

  it('throws for anyone else', () => {
    expect(() => assertOwner(user('u1'), 'u2')).toThrow(ForbiddenException);
  });

  it('does NOT exempt admins — writes as another user go through the audited path', () => {
    expect(() => assertOwner(user('a1', 'ADMIN'), 'u2')).toThrow(ForbiddenException);
  });
});

describe('assertSelfOrAdmin', () => {
  it('passes for the owner', () => {
    expect(() => assertSelfOrAdmin(user('u1'), 'u1')).not.toThrow();
  });

  it('passes for an ADMIN reading someone else', () => {
    expect(() => assertSelfOrAdmin(user('a1', 'ADMIN'), 'u2')).not.toThrow();
  });

  it('throws for a different JOB_SEEKER', () => {
    expect(() => assertSelfOrAdmin(user('u1'), 'u2')).toThrow(ForbiddenException);
  });

  it('throws for an EMPLOYER — a bare role is not a relationship', () => {
    // If this ever passes, every candidate profile is readable by every employer.
    expect(() => assertSelfOrAdmin(user('e1', 'EMPLOYER'), 'u2')).toThrow(
      ForbiddenException,
    );
  });

  it('is not fooled by a lowercase role claim', () => {
    expect(() => assertSelfOrAdmin(user('a1', 'admin'), 'u2')).toThrow(
      ForbiddenException,
    );
  });

  it('carries the caller-supplied message', () => {
    expect(() => assertSelfOrAdmin(user('u1'), 'u2', 'nope')).toThrow('nope');
  });
});
