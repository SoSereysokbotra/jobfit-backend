import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RecommendationsQueryService } from '../../application/services/recommendations-query.service';
import { MatchExternalJobUseCase } from '../../application/use-cases/match-external-job.use-case';
import { SkillGapService } from '../../application/services/skill-gap.service';
import { RecommendedJobDto } from '../dtos/recommended-job.dto';
import {
  ExternalJobMatchDto,
  ExternalJobMatchQueryDto,
} from '../dtos/external-job-match.dto';
import { SkillGapDto, SkillGapQueryDto } from '../dtos/skill-gap.dto';

@ApiTags('Matching')
@ApiBearerAuth()
@Controller('recommendations')
export class MatchingController {
  constructor(
    private readonly recommendations: RecommendationsQueryService,
    private readonly matchExternalJob: MatchExternalJobUseCase,
    private readonly skillGap: SkillGapService,
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
  ): Promise<ExternalJobMatchDto | undefined> {
    const result = await this.matchExternalJob.execute(user.id, {
      title: query.title,
      company: query.company ?? null,
      location: query.location ?? null,
      remoteType: query.remoteType ?? null,
    });
    // No profile yet: return an empty body (204) rather than a fabricated score.
    if (!result) return undefined;

    return {
      externalId: query.externalId,
      source: query.source,
      overall: result.score,
      subScores: result.breakdown,
      semantic: result.semantic,
    };
  }
}
