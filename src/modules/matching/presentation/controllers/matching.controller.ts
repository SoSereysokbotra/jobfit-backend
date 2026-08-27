// RATE LIMITING (MENTOR_REVIEW_2026-08-18 §11). Only two routes here reach the AI
// service, and they are guarded PER ROUTE rather than at the class level:
//
//   GET /              — a cache read, EXCEPT when a row is stale, which since §6
//                        triggers a recompute (embed + LLM rerank) on the read path.
//   GET /by-job        — one embed per external job, called per page view.
//
// `for-job`, `skill-gap` and `scout` are deliberately NOT limited: all three are
// database reads plus arithmetic. `scout` in particular scores live now (§7) but
// `scoreJobs` never calls the AI service — verified, not assumed. Limiting them would
// cost real usability and buy nothing.
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { AiThrottlerGuard } from '@common/guards/ai-throttler.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { THROTTLERS } from '@config/throttler.config';
import { RecommendationsQueryService } from '../../application/services/recommendations-query.service';
import { MatchExternalJobUseCase } from '../../application/use-cases/match-external-job.use-case';
import { SkillGapService } from '../../application/services/skill-gap.service';
import { JobMatchService } from '../../application/services/job-match.service';
import { RecommendedJobDto } from '../dtos/recommended-job.dto';
import {
  ExternalJobMatchDto,
  ExternalJobMatchQueryDto,
} from '../dtos/external-job-match.dto';
import { SkillGapDto, SkillGapQueryDto } from '../dtos/skill-gap.dto';
import { JobMatchDto, JobMatchQueryDto } from '../dtos/job-match.dto';
import { ScoutMatchDto, ScoutQueryDto } from '../dtos/scout.dto';
import { MatchReadinessDto } from '../dtos/match-readiness.dto';

@ApiTags('Matching')
@ApiBearerAuth()
@Controller('recommendations')
export class MatchingController {
  constructor(
    private readonly recommendations: RecommendationsQueryService,
    private readonly matchExternalJob: MatchExternalJobUseCase,
    private readonly skillGap: SkillGapService,
    private readonly jobMatch: JobMatchService,
  ) {}

  @Get()
  @UseGuards(AiThrottlerGuard)
  @RateLimit(THROTTLERS.aiRecommendations.name)
  @ApiOperation({
    summary:
      'Personalized job recommendations for the current user (semantic match). ' +
      'Computed lazily on first request if not yet cached.',
  })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<RecommendedJobDto[]> {
    return this.recommendations.getForUser(user.id);
  }

  @Get('readiness')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Why the recommendations list is empty — or READY if it genuinely is not',
    description:
      'Call this when GET /recommendations returns an empty array. An empty list has ' +
      'four causes — no profile, embedding pending, embedding failed, or genuinely no ' +
      'matches — and only the last is about the user. Rendering the first three as ' +
      '"no jobs match you" tells a new candidate the product has nothing for them. ' +
      '`message` is written for display; `detail` is not.',
  })
  @ApiResponse({ status: 200, type: MatchReadinessDto })
  async readiness(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MatchReadinessDto> {
    return this.recommendations.getReadiness(user.id);
  }

  @Get('scout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'New high-match jobs for the extension’s passive background scout: jobs published ' +
      'since `since` (default: the last 7 days), scored live for this user and returned ' +
      'at/above minScore.',
    description:
      'Scored on demand rather than read from the recommendations cache. Reading the ' +
      'cache made the endpoint structurally unable to return a NEW job — a cached row ' +
      'only exists if a recompute ran, and nothing recomputes when a job is ingested — ' +
      'so it returned an empty list indefinitely. Scoring uses the same deterministic ' +
      'path that writes the cache, so a score here and on /recommendations agree. ' +
      'Dismissed jobs are excluded.',
  })
  @ApiResponse({ status: 200, type: [ScoutMatchDto] })
  async scout(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ScoutQueryDto,
  ): Promise<ScoutMatchDto[]> {
    return this.recommendations.getScout(user.id, query.minScore ?? 0, query.since);
  }

  @Get('for-job')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Match score for one job against the current user (job detail page). Uses the ' +
      'DETERMINISTIC scorer — embedding cosine for skills plus rule-based experience/' +
      'location/salary — not the LLM fitScore, which Phase C measured as uncorrelated ' +
      'with real fit.',
  })
  @ApiResponse({ status: 200, type: JobMatchDto })
  @ApiResponse({
    status: 204,
    description: 'No profile or unknown job — nothing to match against.',
  })
  async matchForJob(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: JobMatchQueryDto,
  ): Promise<JobMatchDto | undefined> {
    return (await this.jobMatch.matchForJob(user.id, query.jobId)) ?? undefined;
  }

  @Get('skill-gap')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Which of a job’s stated requirements the user’s résumé does not evidence. ' +
      'Deliberately returns NO match percentage: the LLM fitScore was measured as ' +
      'uncorrelated with real fit (Phase C), so only the requirement lists are served.',
  })
  @ApiResponse({ status: 200, type: SkillGapDto })
  async skillGapForJob(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SkillGapQueryDto,
  ): Promise<SkillGapDto> {
    return this.skillGap.analyse(user.id, query.jobId);
  }

  @Get('by-job')
  @UseGuards(AiThrottlerGuard)
  @RateLimit(THROTTLERS.aiMatch.name)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Match score for a job on an external site (browser extension). Scored ad ' +
      'hoc from identifiers only — the posting is never stored, and its ' +
      'description is never accepted.',
  })
  @ApiResponse({ status: 200, type: ExternalJobMatchDto })
  @ApiResponse({
    status: 204,
    description: 'No profile to match against — the extension shows its empty state.',
  })
  async byJob(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExternalJobMatchQueryDto,
  ): Promise<ExternalJobMatchDto | null> {
    const result = await this.matchExternalJob.execute(user.id, {
      title: query.title,
      company: query.company ?? null,
      location: query.location ?? null,
      remoteType: query.remoteType ?? null,
    });
    // No profile yet: return `data: null` (not undefined) so the envelope keeps a
    // `data` key and the extension resolves it to its empty state instead of
    // mis-reading the whole envelope as a match.
    if (!result) return null;

    return {
      externalId: query.externalId,
      source: query.source,
      overall: result.score,
      subScores: result.breakdown,
      semantic: result.semantic,
    };
  }
}
