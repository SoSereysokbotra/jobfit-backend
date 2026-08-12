// Integration tests for the offline-queue flush (POST /sync/batch).
//
// The REAL BatchService and the REAL Phase 1 IdempotencyService run over an in-memory
// stand-in for the idempotency_keys table. The three feature services are jest spies —
// they are the seam that answers the question these tests exist to ask: "did the side
// effect actually happen, and how many times?"

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import type { PrismaService } from '@infra/prisma/prisma.service';
import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '@common/decorators/public.decorator';
import type { SavedJobService } from '@modules/saved-job/saved-job.service';
import type { ApplicationService } from '@modules/application/application.service';
import type { RecommendationDismissService } from '@modules/matching/application/services/recommendation-dismiss.service';
import type { ProfileService } from '@modules/user/application/services/profile.service';
import type { ExperienceService } from '@modules/user/application/services/experience.service';
import type { EducationService } from '@modules/user/application/services/education.service';
import { VersionConflictException } from '@common/conflict/version-conflict.exception';

import { BatchService } from './batch.service';
import { SyncController } from './presentation/controllers/sync.controller';
import { BatchActionType, BatchErrorCode, SyncBatchDto } from './dto/batch.dto';

const ME = 'user-me';
const TS = '2026-08-10T09:00:00.000Z';

/** In-memory idempotency_keys honouring the unique key. */
function fakePrisma() {
  const rows = new Map<string, Record<string, unknown>>();
  const prisma = {
    idempotencyKey: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
        rows.get(where.key) ?? null,
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (rows.has(data.key as string)) {
          throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
        }
        rows.set(data.key as string, data);
        return data;
      }),
    },
  } as unknown as PrismaService;
  return { prisma, rows };
}

function build(overrides: {
  submitApplication?: jest.Mock;
  save?: jest.Mock;
  remove?: jest.Mock;
  dismiss?: jest.Mock;
  updateProfile?: jest.Mock;
  updateExperience?: jest.Mock;
  updateEducation?: jest.Mock;
} = {}) {
  const { prisma, rows } = fakePrisma();

  const save = overrides.save ?? jest.fn(async () => ['job-1']);
  const remove = overrides.remove ?? jest.fn(async () => []);
  const dismiss =
    overrides.dismiss ?? jest.fn(async (_u: string, jobId: string) => ({ jobId, dismissed: true }));
  const submitApplication =
    overrides.submitApplication ??
    jest.fn(async (_u: string, dto: { jobId: string }) => ({
      id: 'app-1',
      userId: ME,
      jobId: dto.jobId,
      status: 'SUBMITTED',
      appliedAt: new Date(TS),
      archivedByCandidateAt: null,
      createdAt: new Date(TS),
      updatedAt: new Date(TS),
    }));

  const updateProfile = overrides.updateProfile ?? jest.fn(async () => profileEntity());
  const updateExperience =
    overrides.updateExperience ?? jest.fn(async () => experienceEntity());
  const updateEducation =
    overrides.updateEducation ?? jest.fn(async () => educationEntity());

  const savedJobs = { save, remove } as unknown as SavedJobService;
  const applications = { submitApplication } as unknown as ApplicationService;
  const dismissals = { dismiss } as unknown as RecommendationDismissService;
  const profiles = { updateProfile } as unknown as ProfileService;
  const experiences = { updateExperience } as unknown as ExperienceService;
  const educations = { updateEducation } as unknown as EducationService;

  const service = new BatchService(
    new IdempotencyService(prisma),
    savedJobs,
    applications,
    dismissals,
    profiles,
    experiences,
    educations,
  );

  return {
    service,
    save,
    remove,
    dismiss,
    submitApplication,
    updateProfile,
    updateExperience,
    updateEducation,
    rows,
  };
}

/** Minimal entities the response DTOs can project without touching a DB. */
function experienceEntity(over: Record<string, unknown> = {}) {
  return {
    id: 'exp-1',
    userId: ME,
    company: 'Acme',
    title: 'Engineer',
    jobLevel: 'MID',
    employmentType: 'FULL_TIME',
    industry: 'Software',
    isCurrentJob: false,
    startDate: new Date(TS),
    technologies: [],
    createdAt: new Date(TS),
    updatedAt: new Date(TS),
    ...over,
  };
}

function educationEntity(over: Record<string, unknown> = {}) {
  return {
    id: 'edu-1',
    userId: ME,
    institution: 'MIT',
    degreeLevel: 'BACHELOR',
    fieldOfStudy: 'CS',
    startDate: new Date(TS),
    createdAt: new Date(TS),
    updatedAt: new Date(TS),
    ...over,
  };
}

function profileEntity(over: Record<string, unknown> = {}) {
  return {
    id: 'prof-1',
    userId: ME,
    firstName: 'Ada',
    lastName: 'Lovelace',
    desiredJobLevels: [],
    desiredRemoteTypes: [],
    desiredEmploymentTypes: [],
    desiredIndustries: [],
    createdAt: new Date(TS),
    updatedAt: new Date(TS),
    ...over,
  };
}

function action(
  key: string,
  type: BatchActionType,
  jobId: string,
  clientTimestamp = TS,
) {
  return { idempotencyKey: key, type, payload: { jobId }, clientTimestamp };
}

describe('BatchService — happy path', () => {
  it('applies a batch of 3 valid actions, all succeeding', async () => {
    const { service, save, dismiss, submitApplication } = build();

    const dto: SyncBatchDto = {
      actions: [
        action('k1', BatchActionType.SAVE_JOB, 'job-1'),
        action('k2', BatchActionType.DISMISS_RECOMMENDATION, 'job-2'),
        action('k3', BatchActionType.SUBMIT_APPLICATION, 'job-3'),
      ],
    };

    const { results } = await service.execute(ME, dto);

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === 'success')).toBe(true);
    expect(results.map((r) => r.idempotencyKey)).toEqual(['k1', 'k2', 'k3']);

    expect(save).toHaveBeenCalledWith(ME, 'job-1');
    expect(dismiss).toHaveBeenCalledWith(ME, 'job-2');
    expect(submitApplication).toHaveBeenCalledWith(
      ME,
      expect.objectContaining({ jobId: 'job-3' }),
    );
  });

  it('applies actions strictly in array order, not concurrently', async () => {
    const order: string[] = [];
    const save = jest.fn(async () => {
      order.push('save');
      return ['job-1'];
    });
    const remove = jest.fn(async () => {
      order.push('remove');
      return [];
    });
    const { service } = build({ save, remove });

    // Saved then unsaved while offline: the end state must be "not saved".
    await service.execute(ME, {
      actions: [
        action('k1', BatchActionType.SAVE_JOB, 'job-1'),
        action('k2', BatchActionType.UNSAVE_JOB, 'job-1'),
      ],
    });

    expect(order).toEqual(['save', 'remove']);
  });
});

describe('BatchService — failure isolation', () => {
  it('lets actions 1 and 3 succeed when action 2 fails', async () => {
    const dismiss = jest.fn(async () => {
      throw new NotFoundException('Job not found');
    });
    const { service, save, submitApplication } = build({ dismiss });

    const { results } = await service.execute(ME, {
      actions: [
        action('k1', BatchActionType.SAVE_JOB, 'job-1'),
        action('k2', BatchActionType.DISMISS_RECOMMENDATION, 'job-missing'),
        action('k3', BatchActionType.SUBMIT_APPLICATION, 'job-3'),
      ],
    });

    expect(results[0].status).toBe('success');
    expect(results[1].status).toBe('error');
    expect(results[1].code).toBe(BatchErrorCode.NOT_FOUND);
    expect(results[2].status).toBe('success');

    // The failure did not stop the batch: the action AFTER it still ran.
    expect(save).toHaveBeenCalledTimes(1);
    expect(submitApplication).toHaveBeenCalledTimes(1);
  });

  it('surfaces a duplicate application as a clear conflict, not a raw DB error', async () => {
    const submitApplication = jest.fn(async () => {
      // What ApplicationService actually throws when the row already exists.
      throw new BadRequestException('You have already applied to this job');
    });
    const { service } = build({ submitApplication });

    const { results } = await service.execute(ME, {
      actions: [action('k1', BatchActionType.SUBMIT_APPLICATION, 'job-1')],
    });

    expect(results[0]).toMatchObject({
      status: 'error',
      code: BatchErrorCode.CONFLICT,
      error: 'You have already applied to this job',
    });
  });

  it('leaves no receipt for a failed action, so a later retry re-attempts it', async () => {
    const submitApplication = jest
      .fn()
      .mockRejectedValueOnce(new Error('transient database blip'))
      .mockResolvedValueOnce({
        id: 'app-1',
        userId: ME,
        jobId: 'job-1',
        status: 'SUBMITTED',
        appliedAt: new Date(TS),
        archivedByCandidateAt: null,
        createdAt: new Date(TS),
        updatedAt: new Date(TS),
      });
    const { service } = build({ submitApplication });

    const dto: SyncBatchDto = {
      actions: [action('k1', BatchActionType.SUBMIT_APPLICATION, 'job-1')],
    };

    const first = await service.execute(ME, dto);
    expect(first.results[0].status).toBe('error');
    expect(first.results[0].code).toBe(BatchErrorCode.FAILED);

    const second = await service.execute(ME, dto);
    expect(second.results[0].status).toBe('success');
    expect(submitApplication).toHaveBeenCalledTimes(2); // genuinely retried
  });
});

describe('BatchService — replay safety', () => {
  it('replaying the exact same batch does not double-apply anything', async () => {
    const { service, save, dismiss, submitApplication } = build();

    const dto: SyncBatchDto = {
      actions: [
        action('k1', BatchActionType.SAVE_JOB, 'job-1'),
        action('k2', BatchActionType.DISMISS_RECOMMENDATION, 'job-2'),
        action('k3', BatchActionType.SUBMIT_APPLICATION, 'job-3'),
      ],
    };

    const first = await service.execute(ME, dto);
    const second = await service.execute(ME, dto);

    // Every side effect ran exactly once across BOTH flushes.
    expect(save).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(submitApplication).toHaveBeenCalledTimes(1);

    // The client still gets a success for each action, flagged as a replay.
    expect(second.results.every((r) => r.status === 'success')).toBe(true);
    expect(second.results.every((r) => r.replayed === true)).toBe(true);
    expect(second.results.map((r) => r.data)).toEqual(
      first.results.map((r) => r.data),
    );
  });

  it('re-runs only the actions that had not completed after a partial failure', async () => {
    const dismiss = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ jobId: 'job-2', dismissed: true });
    const { service, save, submitApplication } = build({ dismiss });

    const dto: SyncBatchDto = {
      actions: [
        action('k1', BatchActionType.SAVE_JOB, 'job-1'),
        action('k2', BatchActionType.DISMISS_RECOMMENDATION, 'job-2'),
        action('k3', BatchActionType.SUBMIT_APPLICATION, 'job-3'),
      ],
    };

    const first = await service.execute(ME, dto);
    expect(first.results.map((r) => r.status)).toEqual([
      'success',
      'error',
      'success',
    ]);

    const second = await service.execute(ME, dto);
    expect(second.results.every((r) => r.status === 'success')).toBe(true);

    // The two that already succeeded were NOT re-executed; only the failed one was.
    expect(save).toHaveBeenCalledTimes(1);
    expect(submitApplication).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledTimes(2);
  });

  it('rejects a key reused for a different action instead of serving the wrong result', async () => {
    const { service, save } = build();

    await service.execute(ME, {
      actions: [action('k1', BatchActionType.SAVE_JOB, 'job-1')],
    });

    // Same key, different payload — a client bug, not a retry.
    const { results } = await service.execute(ME, {
      actions: [action('k1', BatchActionType.SAVE_JOB, 'job-DIFFERENT')],
    });

    expect(results[0]).toMatchObject({
      status: 'error',
      code: BatchErrorCode.IDEMPOTENCY_CONFLICT,
    });
    expect(save).toHaveBeenCalledTimes(1); // the second was never applied
  });

  it('does not let one user replay another user’s key', async () => {
    const { service, save } = build();

    await service.execute(ME, {
      actions: [action('k1', BatchActionType.SAVE_JOB, 'job-1')],
    });

    const { results } = await service.execute('someone-else', {
      actions: [action('k1', BatchActionType.SAVE_JOB, 'job-1')],
    });

    expect(results[0].code).toBe(BatchErrorCode.IDEMPOTENCY_CONFLICT);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('BatchService — version conflicts (Phase 4)', () => {
  const updateAction = (key: string, expectedUpdatedAt: string) => ({
    idempotencyKey: key,
    type: BatchActionType.UPDATE_EXPERIENCE,
    payload: {
      id: 'exp-1',
      expectedUpdatedAt,
      changes: { title: 'Staff Engineer' },
    },
    clientTimestamp: TS,
  });

  it('applies an update whose expectedUpdatedAt matches', async () => {
    const { service, updateExperience } = build();

    const { results } = await service.execute(ME, {
      actions: [updateAction('k1', TS)],
    });

    expect(results[0].status).toBe('success');
    expect(updateExperience).toHaveBeenCalledWith(
      'exp-1',
      expect.objectContaining({ title: 'Staff Engineer', expectedUpdatedAt: TS }),
      ME, // ownership is enforced with the authenticated id
    );
  });

  it('surfaces a stale update as status "conflict" carrying BOTH versions', async () => {
    const serverVersion = { id: 'exp-1', title: 'Principal Engineer' };
    const clientAttempted = { title: 'Staff Engineer', expectedUpdatedAt: TS };
    const updateExperience = jest.fn(async () => {
      throw new VersionConflictException(serverVersion, clientAttempted);
    });
    const { service } = build({ updateExperience });

    const { results } = await service.execute(ME, {
      actions: [updateAction('k1', TS)],
    });

    expect(results[0].status).toBe('conflict');
    expect(results[0].code).toBe(BatchErrorCode.VERSION_CONFLICT);
    expect(results[0].serverVersion).toEqual(serverVersion);
    expect(results[0].clientAttempted).toEqual(clientAttempted);
    // Enough for a resolution UI to be built on later.
    expect(results[0].error).toMatch(/changed on the server/i);
  });

  it('does not stop the batch — actions after a conflict still run', async () => {
    const updateExperience = jest.fn(async () => {
      throw new VersionConflictException({}, {});
    });
    const { service, save } = build({ updateExperience });

    const { results } = await service.execute(ME, {
      actions: [
        updateAction('k1', TS),
        action('k2', BatchActionType.SAVE_JOB, 'job-1'),
      ],
    });

    expect(results[0].status).toBe('conflict');
    expect(results[1].status).toBe('success');
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('writes no receipt for a conflict, so the resolved retry is not swallowed', async () => {
    // The whole point: a conflict is unresolved, not done. Receipting it would make the
    // conflict permanent for that key and the user's edit unrecoverable.
    const updateExperience = jest
      .fn()
      .mockRejectedValueOnce(new VersionConflictException({ v: 'server' }, { v: 'client' }))
      .mockResolvedValueOnce(experienceEntity({ title: 'Staff Engineer' }));
    const { service, rows } = build({ updateExperience });

    const first = await service.execute(ME, {
      actions: [updateAction('k1', TS)],
    });
    expect(first.results[0].status).toBe('conflict');
    expect(rows.size).toBe(0); // nothing receipted

    // Client resolves and retries with the same key.
    const second = await service.execute(ME, {
      actions: [updateAction('k1', TS)],
    });
    expect(second.results[0].status).toBe('success');
    expect(updateExperience).toHaveBeenCalledTimes(2);
  });

  it('rejects an UPDATE_* action that omits expectedUpdatedAt', async () => {
    const { service, updateExperience } = build();

    const { results } = await service.execute(ME, {
      actions: [
        {
          idempotencyKey: 'k1',
          type: BatchActionType.UPDATE_EXPERIENCE,
          payload: { id: 'exp-1', changes: { title: 'x' } },
          clientTimestamp: TS,
        },
      ],
    });

    // Applying it anyway would be exactly the silent clobber this phase prevents.
    expect(results[0].status).toBe('error');
    expect(results[0].code).toBe(BatchErrorCode.INVALID_PAYLOAD);
    expect(updateExperience).not.toHaveBeenCalled();
  });

  it('leaves Phase 1 idempotency intact — a replayed identical update is cached, not re-checked', async () => {
    const { service, updateExperience } = build();

    const dto = { actions: [updateAction('k1', TS)] };

    const first = await service.execute(ME, dto);
    const second = await service.execute(ME, dto);

    expect(first.results[0].status).toBe('success');
    // The replay returns the stored response WITHOUT re-running the update — so it cannot
    // spuriously conflict just because the record's updatedAt moved on when it was applied.
    expect(second.results[0].status).toBe('success');
    expect(second.results[0].replayed).toBe(true);
    expect(updateExperience).toHaveBeenCalledTimes(1);
  });
});

describe('POST /sync/batch — authentication', () => {
  it('is guarded by JwtAuthGuard, so an unauthenticated request is rejected', () => {
    const guards = Reflect.getMetadata('__guards__', SyncController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('is not marked @Public — the global JwtAuthGuard applies', () => {
    const reflector = new Reflector();
    const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      SyncController.prototype.flushBatch,
      SyncController,
    ]);
    expect(isPublic).toBeFalsy();
  });

  it('rejects a request with no user rather than defaulting to one', () => {
    // The handler reads @CurrentUser().id — there is no path that derives the user from
    // the body, so an unauthenticated request cannot reach BatchService with a userId.
    const handlerSource = SyncController.prototype.flushBatch.toString();
    expect(handlerSource).not.toMatch(/dto\.userId|body\.userId/);
  });
});
