// src/modules/employer-request/presentation/controllers/employer-request.controller.ts
//
// Employer onboarding intake and activation.
//
// Intake is ADMIN-ONLY. employer_logic.md v2.1 §3.1 is explicit — "Employers cannot register
// via the public website. The process is entirely admin-controlled" — and §4.1 has the
// employer email or Telegram the admin, who enters the request. A public endpoint here would
// be self-registration by another name.
//
// Activation stays @Public(): the employer has an account by then but cannot sign in with
// it, so there is no token to authenticate with.

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { EmployerRequestService } from '../../application/services/employer-request.service';
import { EmployerApprovalService } from '../../application/services/employer-approval.service';
import {
  ActivateEmployerAccountDto,
  CreateEmployerRequestDto,
  EmployerRequestMessageDto,
  EmployerRequestReceiptDto,
} from '../../application/dtos/employer-request.dtos';

@ApiTags('Employer Onboarding')
@Controller('employer-requests')
export class EmployerRequestController {
  constructor(
    private readonly requests: EmployerRequestService,
    private readonly approval: EmployerApprovalService,
  ) {}

  @Post()
  @Roles('ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Record an employer request the admin received by email or Telegram',
    description:
      'ADMIN ONLY, per employer_logic.md v2.1 §3.1. Employers reach the admin through ' +
      'email or Telegram; the admin transcribes what they sent into the queue. There is ' +
      'no public intake path by design.',
  })
  @ApiResponse({ status: 201, type: EmployerRequestReceiptDto })
  @ApiResponse({
    status: 409,
    description: 'A request for this address is already under review.',
  })
  submit(
    @Body() dto: CreateEmployerRequestDto,
    @CurrentUser() _admin: AuthenticatedUser,
  ): Promise<EmployerRequestReceiptDto> {
    return this.requests.submit(dto);
  }

  @Post('activate')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate an approved employer account',
    description:
      'Exchanges the 6-digit code emailed on approval for a working account, with a ' +
      'password the employer chooses. No password is ever sent to them. Until this ' +
      'succeeds the account cannot sign in: it is created unverified with an empty hash, ' +
      'and login refuses unverified accounts.',
  })
  @ApiResponse({ status: 200, type: EmployerRequestMessageDto })
  @ApiResponse({
    status: 400,
    description:
      'Invalid or expired code. Identical for an unknown address, so the endpoint cannot ' +
      'be used to discover which employers were approved.',
  })
  activate(
    @Body() dto: ActivateEmployerAccountDto,
  ): Promise<EmployerRequestMessageDto> {
    return this.approval.activate(dto);
  }
}
