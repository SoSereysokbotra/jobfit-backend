// src/modules/employer-request/presentation/controllers/employer-request.controller.ts
//
// Employer onboarding intake and activation. Both @Public().
//
// SUBMITTING A REQUEST IS NOT REGISTERING. employer_logic.md §3.1 forbids an employer
// obtaining an ACCOUNT through the website, and that still holds: this endpoint writes a row
// to a review queue and grants nothing. No account, no password, no login exists until an
// admin approves the request and picks the company. The gate did not move — only who types
// the six fields, the employer or the admin.
//
// The admin path stays: the "New request" button in the queue posts here too, because §4.1's
// email and Telegram channel does not disappear just because a form exists.
//
// Activation is public for a different reason: the employer HAS an account by then but
// cannot sign in with it, so there is no token to authenticate with.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { Public } from '@common/decorators/public.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { THROTTLERS } from '@config/throttler.config';
import { EmployerRequestService } from '../../application/services/employer-request.service';
import { EmployerApprovalService } from '../../application/services/employer-approval.service';
import {
  ActivateEmployerAccountDto,
  CreateEmployerRequestDto,
  EmployerRequestMessageDto,
  EmployerRequestReceiptDto,
  EmployerRequestStatusDto,
} from '../../application/dtos/employer-request.dtos';

@ApiTags('Employer Onboarding')
@UseGuards(ThrottlerGuard)
@Controller('employer-requests')
export class EmployerRequestController {
  constructor(
    private readonly requests: EmployerRequestService,
    private readonly approval: EmployerApprovalService,
  ) {}

  @Post()
  @Public()
  @RateLimit(THROTTLERS.employerRequest.name)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Ask to join JobFit as an employer',
    description:
      'Creates a REQUEST, not an account — no account exists until an admin approves it ' +
      'and selects the company. Also used by the admin "New request" form for employers ' +
      'who arrive by email or Telegram. The response deliberately reveals nothing about ' +
      'whether the address already has an account: answering that to an anonymous caller ' +
      'would make this an account-enumeration oracle.',
  })
  @ApiResponse({ status: 201, type: EmployerRequestReceiptDto })
  @ApiResponse({
    status: 409,
    description:
      'A request for this address is already under review. Safe to reveal — it concerns a ' +
      'request the caller themselves submitted, not whether an account exists.',
  })
  submit(
    @Body() dto: CreateEmployerRequestDto,
  ): Promise<EmployerRequestReceiptDto> {
    return this.requests.submit(dto);
  }

  @Get(':id')
  @Public()
  @RateLimit(THROTTLERS.employerRequest.name)
  @ApiOperation({
    summary: 'Check the status of a request you submitted',
    description:
      'THE ID IS THE CREDENTIAL — it is a v4 UUID returned only on the receipt, and holding ' +
      'it is the whole claim to read this. So the payload is thin by design: company name, ' +
      'status, when it was submitted, and the admin message when there is one addressed to ' +
      'the employer. No contact email, no reviewer, no account id. Existed for nothing to ' +
      'read before: a rejected or information-pending employer had no account, no screen ' +
      'and no mail, so the answer never reached them at all.',
  })
  @ApiOkResponse({ type: EmployerRequestStatusDto })
  @ApiResponse({ status: 404, description: 'No request with that id.' })
  status(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<EmployerRequestStatusDto> {
    return this.requests.publicStatus(id);
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
