// src/modules/employer/presentation/controllers/employer-job.controller.ts
//
// Job Posting (Feature 2). Owns the `employer/jobs` surface (replaces the job module's
// earlier placeholder controller). All routes require an EMPLOYER JWT (@Roles('EMPLOYER'))
// and are scoped to the employer's own company.

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
import { CreateJobDto } from '@modules/job/presentation/dto/create-job.dto';
import { UpdateJobDto } from '@modules/job/presentation/dto/update-job.dto';
import { JobResponseDto } from '@modules/job/presentation/dto/job-response.dto';
import { EmployerJobService } from '../../application/services/employer-job.service';
import { JobAnalyticsResponseDto } from '../../application/dtos/job-analytics-response.dto';

@ApiTags('Employer - Jobs')
@ApiBearerAuth()
@Roles('EMPLOYER')
@Controller('employer/jobs')
export class EmployerJobController {
  constructor(private readonly jobService: EmployerJobService) {}

  @Get()
  @ApiOperation({ summary: "List your company's job postings" })
  @ApiOkResponse({ type: JobResponseDto, isArray: true })
  listMine(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobResponseDto[]> {
    return this.jobService.listMine(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new job posting (draft)' })
  @ApiOkResponse({ type: JobResponseDto })
  create(
    @Body() dto: CreateJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobResponseDto> {
    return this.jobService.create(user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a job posting' })
  @ApiOkResponse({ type: JobResponseDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobResponseDto> {
    return this.jobService.update(user.id, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish a draft job' })
  @ApiOkResponse({ type: JobResponseDto })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobResponseDto> {
    return this.jobService.publish(user.id, id);
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'View job analytics (applications, match score)' })
  @ApiOkResponse({ type: JobAnalyticsResponseDto })
  analytics(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobAnalyticsResponseDto> {
    return this.jobService.getAnalytics(user.id, id);
  }
}
