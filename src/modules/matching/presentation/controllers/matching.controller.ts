import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
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
  @ApiOperation({
    summary:
      'Personalized job recommendations for the current user (semantic match). ' +
      'Computed lazily on first request if not yet cached.',
  })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<RecommendedJobDto[]> {
    return this.recommendations.getForUser(user.id);
  }

  @Get('scout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'New high-match jobs for the extension’s passive background scout: the ' +
      'user’s recommendations at/above minScore, optionally newer than `since`.',
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
