// Optimistic-concurrency tests (PWA offline, Phase 4).
//
// Two layers are covered:
//   1. The real ExperienceService running over an in-memory repository, so "the update was
//      NOT applied" is asserted against stored state rather than against a mock's call log.
//   2. AllExceptionsFilter, because it normalises every error down to
//      { statusCode, timestamp, path, message } — without the passthrough added in this
//      phase the two versions a 409 has to carry would be silently discarded.

import { NotFoundException } from '@nestjs/common';

import { ExperienceService } from '@modules/user/application/services/experience.service';
import type { ExperienceRepository } from '@modules/user/infrastructure/repositories/experience.repository';
import type { UserRepository } from '@modules/user/infrastructure/repositories/user.repository';
import type { DomainEventBus } from '@events/domain-event-bus.service';
import { Experience } from '@modules/user/domain/entities/experience.entity';
import { JobLevel } from '@shared/kernel/enums/job-level.enum';
import { EmploymentType } from '@shared/kernel/enums/employment-type.enum';

import {
  VersionConflictException,
  assertVersionMatches,
  isVersionConflictBody,
  versionsMatch,
} from './version-conflict.exception';

const ME = 'user-me';
const OTHER = 'user-other';
const SEEN = new Date('2026-08-10T09:00:00.000Z'); // what the client last saw
const MOVED = new Date('2026-08-10T11:00:00.000Z'); // someone else wrote at this time

function experience(over: Partial<Record<string, unknown>> = {}): Experience {
  return new Experience(
    {
      userId: ME,
      company: 'Acme',
      title: 'Engineer',
      jobLevel: JobLevel.MID,
      employmentType: EmploymentType.FULL_TIME,
      industry: 'Software',
      isCurrentJob: false,
      startDate: new Date('2020-01-01T00:00:00.000Z'),
      technologies: [],
      createdAt: SEEN,
      updatedAt: SEEN,
      ...over,
    } as never,
    'exp-1',
  );
}

/** In-memory experience store, so "was it written?" is a real question. */
function build(seed: Experience) {
  const store = new Map<string, Experience>([[seed.id, seed]]);

  const repo = {
    findById: jest.fn(async (id: string) => store.get(id) ?? null),
    save: jest.fn(async (e: Experience) => {
      store.set(e.id, e);
    }),
  } as unknown as ExperienceRepository;

  const users = {
    findById: jest.fn(async () => ({ id: ME })),
  } as unknown as UserRepository;

  const bus = { publish: jest.fn(async () => undefined) } as unknown as DomainEventBus;

  return { service: new ExperienceService(repo, users, bus), store, repo };
}

describe('versionsMatch', () => {
  it('matches an ISO string round-tripped through JSON', () => {
    expect(versionsMatch(SEEN, SEEN.toISOString())).toBe(true);
  });

  it('matches a Date', () => {
    expect(versionsMatch(SEEN, new Date(SEEN))).toBe(true);
  });

  it('does not match a different instant', () => {
    expect(versionsMatch(MOVED, SEEN.toISOString())).toBe(false);
  });

  it('treats an unparseable value as a mismatch rather than waving it through', () => {
    expect(versionsMatch(SEEN, 'not-a-date')).toBe(false);
    expect(versionsMatch(SEEN, '')).toBe(false);
  });
});

describe('assertVersionMatches', () => {
  it('builds serverVersion only on the conflict path', () => {
    const project = jest.fn(() => ({ id: 'x' }));

    assertVersionMatches({
      serverUpdatedAt: SEEN,
      clientExpectedUpdatedAt: SEEN.toISOString(),
      serverVersion: project,
      clientAttempted: {},
    });
    expect(project).not.toHaveBeenCalled();

    expect(() =>
      assertVersionMatches({
        serverUpdatedAt: MOVED,
        clientExpectedUpdatedAt: SEEN.toISOString(),
        serverVersion: project,
        clientAttempted: {},
      }),
    ).toThrow(VersionConflictException);
    expect(project).toHaveBeenCalledTimes(1);
  });
});

describe('ExperienceService.updateExperience — optimistic concurrency', () => {
  it('applies the update when expectedUpdatedAt matches', async () => {
    const { service, store } = build(experience());

    const updated = await service.updateExperience(
      'exp-1',
      { expectedUpdatedAt: SEEN.toISOString(), title: 'Staff Engineer' },
      ME,
    );

    expect(updated.title).toBe('Staff Engineer');
    expect(store.get('exp-1')!.title).toBe('Staff Engineer');
  });

  it('refuses a stale update and leaves the stored record untouched', async () => {
    // The server moved on to "Principal Engineer" after the client loaded the record.
    const { service, store, repo } = build(
      experience({ title: 'Principal Engineer', updatedAt: MOVED }),
    );

    await expect(
      service.updateExperience(
        'exp-1',
        { expectedUpdatedAt: SEEN.toISOString(), title: 'Staff Engineer' },
        ME,
      ),
    ).rejects.toBeInstanceOf(VersionConflictException);

    // THE point of the test: nothing was written.
    expect(repo.save).not.toHaveBeenCalled();
    expect(store.get('exp-1')!.title).toBe('Principal Engineer');
  });

  it('returns both versions so a resolution UI can be built', async () => {
    const { service } = build(
      experience({ title: 'Principal Engineer', updatedAt: MOVED }),
    );

    const attempted = { expectedUpdatedAt: SEEN.toISOString(), title: 'Staff Engineer' };

    try {
      await service.updateExperience('exp-1', attempted, ME);
      throw new Error('expected a conflict');
    } catch (err) {
      const body = (err as VersionConflictException).body;
      expect(body.conflict).toBe(true);
      expect(body.serverVersion).toMatchObject({
        id: 'exp-1',
        title: 'Principal Engineer',
      });
      expect(body.clientAttempted).toEqual(attempted);
    }
  });

  it('refuses to let one user edit another user’s record, before any version check', async () => {
    const { service, repo } = build(experience());

    await expect(
      service.updateExperience(
        'exp-1',
        { expectedUpdatedAt: SEEN.toISOString(), title: 'Hijacked' },
        OTHER,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('AllExceptionsFilter passthrough', () => {
  it('recognises a version-conflict body', () => {
    const exception = new VersionConflictException({ a: 1 }, { b: 2 });
    expect(isVersionConflictBody(exception.getResponse())).toBe(true);
  });

  it('does not mistake an ordinary error body for a conflict', () => {
    expect(isVersionConflictBody({ message: 'nope' })).toBe(false);
    expect(isVersionConflictBody('a string')).toBe(false);
    expect(isVersionConflictBody(null)).toBe(false);
  });

  it('still carries a human-readable message for clients that only read `message`', () => {
    const body = new VersionConflictException({}, {}).body;
    expect(typeof body.message).toBe('string');
    expect(body.message).toMatch(/not applied/i);
  });
});
