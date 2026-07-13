// src/modules/user/presentation/controllers/analytics.controller.ts
//
// Current-user analytics (Phase 11). Self-scoped: always the JWT subject's stats.

import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { UserAnalyticsService } from '../../application/services/user-analytics.service';
import { AnalyticsStatsResponseDto } from '../../application/dtos/analytics-stats.dto';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly userAnalyticsService: UserAnalyticsService) {}

  @Get('my-stats')
  @ApiOperation({ summary: 'Get the current user’s funnel + engagement stats' })
  async myStats(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AnalyticsStatsResponseDto> {
    return this.userAnalyticsService.getMyStats(user.id);
  }
}
