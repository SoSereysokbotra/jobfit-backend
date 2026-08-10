import { Module } from '@nestjs/common';

import { SavedJobController } from './presentation/controllers/saved-job.controller';
import { SavedJobService } from './saved-job.service';
import { SavedJobRepository } from './infrastructure/repositories/saved-job.repository';

@Module({
  controllers: [SavedJobController],
  providers: [SavedJobService, SavedJobRepository],
  // SavedJobRepository is exported for SyncModule's full-replace sync (PWA offline, Phase 2).
  exports: [SavedJobService, SavedJobRepository],
})
export class SavedJobModule {}
