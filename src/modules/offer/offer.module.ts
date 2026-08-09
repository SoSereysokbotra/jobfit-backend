// src/modules/offer/offer.module.ts
//
// Offers & Decisions. PrismaModule is global, so the service only needs to declare
// itself and its two controllers (employer-facing + seeker-facing).

import { Module } from '@nestjs/common';
// Exports ApplicationTransitionService — the one road to a status write.
import { ApplicationTransitionModule } from '../application/application-transition.module';
// A message is not a status change, so the chokepoint never sees messages two onward —
// this module notifies about those itself.
import { NotificationModule } from '../notification/notification.module';
import { OfferService } from './offer.service';
import { OfferController } from './offer.controller';
import { EmployerOfferController } from './employer-offer.controller';

@Module({
  imports: [ApplicationTransitionModule, NotificationModule],
  controllers: [OfferController, EmployerOfferController],
  providers: [OfferService],
})
export class OfferModule {}
