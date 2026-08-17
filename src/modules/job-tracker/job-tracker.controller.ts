// src/modules/job-tracker/job-tracker.controller.ts
//
// The Job Tracker board. Requires a JWT (global guard); every route is scoped to the
// caller — there is no route that reads or writes another user's board.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { JobTrackerService } from './job-tracker.service';
import {
  CreateTrackedJobDto,
  MoveTrackedJobDto,
  TrackedBoardDto,
  TrackedJobResponseDto,
  UpdateTrackedJobDto,
} from './dtos/tracked-job.dtos';

@ApiTags('Job Tracker')
@ApiBearerAuth()
@Controller('tracker')
export class JobTrackerController {
  constructor(private readonly tracker: JobTrackerService) {}

  @Get()
  @ApiOperation({
    summary: 'Your tracker board, grouped by stage',
    description:
      'Every stage is present, possibly empty, so the client renders all five columns ' +
      'without carrying its own copy of the vocabulary. Archived cards are excluded.',
  })
  @ApiOkResponse({ type: TrackedBoardDto })
  board(@CurrentUser() user: AuthenticatedUser): Promise<TrackedBoardDto> {
    return this.tracker.board(user.id);
  }

  @Get('archived')
  @ApiOperation({ summary: 'Cards you archived, most recent first' })
  @ApiOkResponse({ type: TrackedJobResponseDto, isArray: true })
  archived(@CurrentUser() user: AuthenticatedUser): Promise<TrackedJobResponseDto[]> {
    return this.tracker.archived(user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Add a job to your tracker',
    description:
      'Send `jobId` for a posting JobFits already holds — its title and company are ' +
      'copied from the posting. Otherwise send `title` and `companyName` for anything ' +
      'saved from elsewhere.',
  })
  @ApiOkResponse({ type: TrackedJobResponseDto })
  add(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTrackedJobDto,
  ): Promise<TrackedJobResponseDto> {
    return this.tracker.add(user.id, dto);
  }

  @Patch(':id/move')
  @ApiOperation({
    summary: 'Move a card (one drag)',
    description:
      '`position` is the index in the DESTINATION column, from 0; omit it to append. ' +
      'Any stage can follow any other — this is the user’s own board, not the employer ' +
      'pipeline, so moving backwards is a correction rather than an invalid transition.',
  })
  @ApiOkResponse({ type: TrackedJobResponseDto })
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveTrackedJobDto,
  ): Promise<TrackedJobResponseDto> {
    return this.tracker.move(user.id, id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a card’s details (not its stage)' })
  @ApiOkResponse({ type: TrackedJobResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTrackedJobDto,
  ): Promise<TrackedJobResponseDto> {
    return this.tracker.update(user.id, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a card — hidden from the board, not deleted' })
  @ApiOkResponse({ type: TrackedJobResponseDto })
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TrackedJobResponseDto> {
    return this.tracker.archive(user.id, id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Put an archived card back on the board' })
  @ApiOkResponse({ type: TrackedJobResponseDto })
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TrackedJobResponseDto> {
    return this.tracker.restore(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a card permanently' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.tracker.remove(user.id, id);
  }
}
