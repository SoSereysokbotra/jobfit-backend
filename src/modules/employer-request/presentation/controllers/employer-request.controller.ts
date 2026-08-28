// src/modules/employer-request/presentation/controllers/employer-request.controller.ts
//
// The public half of employer onboarding: submit a request, and later activate the account
// an admin approved. Both are @Public() — the caller has no account yet, which is the whole
// point of the flow.

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';
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
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ask to join JobFit as an employer',
    description:
      'Employers cannot self-register — the public signup form can only create a job ' +
      'seeker. This submits a request for an admin to review. The response deliberately ' +
      'reveals nothing about whether the address already has an account: answering that ' +
      'to an anonymous caller would make this an account-enumeration oracle.',
  })
  @ApiResponse({ status: 201, type: EmployerRequestReceiptDto })
  @ApiResponse({
    status: 409,
    description: 'A request for this address is already under review.',
  })
  submit(
    @Body() dto: CreateEmployerRequestDto,
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
