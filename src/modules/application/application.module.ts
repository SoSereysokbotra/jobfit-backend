import { Module } from '@nestjs/common';

// UserModule exports UserRepository; JobModule exports the JOB_REPOSITORY token.
import { UserModule } from '../user/user.module';
import { JobModule } from '../job/job.module';

import { ApplicationController } from './presentation/controllers/application.controller';
import { ApplicationService } from './application.service';
import { ApplicationRepository } from './infrastructure/repositories/application.repository';
import { ApplicationTimelineRepository } from './infrastructure/repositories/application-timeline.repository';
import { ContactPersonRepository } from './infrastructure/repositories/contact-person.repository';

@Module({
  imports: [UserModule, JobModule],
  controllers: [ApplicationController],
  providers: [
    ApplicationService,
    ApplicationRepository,
    ApplicationTimelineRepository,
    ContactPersonRepository,
  ],
  exports: [ApplicationService],
})
export class ApplicationModule {}
