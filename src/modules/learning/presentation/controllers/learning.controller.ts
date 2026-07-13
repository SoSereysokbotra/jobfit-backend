// src/modules/learning/presentation/controllers/learning.controller.ts
//
// Learning-path endpoints. The global JwtAuthGuard secures by default; the skill-resources
// route is @Public (generic catalog data). Learning path is own-only.

import {
  Controller,
  ForbiddenException,
  Get,
  Param,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from '@common/guards/jwt-auth.guard';
import { UseGuards } from '@nestjs/common';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import {
  LearningPathService,
  LearningPathView,
  SkillResourcesView,
} from '../../application/services/learning-path.service';

@ApiTags('Learning')
@ApiBearerAuth()
@Controller()
export class LearningController {
  constructor(private readonly learningPathService: LearningPathService) {}

  @Get('learning-paths/:userId')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Skill-gap learning path for a user (own only)' })
  async learningPath(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<LearningPathView> {
    if (user.id !== userId) {
      throw new ForbiddenException(
        'You can only view your own learning path',
      );
    }
    return this.learningPathService.getLearningPath(userId);
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
