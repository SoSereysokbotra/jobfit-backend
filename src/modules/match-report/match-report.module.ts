// src/modules/match-report/match-report.module.ts
//
// The report is composition, not computation: everything it shows already exists in the
// matching and résumé modules, so this module imports them rather than reimplementing
// any part of a score. PrismaService (global) and AiClient (global AiModule) inject
// without an import.

import { Module } from '@nestjs/common';
import { MatchingModule } from '../matching/matching.module';
import { ResumeModule } from '../resume/resume.module';
import { MatchReportService } from './application/match-report.service';
import { MatchReportRepository } from './infrastructure/match-report.repository';
import { MatchReportController } from './presentation/controllers/match-report.controller';

@Module({
  imports: [MatchingModule, ResumeModule],
  controllers: [MatchReportController],
  providers: [MatchReportService, MatchReportRepository],
})
export class MatchReportModule {}
