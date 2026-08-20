// src/modules/resume/resume-selection.module.ts
//
// Just the "which résumé counts" rule, split out from ResumeModule so the matching and
// generation modules can consume it without also pulling in ResumeModule's BullMQ queue,
// storage client and controllers. ActiveResumeService needs only the global PrismaService.

import { Module } from '@nestjs/common';
import { ActiveResumeService } from './application/services/active-resume.service';

@Module({
  providers: [ActiveResumeService],
  exports: [ActiveResumeService],
})
export class ResumeSelectionModule {}
