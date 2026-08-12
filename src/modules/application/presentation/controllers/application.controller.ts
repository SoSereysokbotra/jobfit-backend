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
  Delete,
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
import { Idempotent } from '@common/idempotency/idempotent.decorator';
import { ApplicationService } from '../../application.service';
import { SubmitApplicationDto } from '../../dto/submit-application.dto';
import { AddContactPersonDto } from '../../dto/add-contact-person.dto';
import { UpdateApplicationStatusDto } from '../../dto/update-status.dto';
import { ApplicationResponseDto } from '../../dto/application-response.dto';
import {
  DuplicateApplicationDto,
  SimilarApplicationQueryDto,
} from '../../dto/similar-application.dto';
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
  @Idempotent()
  @ApiOperation({
    summary: 'Submit an application to a job',
    description:
      'Send an `Idempotency-Key` header to make a retry safe: the replay returns the ' +
      'original response instead of submitting twice.',
  })
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
    @Query('includeArchived') includeArchived?: string,
  ): Promise<ApplicationResponseDto[]> {
    const applications = await this.applicationService.getApplications(
      user.id,
      0,
      20,
      includeArchived === 'true',
    );
    const filtered = status
      ? applications.filter((a) => a.status === status)
      : applications;
    return filtered.map((a) => new ApplicationResponseDto(a));
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hide an application from your own list',
    description:
      'A view preference, not a decision. The application keeps its real status and the ' +
      'employer still sees it exactly as before — they have a separate flag of their own. ' +
      'This replaces the old ARCHIVED status, under which tidying your list removed a ' +
      'hire from the employer’s board and erased that you had been hired.',
  })
  async archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.assertOwned(id, user);
    await this.applicationService.setArchived(id, true);
  }

  @Delete(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Restore an application to your list' })
  async unarchive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.assertOwned(id, user);
    await this.applicationService.setArchived(id, false);
  }

  // MUST be declared before `@Get(':id')` so "/applications/similar" matches this
  // static route instead of being read as an application id.
  @Get('similar')
  @ApiOperation({
    summary:
      'Find a prior application to the same company + role (extension duplicate detector).',
  })
  async similar(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SimilarApplicationQueryDto,
  ): Promise<DuplicateApplicationDto | null> {
    return this.applicationService.findSimilarApplication(
      user.id,
      query.jobTitle,
      query.companyName,
    );
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
  @ApiOperation({
    summary: 'Update your own application’s status',
    description:
      'A candidate may WITHDRAW or ARCHIVE their application, and ACCEPT or start ' +
      'NEGOTIATING an offer they have received. Statuses that record an EMPLOYER ' +
      'decision — SCREENING, INTERVIEW, OFFER, REJECTED — are refused with 403.',
  })
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateApplicationStatusDto,
  ): Promise<ApplicationResponseDto> {
    await this.assertOwned(id, user);

    // Ownership is NOT enough — a candidate setting OFFER or ACCEPTED would fabricate a
    // hiring outcome that shows up in the employer's pipeline as though the employer had
    // decided it. That rule used to be re-stated here; it now lives in the transition
    // service with every other lifecycle rule, and raises the same 403.
    const application = await this.applicationService.updateStatus(
      id,
      dto.newStatus,
      user.id,
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
