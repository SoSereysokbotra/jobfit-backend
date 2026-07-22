// src/modules/offer/offer.module.ts
//
// Offers & Decisions. PrismaModule is global, so the service only needs to declare
// itself and its two controllers (employer-facing + seeker-facing).

import { Module } from '@nestjs/common';
import { OfferService } from './offer.service';
import { OfferController } from './offer.controller';
import { EmployerOfferController } from './employer-offer.controller';

@Module({
  controllers: [OfferController, EmployerOfferController],
  providers: [OfferService],
})
export class OfferModule {}
