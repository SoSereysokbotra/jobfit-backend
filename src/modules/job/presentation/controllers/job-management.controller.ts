import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { JobService } from '../../application/job.service';
import { CreateJobDto } from '../dto/create-job.dto';
import { UpdateJobDto } from '../dto/update-job.dto';
import { JobResponseDto } from '../dto/job-response.dto';

// NOTE: `companyId` is the employer authorization boundary (a job is owned by a
// company). The app JWT only carries { id, email, role }, and the Company module
// is not implemented yet, so there is no owner->company lookup available. As an
// interim we use `user.id` as the companyId stand-in.
// TODO(company): resolve the employer's real companyId via the Company module
// (owner userId -> company) once it exists, and replace the `user.id` usages below.

@ApiTags('Job Management')
@ApiBearerAuth()
@UseGuards(RolesGuard)
@Roles('EMPLOYER')
@Controller('employer/jobs')
export class JobManagementController {
  constructor(private readonly jobService: JobService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new job posting (draft)' })
  create(
    @Body() dto: CreateJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobResponseDto> {
    const companyId = user.id; // TODO(company): replace with real companyId lookup
    return this.jobService.create(dto, companyId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a job posting' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateJobDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobResponseDto> {
    const companyId = user.id; // TODO(company): replace with real companyId lookup
    return this.jobService.update(id, dto, companyId);
  }

  @Post(':id/publish')
  @ApiOperation({ summary: 'Publish a draft job' })
  publish(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobResponseDto> {
    const companyId = user.id; // TODO(company): replace with real companyId lookup
    return this.jobService.publish(id, companyId);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close an active job posting' })
  close(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<JobResponseDto> {
    const companyId = user.id; // TODO(company): replace with real companyId lookup
    return this.jobService.close(id, companyId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a draft job posting' })
  delete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const companyId = user.id; // TODO(company): replace with real companyId lookup
    return this.jobService.delete(id, companyId);
  }
}
