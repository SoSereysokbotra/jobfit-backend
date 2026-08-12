// src/modules/learning/presentation/controllers/learning.controller.ts
//
// Learning endpoints. The global JwtAuthGuard secures by default; the skill-resources route
// is @Public (generic catalog data). Skill gaps are own-only, scoped by the token.

import { Controller, Get, Param, Query } from '@nestjs/common';
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
import { UseGuards } from '@nestjs/common';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import {
  LearningPathService,
  SkillResourcesView,
} from '../../application/services/learning-path.service';
import { SkillGapSummaryDto } from '../../application/dtos/skill-gap-summary.dto';
import {
  ExternalGapQueryDto,
  ExternalSkillGapReportDto,
} from '../../application/dtos/external-skill-gap.dto';

@ApiTags('Learning')
@ApiBearerAuth()
@Controller()
export class LearningController {
  constructor(private readonly learningPathService: LearningPathService) {}

  @Get('learning/skill-gaps')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'What the jobs you applied to ask for that your CV does not evidence',
    description:
      'Gaps are drawn from YOUR applications, so they follow your field: a teacher gets ' +
      'teaching requirements, a welder welding ones. `requiredBy` is a count of how many ' +
      'of your applications ask for it — with the job titles behind it, so the number can ' +
      'be checked — and `source` says whether the requirement is the employer’s own words ' +
      'or the model’s reading of a free-text posting.\n\n' +
      'Three empty answers, and they are NOT the same: `hasApplications: false` (nothing ' +
      'to compute from), `hasParsedResume: false` (no skills to compare against, so every ' +
      'requirement would look like a gap), and an empty `gaps` with both flags true (you ' +
      'genuinely cover what these jobs asked for). Clients must render them differently.',
  })
  @ApiOkResponse({ type: SkillGapSummaryDto })
  async skillGaps(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SkillGapSummaryDto> {
    // The user id comes from the token, not the path. The route below takes one and then
    // refuses anyone else's — a permission check defending a parameter that should not
    // have been there.
    return this.learningPathService.getSkillGaps(user.id);
  }

  // GET learning-paths/:userId is gone. It returned ten hardcoded technology skills as
  // anyone's learning path, and took a user id in the path only to refuse everybody else's.
  // GET learning/skill-gaps above replaces it and reads the id from the token.

  @Get('learning/gap')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Skill gaps for the extension, scoped to roles similar to the viewed job ' +
      '(by title). Field-aware; not a market-wide in-demand-skills list.',
  })
  @ApiOkResponse({ type: ExternalSkillGapReportDto })
  async externalGap(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExternalGapQueryDto,
  ): Promise<ExternalSkillGapReportDto> {
    return this.learningPathService.getExternalJobGaps(
      user.id,
      query.jobExternalId,
      query.source,
      query.title,
    );
  }

  @Get('skills/:skillId/learning-resources')
  @Public()
  @ApiOperation({ summary: 'Learning resources for a skill (public)' })
  async skillResources(
    @Param('skillId') skillId: string,
  ): Promise<SkillResourcesView> {
    return this.learningPathService.getSkillLearningResources(skillId);
  }
}
