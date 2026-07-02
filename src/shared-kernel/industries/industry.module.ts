import { Module } from '@nestjs/common';
import { IndustryRepository } from './industry.repository';

@Module({
  providers: [IndustryRepository],
  exports: [IndustryRepository],
})
export class IndustryModule {}
