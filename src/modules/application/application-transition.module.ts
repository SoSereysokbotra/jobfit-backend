// src/modules/application/application-transition.module.ts
//
// The transition service on its own, so every module that writes a status can import it
// without dragging in a dependency cycle: ApplicationModule already imports MatchingModule
// for screening, and screening now needs the transition service back.
//
// It being its own module is also the honest shape. The lifecycle is not the application
// module's private business — the offer, employer and matching modules all move
// applications through it, and each of them imports exactly this and nothing else.

import { Module } from '@nestjs/common';
import { NotificationModule } from '@modules/notification/notification.module';
import { ApplicationTransitionService } from './domain/services/application-transition.service';

@Module({
  // The chokepoint writes the counterparty's notification in the same transaction as the
  // status change. See the note in ApplicationTransitionService.notifyCounterparty.
  imports: [NotificationModule],
  providers: [ApplicationTransitionService],
  exports: [ApplicationTransitionService],
})
export class ApplicationTransitionModule {}
