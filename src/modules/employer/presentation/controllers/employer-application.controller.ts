// src/modules/employer/presentation/controllers/employer-application.controller.ts
//
// Application Pipeline (Feature 3). All routes require an EMPLOYER JWT (@Roles('EMPLOYER'))
// and are scoped to the employer's company.

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
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { EmployerApplicationService } from '../../application/services/employer-application.service';
import { ListApplicationsQueryDto } from '../../application/dtos/list-applications.query.dto';
import { UpdateApplicationStatusDto } from '../../application/dtos/update-application-status.dto';
import { AddApplicationNotesDto } from '../../application/dtos/add-application-notes.dto';
import { EmployerApplicationResponseDto } from '../../application/dtos/employer-application-response.dto';
import { ResumeDownloadDto } from '../../application/dtos/resume-download.dto';
import {
  ApplicationNotesUpdatedDto,
  ApplicationStatusUpdatedDto,
} from '../../application/dtos/pipeline-action-response.dto';

@ApiTags('Employer - Applications')
@ApiBearerAuth()
@Roles('EMPLOYER')
@Controller('employer/applications')
export class EmployerApplicationController {
  constructor(private readonly appService: EmployerApplicationService) {}

  @Get()
  @ApiOperation({ summary: 'List applications for your jobs (pipeline)' })
  @ApiOkResponse({ type: EmployerApplicationResponseDto, isArray: true })
  list(
    @Query() query: ListApplicationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<EmployerApplicationResponseDto[]> {
    return this.appService.list(user.id, query);
  }

  @Get(':id/resume')
  @ApiOperation({
    summary: 'Download link for the CV this candidate applied with',
    description:
      'Returns a signed, time-limited URL to the résumé recorded on the application — ' +
      'the document the candidate actually submitted, not whichever CV is their default ' +
      'now. Scoped to your own company: an application to someone else’s job is 403. ' +
      '404 when the candidate applied without a CV, or has since deleted it. The link is ' +
      'minted per request and expires in minutes; do not cache or share it.',
  })
  @ApiOkResponse({ type: ResumeDownloadDto })
  @ApiResponse({ status: 403, description: 'Not an application to one of your jobs.' })
  @ApiResponse({ status: 404, description: 'No application, or no résumé to download.' })
  resume(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ResumeDownloadDto> {
    return this.appService.getResumeDownload(user.id, id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Move a candidate to a new pipeline stage' })
  @ApiOkResponse({ type: ApplicationStatusUpdatedDto })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApplicationStatusUpdatedDto> {
    return this.appService.updateStatus(user.id, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hide an application from your board',
    description:
      'A view preference, not a decision: no status change and no audit row. The ' +
      'candidate still sees the application exactly as before. This replaces the old ' +
      'shared ARCHIVED status, under which either side’s tidying rewrote the other’s view.',
  })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.appService.setArchived(user.id, id, true);
  }

  @Delete(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Restore an application to your board' })
  unarchive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.appService.setArchived(user.id, id, false);
  }

  @Post(':id/notes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Attach/replace employer notes on an application' })
  @ApiOkResponse({ type: ApplicationNotesUpdatedDto })
  addNotes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddApplicationNotesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApplicationNotesUpdatedDto> {
    return this.appService.addNotes(user.id, id, dto);
  }
}
