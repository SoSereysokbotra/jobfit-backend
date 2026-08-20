// src/modules/saved-job/presentation/controllers/saved-external-job.controller.ts
//
// "Save Job" for postings on sites we don't ingest — the browser extension's form.
// User-scoped via the JWT, so there is no :userId param and no ownership check to get
// wrong; the delete carries the userId into its WHERE for the same reason.
//
//   POST   /saved-jobs/external          -> the saved job
//   GET    /saved-jobs/external          -> this user's saved jobs, newest first
//   GET    /saved-jobs/external/lookup   -> the saved copy of one posting, or null
//   DELETE /saved-jobs/external/:id      -> { removed: boolean }
//
// A separate controller from the jobId-based one so `external` can never be parsed as a
// `:jobId` by a future route change.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser, JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { SavedExternalJobService } from '../../saved-external-job.service';
import {
  SaveExternalJobDto,
  SavedExternalJobDto,
} from '../../dto/save-external-job.dto';
import { LookupExternalJobDto } from '../../dto/lookup-external-job.dto';

@ApiTags('Saved Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('saved-jobs/external')
export class SavedExternalJobController {
  constructor(private readonly service: SavedExternalJobService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save a job from the browser extension (a site we do not ingest)',
    description:
      'Re-saving the same posting UPDATES it — pressing save twice means correcting the ' +
      'salary or notes, not asking for a duplicate. Ungated: the extension has no tiers.',
  })
  @ApiResponse({ status: 200, type: SavedExternalJobDto })
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveExternalJobDto,
  ): Promise<SavedExternalJobDto> {
    return this.service.save(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'The current user’s externally-saved jobs, newest first' })
  @ApiResponse({ status: 200, type: [SavedExternalJobDto] })
  list(@CurrentUser() user: AuthenticatedUser): Promise<SavedExternalJobDto[]> {
    return this.service.list(user.id);
  }

  // Declared before any future ':id' GET so the literal always wins the match.
  @Get('lookup')
  @ApiOperation({
    summary: 'The saved copy of one posting, or null — lets the extension show "Saved"',
  })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: LookupExternalJobDto,
  ): Promise<SavedExternalJobDto | null> {
    return this.service.findOne(user.id, query.source, query.externalId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a saved job' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ removed: boolean }> {
    return { removed: await this.service.remove(user.id, id) };
  }
}
