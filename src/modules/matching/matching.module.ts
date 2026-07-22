import { Module } from '@nestjs/common';
import { ComputeMatchScoreUseCase } from './application/use-cases/compute-match-score.use-case';
import { RecomputeUserMatchesUseCase } from './application/use-cases/recompute-user-matches.use-case';
import { MatchingEmbeddingService } from './application/services/matching-embedding.service';
import { RecommendationsQueryService } from './application/services/recommendations-query.service';
import { MatchingController } from './presentation/controllers/matching.controller';
import { JobPublishedListener } from './listeners/job-published.listener';
import { UserProfileUpdatedListener } from './listeners/user-profile-updated.listener';

// PrismaService (global) and AiClient (global AiModule) inject without extra imports.
@Module({
  controllers: [MatchingController],
  providers: [
    MatchingEmbeddingService,
    ComputeMatchScoreUseCase,
    RecomputeUserMatchesUseCase,
    RecommendationsQueryService,
    JobPublishedListener,
    UserProfileUpdatedListener,
  ],
  exports: [MatchingEmbeddingService],
})
export class MatchingModule {}
