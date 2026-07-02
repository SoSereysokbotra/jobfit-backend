import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import { SupabaseJwtPayload } from '@infra/supabase/supabase-auth.service';
import { JobService } from '../../application/job.service';
import { CreateJobDto } from '../dto/create-job.dto';
import { UpdateJobDto } from '../dto/update-job.dto';
import { JobResponseDto } from '../dto/job-response.dto';

@ApiTags('Job Management')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('employer')
@Controller('employer/jobs')
export class JobManagementController {
  constructor(private readonly jobService: JobService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new job posting (draft)' })
  create(
    @Body() dto: CreateJobDto,
    @CurrentUser() user: SupabaseJwtPayload,
  ): Promise<JobResponseDto> {
    // companyId comes from user profile in a real flow; simplified here
    const companyId = user.app_metadata['companyId'] as string;
    return this.jobService.create(dto, companyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a job posting' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
    @CurrentUser() user: SupabaseJwtPayload,
  ): Promise<JobResponseDto> {
    const companyId = user.app_metadata['companyId'] as string;
    return this.jobService.update(id, dto, companyId);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a draft job' })
  publish(
    @Param('id') id: string,
    @CurrentUser() user: SupabaseJwtPayload,
  ): Promise<JobResponseDto> {
    const companyId = user.app_metadata['companyId'] as string;
    return this.jobService.publish(id, companyId);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close an active job posting' })
  close(
    @Param('id') id: string,
    @CurrentUser() user: SupabaseJwtPayload,
  ): Promise<JobResponseDto> {
    const companyId = user.app_metadata['companyId'] as string;
    return this.jobService.close(id, companyId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft job posting' })
  delete(
    @Param('id') id: string,
    @CurrentUser() user: SupabaseJwtPayload,
  ): Promise<void> {
    const companyId = user.app_metadata['companyId'] as string;
    return this.jobService.delete(id, companyId);
  }
}
