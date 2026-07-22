// src/modules/offer/offer.controller.ts
//
// Seeker-facing offers: list your offers and accept / decline / negotiate. Requires a
// JWT (global guard); every route is scoped to the caller's own offers.

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { OfferService } from './offer.service';
import { NegotiateOfferDto } from './dtos/offer-request.dtos';
import { OfferResponseDto } from './dtos/offer-response.dto';

@ApiTags('Offers')
@ApiBearerAuth()
@Controller('offers')
export class OfferController {
  constructor(private readonly offers: OfferService) {}

  @Get()
  @ApiOperation({ summary: 'List the offers extended to you' })
  @ApiOkResponse({ type: OfferResponseDto, isArray: true })
  list(@CurrentUser() user: AuthenticatedUser): Promise<OfferResponseDto[]> {
    return this.offers.listMyOffers(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of your offers' })
  @ApiOkResponse({ type: OfferResponseDto })
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfferResponseDto> {
    return this.offers.getMyOffer(user.id, id);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept an offer (archives your other active offers)' })
  @ApiOkResponse({ type: OfferResponseDto })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfferResponseDto> {
    return this.offers.accept(user.id, id);
  }

  @Post(':id/decline')
  @ApiOperation({ summary: 'Decline an offer' })
  @ApiOkResponse({ type: OfferResponseDto })
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OfferResponseDto> {
    return this.offers.decline(user.id, id);
  }

  @Post(':id/negotiate')
  @ApiOperation({ summary: 'Open negotiation with a note' })
  @ApiOkResponse({ type: OfferResponseDto })
  negotiate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NegotiateOfferDto,
  ): Promise<OfferResponseDto> {
    return this.offers.negotiate(user.id, id, dto);
  }
}
