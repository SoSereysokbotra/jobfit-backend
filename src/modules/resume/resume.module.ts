import { Module } from '@nestjs/common';
import { ResumeController } from './presentation/controllers/resume.controller';

// User module exports UserRepository (consumed by ResumeService).
import { UserModule } from '../user/user.module';

// Queue infra (BullMQ + Redis): the connection, the resume-parsing queue registration
// and BullQueueService all live in QueueModule.
import { QueueModule } from '@infra/queue/queue.module';

import { ResumeRepository } from './infrastructure/repositories/resume.repository';
import { ParsedResumeDataRepository } from './infrastructure/repositories/parsed-resume-data.repository';
import { ResumeParsingProcessor } from './infrastructure/queue/resume-parsing.processor';
import { ResumeService } from './application/services/resume.service';
import { ResumeParserService } from './application/services/resume-parser.service';
import { ResumeScorerService } from './application/services/resume-scorer.service';

@Module({
  imports: [
    UserModule,
    // BullMQ connection, the resume-parsing queue and BullQueueService. Owned by
    // QueueModule so HealthModule can probe the SAME connection this module enqueues on
    // (Redis audit R9) — a second registration would be a second connection.
    QueueModule,
  ],
  controllers: [ResumeController],
  providers: [
    ResumeRepository,
    ParsedResumeDataRepository,
    ResumeService,
    ResumeParserService,
    ResumeScorerService,
    ResumeParsingProcessor,
  ],
  // ResumeScorerService + ParsedResumeDataRepository are consumed by
  // MatchReportModule, which scores the user's résumé as part of a match report.
  exports: [
    ResumeService,
    ResumeRepository,
    ResumeScorerService,
    ParsedResumeDataRepository,
  ],
})
export class ResumeModule {}
