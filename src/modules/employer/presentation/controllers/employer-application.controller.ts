// src/modules/employer/presentation/controllers/employer-application.controller.ts
//
// Application Pipeline (Feature 3). All routes require an EMPLOYER JWT (@Roles('EMPLOYER'))
// and are scoped to the employer's company.

import {
  Body,
  Controller,
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
