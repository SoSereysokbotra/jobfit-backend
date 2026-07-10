import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ResumeController } from './presentation/controllers/resume.controller';

// User module exports UserRepository (consumed by ResumeService).
import { UserModule } from '../user/user.module';

// Storage infra (Supabase). Provided locally; both depend only on the global ConfigService.
import { SupabaseClientService } from '@infra/supabase/supabase.client';
import { StorageService } from '@infra/storage/storage.service';
import { BullQueueService } from '@infra/queue/bull-queue.service';

import { ResumeRepository } from './infrastructure/repositories/resume.repository';
import { ParsedResumeDataRepository } from './infrastructure/repositories/parsed-resume-data.repository';
import { ResumeParsingProcessor } from './infrastructure/queue/resume-parsing.processor';
import { ResumeService } from './application/services/resume.service';
import { ResumeParserService } from './application/services/resume-parser.service';
import { ResumeScorerService } from './application/services/resume-scorer.service';

@Module({
  imports: [
    UserModule,
    // BullMQ connection (Redis) + the resume-parsing queue.
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host'),
          port: config.get<number>('redis.port'),
          password: config.get<string>('redis.password'),
        },
      }),
    }),
    BullModule.registerQueue({ name: 'resume-parsing' }),
  ],
  controllers: [ResumeController],
  providers: [
    SupabaseClientService,
    StorageService,
    BullQueueService,
    ResumeRepository,
    ParsedResumeDataRepository,
    ResumeService,
    ResumeParserService,
    ResumeScorerService,
    ResumeParsingProcessor,
  ],
  exports: [ResumeService, ResumeRepository],
})
export class ResumeModule {}
