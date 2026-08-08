// src/modules/offer/offer.module.ts
//
// Offers & Decisions. PrismaModule is global, so the service only needs to declare
// itself and its two controllers (employer-facing + seeker-facing).

import { Module } from '@nestjs/common';
// Exports ApplicationTransitionService — the one road to a status write.
import { ApplicationTransitionModule } from '../application/application-transition.module';
import { OfferService } from './offer.service';
import { OfferController } from './offer.controller';
import { EmployerOfferController } from './employer-offer.controller';

@Module({
  imports: [ApplicationTransitionModule],
  controllers: [OfferController, EmployerOfferController],
  providers: [OfferService],
})
export class OfferModule {}
