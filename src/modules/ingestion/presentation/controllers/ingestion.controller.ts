// src/modules/ingestion/presentation/controllers/ingestion.controller.ts
//
// Employer-managed manual trigger for a job-ingestion run (FR-JOBS-001). Global
// JwtAuthGuard + RolesGuard enforce auth; @Roles('EMPLOYER') restricts it to the
// employer dashboard. A scheduled 6-hour cron can call IngestionService directly
// later. (Ingested jobs stay employer-less — pulled into the shared pool.)

import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@common/decorators/roles.decorator';
import { IngestionService } from '../../ingestion.service';
import { ImportedJob, IngestionResult, JobSource } from '../../ingestion.types';

/**
 * Boards this route may trigger. A literal list rather than a cast of whatever the caller
 * sends, so an unknown source is a 400 instead of an undefined lookup at runtime.
 */
const INGESTABLE: JobSource[] = ['THEMUSE', 'BONGTHOM', 'JOBNET'];

@ApiTags('Employer - Ingestion')
@ApiBearerAuth()
@Roles('EMPLOYER')
@Controller('employer/ingest')
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post('themuse')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger a TheMuse job-ingestion run',
    description:
      'Fetches `pages` pages (1–10, default 1) from TheMuse, normalizes them, ' +
      'upserts companies, dedups by source+externalId, and stores PUBLISHED jobs.',
  })
  runTheMuse(@Query('pages') pages?: string): Promise<IngestionResult> {
    const parsed = Number.parseInt(pages ?? '1', 10);
    const n = Math.min(Math.max(Number.isNaN(parsed) ? 1 : parsed, 1), 10);
    return this.ingestion.ingestFromTheMuse(n);
  }

  @Post(':source')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger an ingestion run for one board',
    description:
      'source = THEMUSE | BONGTHOM | JOBNET. `limit` (1–300, default 50) caps how many ' +
      'postings the run pulls. BONGTHOM is read from its own RSS feed only — the site ' +
      'marks its descriptions user-select:none and omits them from the feed, so we take ' +
      'the listing it syndicates and nothing more. See docs/INGESTION_KH_PLAN.md.',
  })
  run(
    @Param('source') source: string,
    @Query('limit') limit?: string,
  ): Promise<IngestionResult> {
    const key = source.toUpperCase();
    if (!INGESTABLE.includes(key as JobSource)) {
      throw new BadRequestException(
        `Unknown source "${source}". Expected one of: ${INGESTABLE.join(', ')}.`,
      );
    }
    const parsed = Number.parseInt(limit ?? '50', 10);
    const n = Math.min(Math.max(Number.isNaN(parsed) ? 50 : parsed, 1), 300);
    return this.ingestion.ingest(key as JobSource, n);
  }

  @Get('jobs')
  @ApiOperation({
    summary: 'List imported (externally ingested) jobs',
    description: 'Jobs pulled in from external sources, most-recently-seen first.',
  })
  listImported(@Query('limit') limit?: string): Promise<ImportedJob[]> {
    const parsed = Number.parseInt(limit ?? '100', 10);
    const n = Math.min(Math.max(Number.isNaN(parsed) ? 100 : parsed, 1), 200);
    return this.ingestion.listImported(n);
  }
}
