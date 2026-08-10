// src/modules/sync/sync.module.ts
//
// Reads across several feature modules rather than owning storage of its own, so it
// imports them for their repositories. Nothing imports SyncModule back — the repositories
// depend only on the pure ./delta helper, never on this module — so there is no cycle.

import { Module } from '@nestjs/common';

import { UserModule } from '../user/user.module';
import { ApplicationModule } from '../application/application.module';
import { SavedJobModule } from '../saved-job/saved-job.module';
// Exports RecommendationDismissService — the DISMISS_RECOMMENDATION batch action.
import { MatchingModule } from '../matching/matching.module';

import { SyncController } from './presentation/controllers/sync.controller';
import { SyncService } from './sync.service';
import { BatchService } from './batch.service';

@Module({
  imports: [UserModule, ApplicationModule, SavedJobModule, MatchingModule],
  controllers: [SyncController],
  providers: [SyncService, BatchService],
  exports: [SyncService],
})
export class SyncModule {}
