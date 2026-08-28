// src/modules/employer-request/presentation/controllers/admin-employer-request.controller.ts
//
// The admin review queue. All routes require an ADMIN JWT (@Roles('ADMIN')).

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
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';

import { EmployerRequestService } from '../../application/services/employer-request.service';
import { EmployerApprovalService } from '../../application/services/employer-approval.service';
import {
  ApproveEmployerRequestDto,
  EmployerRequestDto,
  EmployerRequestListDto,
  EmployerRequestMessageDto,
  ListEmployerRequestsQueryDto,
  ReviewEmployerRequestDto,
} from '../../application/dtos/employer-request.dtos';

@ApiTags('Admin - Employer Requests')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/employer-requests')
export class AdminEmployerRequestController {
  constructor(
    private readonly requests: EmployerRequestService,
    private readonly approval: EmployerApprovalService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'The employer review queue',
    description:
      'Oldest first — the order the queue is worked, and the order the 48-hour SLA cares ' +
      'about. Each row carries `hoursAwaitingDecision`, `breachesSla` and ' +
      '`isPublicDomain`, all computed per request so none of them can go stale.',
  })
  @ApiOkResponse({ type: EmployerRequestListDto })
  list(
    @Query() query: ListEmployerRequestsQueryDto,
  ): Promise<EmployerRequestListDto> {
    return this.requests.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One employer request' })
  @ApiOkResponse({ type: EmployerRequestDto })
  @ApiResponse({ status: 404, description: 'No such request.' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<EmployerRequestDto> {
    return this.requests.getById(id);
  }

  @Patch(':id/review')
  @ApiOperation({
    summary: 'Move a request to REVIEWING, PENDING_INFO or REJECTED',
    description:
      'Approval is not here — it creates an account, so it has its own route, payload and ' +
      'transaction. A rejection requires `adminNotes`; that text is emailed to the ' +
      'employer verbatim.',
  })
  @ApiOkResponse({ type: EmployerRequestDto })
  @ApiResponse({ status: 400, description: 'Rejecting without a reason.' })
  @ApiResponse({ status: 409, description: 'Already approved or rejected.' })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewEmployerRequestDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<EmployerRequestDto> {
    return this.requests.review(id, admin.id, dto);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve: create the employer account and email an activation code',
    description:
      'The only path in the system that creates an EMPLOYER account. `companyId` records ' +
      'WHICH company this employer is approved for, and first-login claim is checked ' +
      'against it. The account is created unverified with no password; the emailed code is ' +
      'what makes it usable.',
  })
  @ApiOkResponse({ type: EmployerRequestDto })
  @ApiResponse({ status: 404, description: 'No such request, or no such company.' })
  @ApiResponse({
    status: 409,
    description:
      'Already decided, or the email already belongs to an account — the conflict the ' +
      'admin UI resolves by asking for a different address or rejecting.',
  })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveEmployerRequestDto,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<EmployerRequestDto> {
    return this.approval.approve(id, admin.id, dto);
  }

  @Post(':id/resend-activation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Re-issue an activation code',
    description:
      'For an employer whose code expired or never arrived. The previous code stops ' +
      'working immediately.',
  })
  @ApiOkResponse({ type: EmployerRequestMessageDto })
  @ApiResponse({ status: 409, description: 'The request is not approved.' })
  resend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ): Promise<EmployerRequestMessageDto> {
    return this.approval.resendActivation(id, admin.id);
  }
}
