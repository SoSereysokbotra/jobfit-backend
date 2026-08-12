// src/modules/sync/presentation/controllers/sync.controller.ts
//
// Delta-sync surface for the PWA (docs/PWA_OFFLINE_AUDIT.md, Phase 2).
//
// ROUTE SHAPE. The brief asked for `GET /{resource}/sync`. These live at
// `GET /sync/{resource}` instead, for two concrete reasons:
//
//   1. Collision. `/applications/sync` and `/profiles/sync` would be matched by the
//      existing `@Get(':id')` / `@Get(':userId')` routes on those controllers — "sync"
//      parses as an id. It works only while the sync route is declared first, so any
//      future reorder breaks it silently (and on /profiles the ParseUUIDPipe turns it
//      into a confusing 400 rather than a 404).
//   2. The profile bundle has no single resource root. Experiences, education,
//      certifications and skills hang off `/profiles/:userId/...`, so the brief's shape
//      would put another user's id in the path of a strictly self-scoped endpoint.
//
// Everything else follows the brief: same query params, same envelope, same semantics.
//
// SELF-SCOPING. Every route reads the user from the JWT via @CurrentUser and never from
// the path or query. There is no :userId parameter to tamper with.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import {
  AuthenticatedUser,
  JwtAuthGuard,
} from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';

import { SyncService } from '../../sync.service';
import { BatchService } from '../../batch.service';
import { SyncQueryDto } from '../../dto/sync-query.dto';
import { SyncEnvelopeDto } from '../../dto/sync-response.dto';
import {
  MAX_BATCH_ACTIONS,
  SyncBatchDto,
  SyncBatchResponseDto,
} from '../../dto/batch.dto';

const ENVELOPE_NOTE =
  'Returns { since, serverTime, upserts, deletes, nextCursor }. Store `serverTime` and ' +
  'pass it as `since` next time. While `nextCursor` is non-null, keep paging with the ' +
  'SAME `since` before advancing your watermark.';

@ApiTags('Sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly batch: BatchService,
  ) {}

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Flush a queue of actions taken while offline',
    description:
      'Applies actions strictly in array order, one at a time. Each action carries its ' +
      'own `idempotencyKey`, so a batch retried after a partial failure re-runs only the ' +
      'actions that had not completed.\n\n' +
      'Always responds **200**, even when some actions failed — inspect `results` per ' +
      'action. A non-2xx would tell the client to retry the whole batch and re-attempt ' +
      'work that already succeeded. A failed action leaves no receipt and may be retried; ' +
      'branch on `code` (CONFLICT / INVALID_PAYLOAD are terminal, FAILED is retryable).\n\n' +
      `At most ${MAX_BATCH_ACTIONS} actions per call.`,
  })
  @ApiOkResponse({ type: SyncBatchResponseDto })
  async flushBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SyncBatchDto,
  ): Promise<SyncBatchResponseDto> {
    return this.batch.execute(user.id, dto);
  }

  @Get('bootstrap')
  @ApiOperation({
    summary: 'Full snapshot of every offline-critical resource in one call',
    description:
      'For first app load or a fresh install. Returns the same per-resource envelope the ' +
      'individual routes return, keyed by resource, under one `serverTime` — so a client ' +
      'can reuse a single apply-a-delta routine for both paths. Each resource is capped at ' +
      'the default page size; if any comes back with a non-null `nextCursor`, drain that ' +
      'resource on its own route before treating the bootstrap as complete.',
  })
  async bootstrap(@CurrentUser() user: AuthenticatedUser) {
    return this.sync.bootstrap(user.id);
  }

  @Get('applications')
  @ApiOperation({
    summary: 'Applications changed since `since`',
    description: `Soft deletes are reported in \`deletes\`. ${ENVELOPE_NOTE}`,
  })
  @ApiOkResponse({ type: SyncEnvelopeDto })
  async applications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SyncQueryDto,
  ) {
    return this.sync.syncApplications(user.id, query);
  }

  @Get('profile')
  @ApiOperation({
    summary: 'The current user’s profile, if it changed since `since`',
    description: `At most one row. Soft deletes are reported in \`deletes\`. ${ENVELOPE_NOTE}`,
  })
  @ApiOkResponse({ type: SyncEnvelopeDto })
  async profile(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SyncQueryDto,
  ) {
    return this.sync.syncProfile(user.id, query);
  }

  @Get('experiences')
  @ApiOperation({
    summary: 'Work experience changed since `since`',
    description: `Soft deletes are reported in \`deletes\`. ${ENVELOPE_NOTE}`,
  })
  @ApiOkResponse({ type: SyncEnvelopeDto })
  async experiences(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SyncQueryDto,
  ) {
    return this.sync.syncExperiences(user.id, query);
  }

  @Get('education')
  @ApiOperation({
    summary: 'Education entries changed since `since`',
    description: `Soft deletes are reported in \`deletes\`. ${ENVELOPE_NOTE}`,
  })
  @ApiOkResponse({ type: SyncEnvelopeDto })
  async education(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SyncQueryDto,
  ) {
    return this.sync.syncEducation(user.id, query);
  }

  @Get('certifications')
  @ApiOperation({
    summary: 'Certifications changed since `since`',
    description: `Soft deletes are reported in \`deletes\`. ${ENVELOPE_NOTE}`,
  })
  @ApiOkResponse({ type: SyncEnvelopeDto })
  async certifications(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SyncQueryDto,
  ) {
    return this.sync.syncCertifications(user.id, query);
  }

  @Get('skills')
  @ApiOperation({
    summary: 'Skills changed since `since`',
    description: `Soft deletes are reported in \`deletes\`. ${ENVELOPE_NOTE}`,
  })
  @ApiOkResponse({ type: SyncEnvelopeDto })
  async skills(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SyncQueryDto,
  ) {
    return this.sync.syncSkills(user.id, query);
  }

  @Get('recommendations')
  @ApiOperation({
    summary: 'Recommendations changed since `since`',
    description:
      '`deletes` is ALWAYS empty: Recommendation is hard-deleted and has no `deletedAt`, ' +
      'so a withdrawn recommendation cannot be reported incrementally and will linger in ' +
      'the client cache until the next full sync (audit §2). ' +
      `${ENVELOPE_NOTE}`,
  })
  @ApiOkResponse({ type: SyncEnvelopeDto })
  async recommendations(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SyncQueryDto,
  ) {
    return this.sync.syncRecommendations(user.id, query);
  }

  @Get('saved-jobs')
  @ApiOperation({
    summary: 'The complete saved-jobs list (full replace, not a delta)',
    description:
      'Returns `fullReplace: true` and the ENTIRE list every time; `since` and `cursor` ' +
      'are accepted but ignored. SavedJob has neither `updatedAt` nor a soft delete ' +
      '(audit §2), so an unsave cannot be expressed as a delta — a partial response would ' +
      'leave removed bookmarks stuck in the cache. The resource is a short id list, so ' +
      'replacing it wholesale is cheap. Replace your local collection; do not merge.',
  })
  @ApiOkResponse({ type: SyncEnvelopeDto })
  async savedJobs(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SyncQueryDto,
  ) {
    return this.sync.syncSavedJobs(user.id, query);
  }
}
