// src/modules/offer/employer-offer.controller.ts
//
// Employer-facing offer actions, scoped to the employer's company. Lives under
// employer/applications/:id/offer (alongside the pipeline controller — no route clash).

import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@common/decorators/roles.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { OfferService } from './offer.service';
import { CreateOfferDto, UpdateOfferDto } from './dtos/offer-request.dtos';
import { EmployerOfferResponseDto } from './dtos/offer-response.dto';

@ApiTags('Employer - Offers')
@ApiBearerAuth()
@Roles('EMPLOYER')
@Controller('employer/applications')
export class EmployerOfferController {
  constructor(private readonly offers: OfferService) {}

  @Post(':id/offer')
  @ApiOperation({ summary: 'Extend (or re-extend) an offer on an application' })
  @ApiOkResponse({ type: EmployerOfferResponseDto })
  extend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) applicationId: string,
    @Body() dto: CreateOfferDto,
  ): Promise<EmployerOfferResponseDto> {
    return this.offers.extendOffer(user.id, applicationId, dto);
  }

  @Patch(':id/offer')
  @ApiOperation({ summary: 'Edit an offer that has not been decided yet' })
  @ApiOkResponse({ type: EmployerOfferResponseDto })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) applicationId: string,
    @Body() dto: UpdateOfferDto,
  ): Promise<EmployerOfferResponseDto> {
    return this.offers.updateOffer(user.id, applicationId, dto);
  }

  @Post(':id/offer/withdraw')
  @ApiOperation({ summary: 'Rescind an offer' })
  @ApiOkResponse({ type: EmployerOfferResponseDto })
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) applicationId: string,
  ): Promise<EmployerOfferResponseDto> {
    return this.offers.withdrawOffer(user.id, applicationId);
  }
}
