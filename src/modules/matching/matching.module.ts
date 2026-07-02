import { Module } from '@nestjs/common';
import { ComputeMatchScoreUseCase } from './application/use-cases/compute-match-score.use-case';
import { RecomputeUserMatchesUseCase } from './application/use-cases/recompute-user-matches.use-case';
import { JobPublishedListener } from './listeners/job-published.listener';
import { UserProfileUpdatedListener } from './listeners/user-profile-updated.listener';

@Module({ providers: [ComputeMatchScoreUseCase, RecomputeUserMatchesUseCase, JobPublishedListener, UserProfileUpdatedListener] })
export class MatchingModule {}
