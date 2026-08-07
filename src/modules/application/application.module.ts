import { Module } from '@nestjs/common';

// UserModule exports UserRepository; JobModule exports the JOB_REPOSITORY token.
import { UserModule } from '../user/user.module';
import { JobModule } from '../job/job.module';
// Exports ApplicationScreeningService — the AI Recruiter screening step.
import { MatchingModule } from '../matching/matching.module';

import { ApplicationController } from './presentation/controllers/application.controller';
import { ApplicationService } from './application.service';
import { ApplicationTransitionService } from './domain/services/application-transition.service';
import { ApplicationRepository } from './infrastructure/repositories/application.repository';
import { ApplicationTimelineRepository } from './infrastructure/repositories/application-timeline.repository';
import { ContactPersonRepository } from './infrastructure/repositories/contact-person.repository';

@Module({
  imports: [UserModule, JobModule, MatchingModule],
  controllers: [ApplicationController],
  providers: [
    ApplicationService,
    ApplicationTransitionService,
    ApplicationRepository,
    ApplicationTimelineRepository,
    ContactPersonRepository,
  ],
  // ApplicationTransitionService is exported because the offer, employer and matching
  // modules must all write status through it — that is the entire point of it existing.
  exports: [ApplicationService, ApplicationTransitionService],
})
export class ApplicationModule {}
