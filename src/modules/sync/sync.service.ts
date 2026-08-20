// src/modules/sync/sync.service.ts
//
// Delta sync for the resources Phase 0 flagged OFFLINE-CRITICAL (docs/PWA_OFFLINE_AUDIT.md).
// Every method is self-scoped: the userId comes from the JWT and is passed straight to
// deltaWhere(), which makes it a mandatory term of the query. There is no overload that
// omits it, so "forgot to scope by user" is not an expressible bug here.
//
// Three resources cannot offer a true delta, and say so rather than pretending:
//
//   saved-jobs      SavedJob has neither updatedAt nor a soft delete (audit §2), so an
//                   unsave is invisible to any `since` query. Rather than silently drop
//                   deletions, this returns the COMPLETE list every time with
//                   fullReplace: true. The resource is a short id list, so a full replace
//                   is cheap — this is the audit's §5 recommendation, not a shortcut.
//
//   recommendations Dismissals ARE reported now. A dismissal used to be a hard delete, so
//                   `deletes` was permanently empty and a job the user rejected lingered
//                   in the client cache. It is `dismissedAt` since 2026-08-20
//                   (MENTOR_REVIEW_2026-08-18 §6), which splitDelta already knows how to
//                   turn into a tombstone — the row is mapped onto its `deletedAt` slot
//                   below. Hard deletes remain invisible: recompute drops rows that fall
//                   out of the ranking, and those still wait for a full sync. That one is
//                   genuinely acceptable — a stale suggestion is not a correctness problem
//                   the way a stale application would be.
//
//   certifications  No repository exists yet, so this reads Prisma directly.
//
// Job is deliberately NOT synced despite being OFFLINE-CRITICAL: audit §3.2 found that
// ingestion rewrites every re-seen posting unconditionally, which bumps `updatedAt` on
// rows whose content never changed. A job delta would therefore return the entire
// catalogue on every poll. That must be fixed before a /sync/jobs route is worth having.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';

import { ApplicationRepository } from '@modules/application/infrastructure/repositories/application.repository';
import { ApplicationResponseDto } from '@modules/application/dto/application-response.dto';
import { ProfileRepository } from '@modules/user/infrastructure/repositories/profile.repository';
import { ExperienceRepository } from '@modules/user/infrastructure/repositories/experience.repository';
import { EducationRepository } from '@modules/user/infrastructure/repositories/education.repository';
import { UserSkillRepository } from '@modules/user/infrastructure/repositories/user-skill.repository';
import { ProfileResponseDto } from '@modules/user/application/dtos/profile-response.dto';
import { ExperienceResponseDto } from '@modules/user/application/dtos/experience-response.dto';
import { EducationResponseDto } from '@modules/user/application/dtos/education-response.dto';
import { SkillResponseDto } from '@modules/user/application/dtos/skill-response.dto';
import { SavedJobRepository } from '@modules/saved-job/infrastructure/repositories/saved-job.repository';
import { RecommendedJobDto } from '@modules/matching/presentation/dtos/recommended-job.dto';
import {
  RECOMMENDATION_JOB_INCLUDE,
  toRecommendedJobDto,
} from '@modules/matching/presentation/dtos/recommended-job.mapper';

import {
  DELTA_ORDER_BY,
  DeltaOptions,
  DeltaPage,
  decodeCursor,
  deltaWhere,
  splitDelta,
} from './delta';
import { SyncQueryDto } from './dto/sync-query.dto';
import { SyncEnvelopeDto } from './dto/sync-response.dto';
import {
  CertificationResponseDto,
  CertificationRow,
} from './dto/certification-response.dto';
import { DEFAULT_SYNC_LIMIT } from './delta';

/**
 * A saved bookmark, as cached by the client.
 *
 * `jobId` is the identity here, not `id`: it is unique per user (@@unique([userId, jobId]))
 * and is what the existing GET /saved-jobs returns. `id` and `createdAt` are optional
 * because the SavedJob entity declares them so — they are DB-generated, and rows read
 * back from the database always carry both.
 */
export interface SavedJobSyncDto {
  id?: string;
  jobId: string;
  createdAt?: Date;
}

export interface BootstrapDto {
  serverTime: string;
  resources: {
    applications: SyncEnvelopeDto<ApplicationResponseDto>;
    profile: SyncEnvelopeDto<ProfileResponseDto>;
    experiences: SyncEnvelopeDto<ExperienceResponseDto>;
    education: SyncEnvelopeDto<EducationResponseDto>;
    certifications: SyncEnvelopeDto<CertificationResponseDto>;
    skills: SyncEnvelopeDto<SkillResponseDto>;
    savedJobs: SyncEnvelopeDto<SavedJobSyncDto>;
    recommendations: SyncEnvelopeDto<RecommendedJobDto>;
  };
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationRepository,
    private readonly profiles: ProfileRepository,
    private readonly experiences: ExperienceRepository,
    private readonly educations: EducationRepository,
    private readonly skills: UserSkillRepository,
    private readonly savedJobs: SavedJobRepository,
  ) {}

  // ── Per-resource deltas ────────────────────────────────────────────────────

  async syncApplications(
    userId: string,
    query: SyncQueryDto,
  ): Promise<SyncEnvelopeDto<ApplicationResponseDto>> {
    return this.envelope(query, (options) =>
      this.applications
        .findChangedSince(userId, options)
        .then((page) => mapPage(page, (a) => new ApplicationResponseDto(a))),
    );
  }

  async syncProfile(
    userId: string,
    query: SyncQueryDto,
  ): Promise<SyncEnvelopeDto<ProfileResponseDto>> {
    return this.envelope(query, (options) =>
      this.profiles
        .findChangedSince(userId, options)
        .then((page) => mapPage(page, (p) => new ProfileResponseDto(p))),
    );
  }

  async syncExperiences(
    userId: string,
    query: SyncQueryDto,
  ): Promise<SyncEnvelopeDto<ExperienceResponseDto>> {
    return this.envelope(query, (options) =>
      this.experiences
        .findChangedSince(userId, options)
        .then((page) => mapPage(page, (e) => new ExperienceResponseDto(e))),
    );
  }

  async syncEducation(
    userId: string,
    query: SyncQueryDto,
  ): Promise<SyncEnvelopeDto<EducationResponseDto>> {
    return this.envelope(query, (options) =>
      this.educations
        .findChangedSince(userId, options)
        .then((page) => mapPage(page, (e) => new EducationResponseDto(e))),
    );
  }

  async syncSkills(
    userId: string,
    query: SyncQueryDto,
  ): Promise<SyncEnvelopeDto<SkillResponseDto>> {
    return this.envelope(query, (options) =>
      this.skills
        .findChangedSince(userId, options)
        .then((page) => mapPage(page, (s) => new SkillResponseDto(s))),
    );
  }

  /** No CertificationRepository exists yet — read Prisma directly. */
  async syncCertifications(
    userId: string,
    query: SyncQueryDto,
  ): Promise<SyncEnvelopeDto<CertificationResponseDto>> {
    return this.envelope(query, async (options) => {
      const rows = (await this.prisma.certification.findMany({
        where: deltaWhere(userId, options),
        orderBy: DELTA_ORDER_BY,
        take: options.limit + 1,
      })) as (CertificationRow & { deletedAt: Date | null })[];

      return splitDelta(
        rows,
        options.limit,
        (row) => new CertificationResponseDto(row),
      );
    });
  }

  /**
   * Recommendations. Ordered by (updatedAt, id) like every other delta, NOT by score:
   * paging has to follow the watermark, and the client re-sorts by `match` for display
   * anyway.
   *
   * A dismissed row is a TOMBSTONE, not an upsert. `dismissedAt` is mapped onto the
   * `deletedAt` slot splitDelta already reads, so a "not interested" propagates to every
   * device instead of the job sitting in the client cache forever (see the header note).
   */
  async syncRecommendations(
    userId: string,
    query: SyncQueryDto,
  ): Promise<SyncEnvelopeDto<RecommendedJobDto>> {
    return this.envelope(query, async (options) => {
      const rows = await this.prisma.recommendation.findMany({
        where: deltaWhere(userId, options),
        orderBy: DELTA_ORDER_BY,
        take: options.limit + 1,
        include: RECOMMENDATION_JOB_INCLUDE,
      });

      return splitDelta(
        rows.map((row) => ({ ...row, deletedAt: row.dismissedAt })),
        options.limit,
        (row) => toRecommendedJobDto(row),
      );
    });
  }

  /**
   * Saved jobs — ALWAYS the complete set, `since` and `cursor` ignored, fullReplace set.
   * See the header note: the model cannot express an unsave incrementally, and returning
   * a partial delta would leave removed bookmarks stuck in the client cache forever.
   */
  async syncSavedJobs(
    userId: string,
    query: SyncQueryDto,
  ): Promise<SyncEnvelopeDto<SavedJobSyncDto>> {
    const serverTime = new Date();
    const saved = await this.savedJobs.findByUser(userId);

    return new SyncEnvelopeDto<SavedJobSyncDto>({
      since: query.since ? new Date(query.since) : null,
      serverTime,
      upserts: saved.map((s) => ({
        id: s.id,
        jobId: s.jobId,
        createdAt: s.createdAt,
      })),
      deletes: [],
      nextCursor: null,
      fullReplace: true,
    });
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────

  /**
   * Full snapshot of every in-scope resource in one round trip, for first load or a
   * fresh install. No `since` — this is by definition the initial sync.
   *
   * There is no combined-endpoint precedent in this codebase to follow (no dashboard
   * module exists), so the shape is the obvious one: the same per-resource envelope the
   * individual routes return, keyed by resource, under a single serverTime. That means a
   * client can reuse one apply-a-delta routine for both paths instead of special-casing
   * bootstrap.
   *
   * Each resource is capped at the standard page size and can report its own nextCursor.
   * A client that receives a non-null nextCursor must drain that resource's own route
   * before treating the bootstrap as complete.
   */
  async bootstrap(userId: string): Promise<BootstrapDto> {
    const serverTime = new Date();
    const query: SyncQueryDto = { limit: DEFAULT_SYNC_LIMIT };

    const [
      applications,
      profile,
      experiences,
      education,
      certifications,
      skills,
      savedJobs,
      recommendations,
    ] = await Promise.all([
      this.syncApplications(userId, query),
      this.syncProfile(userId, query),
      this.syncExperiences(userId, query),
      this.syncEducation(userId, query),
      this.syncCertifications(userId, query),
      this.syncSkills(userId, query),
      this.syncSavedJobs(userId, query),
      this.syncRecommendations(userId, query),
    ]);

    return {
      serverTime: serverTime.toISOString(),
      resources: {
        applications,
        profile,
        experiences,
        education,
        certifications,
        skills,
        savedJobs,
        recommendations,
      },
    };
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  /**
   * Wraps a delta query in the response envelope.
   *
   * serverTime is read BEFORE the query runs. Reading it after would create a window in
   * which a row is written later than the query but earlier than the watermark — the next
   * sync would ask for changes after that watermark and never see it. Erring early means
   * at worst a row is returned twice, which upserts absorb.
   */
  private async envelope<T>(
    query: SyncQueryDto,
    run: (options: DeltaOptions) => Promise<DeltaPage<T>>,
  ): Promise<SyncEnvelopeDto<T>> {
    const serverTime = new Date();
    const since = query.since ? new Date(query.since) : undefined;

    const page = await run({
      since,
      cursor: decodeCursor(query.cursor),
      limit: query.limit ?? DEFAULT_SYNC_LIMIT,
    });

    return new SyncEnvelopeDto<T>({
      since: since ?? null,
      serverTime,
      upserts: page.upserts,
      deletes: page.deletes,
      nextCursor: page.nextCursor,
    });
  }
}

/** Re-map a page's upserts while carrying deletes and the cursor through untouched. */
function mapPage<A, B>(page: DeltaPage<A>, map: (a: A) => B): DeltaPage<B> {
  return {
    upserts: page.upserts.map(map),
    deletes: page.deletes,
    nextCursor: page.nextCursor,
  };
}
