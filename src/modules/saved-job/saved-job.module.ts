import { Module } from '@nestjs/common';

import { SavedJobController } from './presentation/controllers/saved-job.controller';
import { SavedExternalJobController } from './presentation/controllers/saved-external-job.controller';
import { SavedJobService } from './saved-job.service';
import { SavedExternalJobService } from './saved-external-job.service';
import { SavedJobRepository } from './infrastructure/repositories/saved-job.repository';
import { SavedExternalJobRepository } from './infrastructure/repositories/saved-external-job.repository';

@Module({
  controllers: [SavedJobController, SavedExternalJobController],
  providers: [
    SavedJobService,
    SavedJobRepository,
    SavedExternalJobService,
    SavedExternalJobRepository,
  ],
  // SavedJobRepository is exported for SyncModule's full-replace sync (PWA offline, Phase 2).
  exports: [SavedJobService, SavedJobRepository],
})
export class SavedJobModule {}
