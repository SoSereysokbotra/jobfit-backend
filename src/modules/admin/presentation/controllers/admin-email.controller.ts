// src/modules/admin/presentation/controllers/admin-email.controller.ts
//
// Email Delivery Tracking (Feature 3). All routes require an ADMIN JWT (@Roles('ADMIN')).

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { EmailTrackingService } from '../../application/services/email-tracking.service';
import { SuppressEmailDto } from '../../application/dtos/suppress-email.dto';
import {
  BounceDto,
  EmailMetricsDto,
} from '../../application/dtos/email-response.dto';
import { AdminMessageResponseDto } from '../../application/dtos/admin-message-response.dto';

@ApiTags('Admin - Email')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/email')
export class AdminEmailController {
  constructor(private readonly emailTracking: EmailTrackingService) {}

  @Get('metrics')
  @ApiOperation({ summary: 'Email delivery metrics for the last 24 hours' })
  @ApiOkResponse({ type: EmailMetricsDto })
  getMetrics(): Promise<EmailMetricsDto> {
    return this.emailTracking.getMetrics();
  }

  @Get('bounces')
  @ApiOperation({ summary: 'Recent bounced / complained emails' })
  @ApiOkResponse({ type: BounceDto, isArray: true })
  getBounces(
    @Query('skip') skip = '0',
    @Query('take') take = '50',
  ): Promise<BounceDto[]> {
    const skipNum = Math.max(parseInt(skip, 10) || 0, 0);
    const takeNum = Math.min(parseInt(take, 10) || 50, 100);
    return this.emailTracking.getBounces(skipNum, takeNum);
  }

  @Post('suppress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add an email address to the suppression list' })
  @ApiOkResponse({ type: AdminMessageResponseDto })
  async suppress(
    @Body() dto: SuppressEmailDto,
    @CurrentUser('id') adminId: string,
  ): Promise<AdminMessageResponseDto> {
    await this.emailTracking.suppress(adminId, dto.email);
    return new AdminMessageResponseDto('Email address suppressed.');
  }
}
