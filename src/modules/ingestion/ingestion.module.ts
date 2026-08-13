import { Module } from '@nestjs/common';

import { IngestionController } from './presentation/controllers/ingestion.controller';
import { IngestionService } from './ingestion.service';
import { TheMuseSource } from './sources/themuse.source';
import { BongThomSource } from './sources/bongthom.source';
import { JobNetSource } from './sources/jobnet.source';

@Module({
  controllers: [IngestionController],
  providers: [IngestionService, TheMuseSource, BongThomSource, JobNetSource],
  exports: [IngestionService],
})
export class IngestionModule {}
