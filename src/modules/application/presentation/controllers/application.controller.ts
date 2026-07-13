// src/modules/application/presentation/controllers/application.controller.ts
//
// Application endpoints. Returns ApplicationResponseDto. Every id-scoped route enforces
// ownership (assertOwned) so a user only touches their own applications.
//
// AUTH NOTE: docs' SupabaseAuthGuard -> global JwtAuthGuard (self-JWT); this controller also
// carries an explicit class-level @UseGuards(JwtAuthGuard).

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ApplicationService } from '../../application.service';
import { SubmitApplicationDto } from '../../dto/submit-application.dto';
import { AddContactPersonDto } from '../../dto/add-contact-person.dto';
import { UpdateApplicationStatusDto } from '../../dto/update-status.dto';
import { ApplicationResponseDto } from '../../dto/application-response.dto';
import { Application } from '../../domain/entities/application.entity';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';

@ApiTags('Applications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationController {
  constructor(private readonly applicationService: ApplicationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit an application to a job' })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitApplicationDto,
  ): Promise<ApplicationResponseDto> {
    const application = await this.applicationService.submitApplication(
      user.id,
      dto,
    );
    return new ApplicationResponseDto(application);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user’s applications' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ApplicationStatus,
  ): Promise<ApplicationResponseDto[]> {
    const applications = await this.applicationService.getApplications(user.id);
    const filtered = status
      ? applications.filter((a) => a.status === status)
      : applications;
    return filtered.map((a) => new ApplicationResponseDto(a));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of your applications' })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ApplicationResponseDto> {
    const application = await this.assertOwned(id, user);
    return new ApplicationResponseDto(application);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update an application’s status' })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ): Promise<ApplicationResponseDto> {
    await this.assertOwned(id, user);
    const application = await this.applicationService.updateStatus(
      id,
      dto.newStatus,
    );
    return new ApplicationResponseDto(application);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get an application’s timeline' })
  async timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<
    Array<{
      id: string;
      status: ApplicationStatus;
      eventType: string;
      description?: string;
      eventDate: Date;
    }>
  > {
    await this.assertOwned(id, user);
    const entries = await this.applicationService.getApplicationTimeline(id);
    return entries.map((e) => ({
      id: e.id,
      status: e.status,
      eventType: e.eventType,
      description: e.description,
      eventDate: e.eventDate,
    }));
  }

  @Post(':id/contact-person')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Attach a contact person to an application' })
  async addContactPerson(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddContactPersonDto,
  ): Promise<{ id: string }> {
    await this.assertOwned(id, user);
    const contact = await this.applicationService.addContactPerson(id, dto);
    return { id: contact.id };
  }

  /** Load an application and assert the caller owns it (404 if missing, 403 if not owner). */
  private async assertOwned(
    id: string,
    user: AuthenticatedUser,
  ): Promise<Application> {
    const application = await this.applicationService.getApplication(id);
    if (application.userId !== user.id) {
      throw new ForbiddenException('You can only access your own applications');
    }
    return application;
  }
}
