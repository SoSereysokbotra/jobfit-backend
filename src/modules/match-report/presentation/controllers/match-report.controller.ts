// src/modules/match-report/presentation/controllers/match-report.controller.ts
//
// The extension writes a report; the web app reads it back. Both routes sit behind the
// global JwtAuthGuard, and the read is owner-scoped — a report is a picture of someone's
// résumé, so an id alone must never be enough to see one.

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { AiThrottlerGuard } from '@common/guards/ai-throttler.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { THROTTLERS } from '@config/throttler.config';
import { MatchReportService } from '../../application/match-report.service';
import { MatchReportRepository } from '../../infrastructure/match-report.repository';
import { MatchReportPayload } from '../../domain/match-report-payload';
import {
  CreateMatchReportDto,
  CreateMatchReportResponseDto,
} from '../dto/match-report.dto';

@ApiTags('Match Report')
@ApiBearerAuth()
@Controller('match-report')
export class MatchReportController {
  constructor(
    private readonly service: MatchReportService,
    private readonly reports: MatchReportRepository,
  ) {}

  // Guard on THIS route only, not the class: GET /:id below is a plain database read.
  // A guarded route with no @RateLimit is subject to EVERY named throttler, so a
  // class-level guard would quietly hold the report read to the strictest auth limit.
  @Post()
  @UseGuards(AiThrottlerGuard)
  @RateLimit(THROTTLERS.aiReport.name)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Generate a full-page match report for the job the extension is looking at. ' +
      'Ungated (the extension has no premium tier) but rate limited per account. The ' +
      'posting text is used once to extract requirements and is not stored as a listing. ' +
      'Re-opening the SAME posting with unchanged text returns the existing report ' +
      'without spending an AI call.',
  })
  @ApiResponse({ status: 200, type: CreateMatchReportResponseDto })
  @ApiResponse({ status: 429, description: 'Per-account AI rate limit exceeded.' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMatchReportDto,
  ): Promise<CreateMatchReportResponseDto> {
    const id = await this.service.generate(user.id, {
      externalId: dto.externalId,
      source: dto.source,
      title: dto.title,
      company: dto.company ?? null,
      location: dto.location ?? null,
      jobDescription: dto.jobDescription,
    });
    return { id };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'The stored report payload. Owner-only.' })
  @ApiResponse({ status: 200, description: 'The report payload, or null if not found.' })
  @ApiResponse({ status: 403, description: 'The report belongs to someone else.' })
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<MatchReportPayload | null> {
    const report = await this.reports.findById(id);
    // `null`, never `undefined`: the response interceptor drops an undefined `data` key
    // entirely, and the extension's unwrap() then hands the whole envelope to the UI.
    if (!report) return null;
    if (report.userId !== user.id) {
      throw new ForbiddenException('This report belongs to another account.');
    }
    return report.payload;
  }
}
