// src/modules/sync/batch.service.ts
//
// Flushes a PWA's offline action queue (POST /sync/batch).
//
// THREE PROPERTIES THIS HAS TO GUARANTEE
//
// 1. Order. Actions run strictly in array order, one at a time. The `await` inside the
//    loop is deliberate, not an oversight: "save job X" then "unsave job X" queued offline
//    must land in that order, and Promise.all would race them to the opposite result.
//
// 2. Isolation of failures. One bad action must not sink the other nine. Every action is
//    wrapped, and a failure becomes an entry in `results` rather than an exception. The
//    endpoint therefore returns 200 with a mix of per-action statuses — a non-2xx would
//    tell the client to retry the WHOLE batch, re-attempting work that already succeeded.
//
// 3. Replay safety. Each action carries its own idempotency key and is checked against the
//    Phase 1 IdempotencyKey table before it runs. A batch retried after a partial failure
//    re-executes only the actions that had not completed.
//
// RECEIPTS ARE WRITTEN ONLY ON SUCCESS. A failed action deliberately leaves no receipt, so
// a later retry attempts it again. Recording failures would make a transient error
// (deadlock, timeout) permanent for that key — the user's action would be silently lost.
//
// clientTimestamp is NOT part of the idempotency hash. A client that re-stamps the time
// while retrying would otherwise produce a different hash for the same logical action and
// get a spurious 409 instead of a clean replay.

import { HttpException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { IdempotencyService } from '@common/idempotency/idempotency.service';
import { SavedJobService } from '@modules/saved-job/saved-job.service';
import { ApplicationService } from '@modules/application/application.service';
import { ApplicationResponseDto } from '@modules/application/dto/application-response.dto';
import { RecommendationDismissService } from '@modules/matching/application/services/recommendation-dismiss.service';
import { VersionConflictException } from '@common/conflict/version-conflict.exception';
import { ProfileService } from '@modules/user/application/services/profile.service';
import { ExperienceService } from '@modules/user/application/services/experience.service';
import { EducationService } from '@modules/user/application/services/education.service';
import { ProfileResponseDto } from '@modules/user/application/dtos/profile-response.dto';
import { ExperienceResponseDto } from '@modules/user/application/dtos/experience-response.dto';
import { EducationResponseDto } from '@modules/user/application/dtos/education-response.dto';
import { UpdateProfileDto } from '@modules/user/application/dtos/update-profile.dto';
import { UpdateExperienceDto } from '@modules/user/application/dtos/update-experience.dto';

import {
  BatchActionDto,
  BatchActionType,
  BatchErrorCode,
  BatchResultDto,
  SyncBatchDto,
  SyncBatchResponseDto,
} from './dto/batch.dto';

@Injectable()
export class BatchService {
  private readonly logger = new Logger(BatchService.name);

  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly savedJobs: SavedJobService,
    private readonly applications: ApplicationService,
    private readonly dismissals: RecommendationDismissService,
    private readonly profiles: ProfileService,
    private readonly experiences: ExperienceService,
    private readonly educations: EducationService,
  ) {}

  async execute(
    userId: string,
    dto: SyncBatchDto,
  ): Promise<SyncBatchResponseDto> {
    this.warnIfOutOfOrder(dto.actions);

    const results: BatchResultDto[] = [];
    for (const action of dto.actions) {
      // Sequential by design — see property 1 in the file header.
      // eslint-disable-next-line no-await-in-loop
      results.push(await this.runOne(userId, action));
    }

    return { results };
  }

  private async runOne(
    userId: string,
    action: BatchActionDto,
  ): Promise<BatchResultDto> {
    const key = action.idempotencyKey;
    const endpoint = `BATCH ${action.type}`;
    const requestHash = this.idempotency.hashBody(action.payload);

    try {
      const existing = await this.idempotency.find(key);

      if (existing) {
        const sameAction =
          existing.userId === userId &&
          existing.endpoint === endpoint &&
          existing.requestHash === requestHash;

        if (!sameAction) {
          // The key was minted for something else. Refusing beats guessing.
          return {
            idempotencyKey: key,
            status: 'error',
            code: BatchErrorCode.IDEMPOTENCY_CONFLICT,
            error:
              'This idempotencyKey was already used for a different action. Generate a ' +
              'new key for a new action, and reuse the original key only when retrying.',
          };
        }

        // Already applied on an earlier attempt — hand back the original result.
        return {
          idempotencyKey: key,
          status: 'success',
          data: existing.responseBody,
          replayed: true,
        };
      }

      const data = await this.dispatch(userId, action);

      await this.idempotency.store(key, {
        userId,
        endpoint,
        requestHash,
        responseStatus: 200,
        responseBody: (data ?? null) as Prisma.JsonValue,
      });

      return { idempotencyKey: key, status: 'success', data };
    } catch (error) {
      // A version conflict is its own outcome, not a failure: nothing was written, and the
      // client needs both versions to resolve it. Deliberately NOT receipted — the action
      // is unresolved, and a receipt would make the conflict permanent for this key.
      if (error instanceof VersionConflictException) {
        const { serverVersion, clientAttempted, message } = error.body;
        return {
          idempotencyKey: key,
          status: 'conflict',
          error: message,
          code: BatchErrorCode.VERSION_CONFLICT,
          serverVersion,
          clientAttempted,
        };
      }

      const mapped = this.mapError(error);
      this.logger.warn(
        `Batch action ${action.type} (${key}) failed: ${mapped.error}`,
      );
      return { idempotencyKey: key, status: 'error', ...mapped };
    }
  }

  /**
   * Route to the module that already owns this behaviour. No business rules live here —
   * duplicating "can this user apply to this job?" in a sync endpoint is how the two
   * copies drift and the offline path starts accepting what the online path refuses.
   */
  private async dispatch(
    userId: string,
    action: BatchActionDto,
  ): Promise<unknown> {
    const { resumeId, coverLetter, notes } = action.payload;

    switch (action.type) {
      case BatchActionType.SAVE_JOB:
        return { jobIds: await this.savedJobs.save(userId, this.jobIdOf(action)) };

      case BatchActionType.UNSAVE_JOB:
        return { jobIds: await this.savedJobs.remove(userId, this.jobIdOf(action)) };

      case BatchActionType.DISMISS_RECOMMENDATION:
        return this.dismissals.dismiss(userId, this.jobIdOf(action));

      case BatchActionType.SUBMIT_APPLICATION: {
        const application = await this.applications.submitApplication(userId, {
          jobId: this.jobIdOf(action),
          resumeId,
          coverLetter,
          notes,
        });
        return { ...new ApplicationResponseDto(application) };
      }

      case BatchActionType.UPDATE_PROFILE: {
        const profile = await this.profiles.updateProfile(userId, {
          ...(action.payload.changes as object),
          expectedUpdatedAt: this.expectedUpdatedAtOf(action),
        } as UpdateProfileDto);
        return { ...new ProfileResponseDto(profile) };
      }

      case BatchActionType.UPDATE_EXPERIENCE: {
        const experience = await this.experiences.updateExperience(
          this.recordIdOf(action),
          {
            ...(action.payload.changes as object),
            expectedUpdatedAt: this.expectedUpdatedAtOf(action),
          } as UpdateExperienceDto,
          userId,
        );
        return { ...new ExperienceResponseDto(experience) };
      }

      case BatchActionType.UPDATE_EDUCATION: {
        const education = await this.educations.updateEducation(
          this.recordIdOf(action),
          {
            ...(action.payload.changes as object),
            expectedUpdatedAt: this.expectedUpdatedAtOf(action),
          },
          userId,
        );
        return { ...new EducationResponseDto(education) };
      }

      default:
        // Unreachable while the enum and this switch agree; the compiler enforces that,
        // and this guards the runtime case of an older server seeing a newer action type.
        throw new UnsupportedActionError(action.type);
    }
  }

  // Per-type payload requirements. The DTO cannot express "jobId required for these four
  // types but id + expectedUpdatedAt for those three", so it validates shapes and these
  // enforce which fields each action actually needs.

  private jobIdOf(action: BatchActionDto): string {
    const { jobId } = action.payload;
    if (!jobId) {
      throw new InvalidPayloadError(`${action.type} requires payload.jobId`);
    }
    return jobId;
  }

  private recordIdOf(action: BatchActionDto): string {
    const { id } = action.payload;
    if (!id) {
      throw new InvalidPayloadError(`${action.type} requires payload.id`);
    }
    return id;
  }

  private expectedUpdatedAtOf(action: BatchActionDto): string {
    const { expectedUpdatedAt } = action.payload;
    if (!expectedUpdatedAt) {
      // Without it there is nothing to compare, and applying the edit anyway would be
      // exactly the silent clobber this phase exists to prevent.
      throw new InvalidPayloadError(
        `${action.type} requires payload.expectedUpdatedAt — the updatedAt you last saw`,
      );
    }
    return expectedUpdatedAt;
  }

  /**
   * Turn a thrown error into a per-action result. The distinction that matters to a client
   * is retry vs. do-not-retry: CONFLICT and INVALID_PAYLOAD mean "drop this from the
   * queue", FAILED means "try again later".
   */
  private mapError(error: unknown): { error: string; code: BatchErrorCode } {
    if (
      error instanceof UnsupportedActionError ||
      error instanceof InvalidPayloadError
    ) {
      return { error: error.message, code: BatchErrorCode.INVALID_PAYLOAD };
    }

    if (error instanceof HttpException) {
      const message = extractMessage(error);
      const status = error.getStatus();

      if (status === 409 || /already applied|already exists/i.test(message)) {
        return { error: message, code: BatchErrorCode.CONFLICT };
      }
      if (status === 404) return { error: message, code: BatchErrorCode.NOT_FOUND };
      if (status === 400) {
        return { error: message, code: BatchErrorCode.INVALID_PAYLOAD };
      }
      return { error: message, code: BatchErrorCode.FAILED };
    }

    // Safety net: a duplicate that slipped past the service's own pre-check because
    // another device inserted the row in between. The unique constraint on
    // applications(userId, jobId) is what actually stops the double-apply; this turns
    // the raw Prisma failure into the same clear message the pre-check produces.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return {
        error: 'You have already applied to this job',
        code: BatchErrorCode.CONFLICT,
      };
    }

    return {
      error: (error as Error)?.message ?? 'Action failed',
      code: BatchErrorCode.FAILED,
    };
  }

  /**
   * Array order is authoritative, but a queue whose clientTimestamps disagree with its
   * array order is usually a client bug (queue rebuilt from an unordered store). Worth a
   * log line — silently applying the wrong order is how "unsave then save" inverts.
   */
  private warnIfOutOfOrder(actions: BatchActionDto[]): void {
    for (let i = 1; i < actions.length; i += 1) {
      const prev = Date.parse(actions[i - 1].clientTimestamp);
      const curr = Date.parse(actions[i].clientTimestamp);
      if (Number.isFinite(prev) && Number.isFinite(curr) && curr < prev) {
        this.logger.warn(
          'Batch clientTimestamps are not ascending — applying in array order anyway. ' +
            'The client queue may be reordering actions.',
        );
        return;
      }
    }
  }
}

class UnsupportedActionError extends Error {
  constructor(type: string) {
    super(`Unsupported action type: ${type}`);
  }
}

class InvalidPayloadError extends Error {}

/** HttpException bodies are either a string or { message: string | string[] }. */
function extractMessage(error: HttpException): string {
  const response = error.getResponse();
  if (typeof response === 'string') return response;

  const message = (response as { message?: string | string[] })?.message;
  if (Array.isArray(message)) return message.join('; ');
  return message ?? error.message;
}
