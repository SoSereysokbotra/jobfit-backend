// src/modules/job-tracker/job-tracker.module.ts
//
// The user's own Job Tracker board. PrismaService is global, so this module declares
// nothing but itself. Deliberately separate from ApplicationModule: an application is a
// record of what an employer decided, a tracked job is the user's own note about a hunt
// happening on someone else's site. See docs/JOB_TRACKER_PLAN.md.

import { Module } from '@nestjs/common';
import { JobTrackerController } from './job-tracker.controller';
import { JobTrackerService } from './job-tracker.service';

@Module({
  controllers: [JobTrackerController],
  providers: [JobTrackerService],
  exports: [JobTrackerService],
})
export class JobTrackerModule {}
