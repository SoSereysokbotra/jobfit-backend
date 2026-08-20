// src/modules/user/presentation/controllers/profile-reads.authz.spec.ts
//
// The four profile reads under /profiles/:userId used to be @Public(). Together they
// returned phone, full name, photo, bio, location, job preferences, work history,
// education and skills — unauthenticated, keyed by a user id that
// GET /users/email/:email would hand to anyone. That chain (email -> id -> phone) is
// closed by MENTOR_REVIEW_2026-08-18 §3; this file pins the second half of it.
//
// Two things are asserted per route: the @Public() metadata is really gone (so the guard
// demands a token at all), and the handler refuses a caller who is neither the owner nor
// an ADMIN.

import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import type { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { ProfileController } from './profile.controller';
import { SkillsController } from './skills.controller';
import { EducationController } from './education.controller';
import { ExperienceController } from './experience.controller';

const OWNER = 'owner-1';
const principal = (id: string, role = 'JOB_SEEKER') =>
  ({ id, email: `${id}@x.com`, role }) as AuthenticatedUser;

/** Each gated read: how to build its controller, and how to call the list/get handler. */
const READS = [
  {
    name: 'GET /profiles/:userId',
    controller: ProfileController,
    service: () => ({ getProfile: jest.fn().mockResolvedValue({ userId: OWNER }) }),
    build: (svc: unknown) => new ProfileController(svc as never),
    call: (c: ProfileController, caller: AuthenticatedUser) =>
      c.getByUserId(caller, OWNER),
    handler: 'getByUserId',
    probe: (svc: { getProfile: jest.Mock }) => svc.getProfile,
  },
  {
    name: 'GET /profiles/:userId/skills',
    controller: SkillsController,
    service: () => ({ getSkills: jest.fn().mockResolvedValue([]) }),
    build: (svc: unknown) => new SkillsController(svc as never),
    call: (c: SkillsController, caller: AuthenticatedUser) => c.list(caller, OWNER),
    handler: 'list',
    probe: (svc: { getSkills: jest.Mock }) => svc.getSkills,
  },
  {
    name: 'GET /profiles/:userId/education',
    controller: EducationController,
    service: () => ({ getEducations: jest.fn().mockResolvedValue([]) }),
    build: (svc: unknown) => new EducationController(svc as never),
    call: (c: EducationController, caller: AuthenticatedUser) => c.list(caller, OWNER),
    handler: 'list',
    probe: (svc: { getEducations: jest.Mock }) => svc.getEducations,
  },
  {
    name: 'GET /profiles/:userId/experience',
    controller: ExperienceController,
    service: () => ({ getExperiences: jest.fn().mockResolvedValue([]) }),
    build: (svc: unknown) => new ExperienceController(svc as never),
    call: (c: ExperienceController, caller: AuthenticatedUser) => c.list(caller, OWNER),
    handler: 'list',
    probe: (svc: { getExperiences: jest.Mock }) => svc.getExperiences,
  },
] as const;

describe('Profile reads are no longer public', () => {
  const reflector = new Reflector();

  describe.each(READS)('$name', (route) => {
    it('is not @Public()', () => {
      const proto = route.controller.prototype as unknown as Record<
        string,
        () => unknown
      >;
      expect(reflector.get(IS_PUBLIC_KEY, proto[route.handler])).toBeFalsy();
      expect(reflector.get(IS_PUBLIC_KEY, route.controller)).toBeFalsy();
    });

    it('refuses a different logged-in user', async () => {
      const svc = route.service();
      const controller = route.build(svc);
      await expect(
        route.call(controller as never, principal('someone-else')),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // Refused before the read, so it cannot be used as an existence oracle either.
      expect(route.probe(svc as never)).not.toHaveBeenCalled();
    });

    it('refuses an EMPLOYER who is not the owner', async () => {
      // Deliberate: a bare role test would re-open the whole candidate table. When
      // "employer views an applicant" lands (§9) it must check the application link.
      const svc = route.service();
      const controller = route.build(svc);
      await expect(
        route.call(controller as never, principal('emp-1', 'EMPLOYER')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows the owner', async () => {
      const svc = route.service();
      const controller = route.build(svc);
      await route.call(controller as never, principal(OWNER));
      expect(route.probe(svc as never)).toHaveBeenCalledWith(OWNER);
    });

    it('allows an ADMIN', async () => {
      const svc = route.service();
      const controller = route.build(svc);
      await route.call(controller as never, principal('admin-1', 'ADMIN'));
      expect(route.probe(svc as never)).toHaveBeenCalledWith(OWNER);
    });
  });
});
