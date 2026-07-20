import { Module } from '@nestjs/common';

import { IngestionController } from './presentation/controllers/ingestion.controller';
import { IngestionService } from './ingestion.service';
import { TheMuseSource } from './sources/themuse.source';

@Module({
  controllers: [IngestionController],
  providers: [IngestionService, TheMuseSource],
  exports: [IngestionService],
})
export class IngestionModule {}
