// src/modules/saved-job/presentation/controllers/saved-job.controller.ts
//
// Saved-jobs endpoints. Every route is user-scoped via the JWT (@CurrentUser) —
// a user only ever reads/writes their own bookmarks, so there is no :userId param
// and no ownership check to get wrong.
//
// Contract (all mutations return the refreshed id list so the client cache can
// replace it wholesale):
//   GET    /saved-jobs                 -> { jobIds }
//   POST   /saved-jobs        { jobId} -> { jobIds }
//   POST   /saved-jobs/:jobId/toggle   -> { jobIds }
//   DELETE /saved-jobs/:jobId          -> { jobIds }

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { SavedJobService } from '../../saved-job.service';
import { SaveJobDto } from '../../dto/save-job.dto';
import { SavedJobsResponseDto } from '../../dto/saved-jobs-response.dto';

@ApiTags('Saved Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('saved-jobs')
export class SavedJobController {
  constructor(private readonly savedJobService: SavedJobService) {}

  @Get()
  @ApiOperation({ summary: 'List the current user’s saved job ids' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SavedJobsResponseDto> {
    const jobIds = await this.savedJobService.listJobIds(user.id);
    return new SavedJobsResponseDto(jobIds);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save a job' })
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveJobDto,
  ): Promise<SavedJobsResponseDto> {
    const jobIds = await this.savedJobService.save(user.id, dto.jobId);
    return new SavedJobsResponseDto(jobIds);
  }

  @Post(':jobId/toggle')
  @ApiOperation({ summary: 'Toggle a job’s saved state' })
  async toggle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ): Promise<SavedJobsResponseDto> {
    const jobIds = await this.savedJobService.toggle(user.id, jobId);
    return new SavedJobsResponseDto(jobIds);
  }

  @Delete(':jobId')
  @ApiOperation({ summary: 'Remove a job from the saved list' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ): Promise<SavedJobsResponseDto> {
    const jobIds = await this.savedJobService.remove(user.id, jobId);
    return new SavedJobsResponseDto(jobIds);
  }
}
