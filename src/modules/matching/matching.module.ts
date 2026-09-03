import { Module } from '@nestjs/common';
// Screening advances SUBMITTED -> SCREENING, and does it through the same road as everyone
// else. Importing the transition module rather than ApplicationModule keeps this acyclic:
// ApplicationModule imports MatchingModule for the apply flow.
import { ApplicationTransitionModule } from '../application/application-transition.module';
// Which résumé the AI speaks for when a user has uploaded several (ActiveResumeService).
import { ResumeSelectionModule } from '../resume/resume-selection.module';
// Place resolution for the location sub-score: both a profile's city/country and a job's
// free-text location are resolved to real places before they are compared.
import { LocationModule } from '../location/location.module';
import { ComputeMatchScoreUseCase } from './application/use-cases/compute-match-score.use-case';
import { MatchExternalJobUseCase } from './application/use-cases/match-external-job.use-case';
import { RecomputeUserMatchesUseCase } from './application/use-cases/recompute-user-matches.use-case';
import { MatchingEmbeddingService } from './application/services/matching-embedding.service';
import { RecommendationsQueryService } from './application/services/recommendations-query.service';
import { RecommendationDismissService } from './application/services/recommendation-dismiss.service';
import { RecommendationStalenessService } from './application/services/recommendation-staleness.service';
import { SkillGapService } from './application/services/skill-gap.service';
import { JobMatchService } from './application/services/job-match.service';
import { ApplicationScreeningService } from './application/services/application-screening.service';
import { GenerationEvalService } from './evaluation/generation-eval.service';
import { RetrievalEvalService } from './evaluation/retrieval-eval.service';
import { MatchingController } from './presentation/controllers/matching.controller';
import { JobPublishedListener } from './listeners/job-published.listener';
import { UserProfileUpdatedListener } from './listeners/user-profile-updated.listener';

// PrismaService (global) and AiClient (global AiModule) inject without extra imports.
@Module({
  imports: [ApplicationTransitionModule, ResumeSelectionModule, LocationModule],
  controllers: [MatchingController],
  providers: [
    MatchingEmbeddingService,
    ComputeMatchScoreUseCase,
    MatchExternalJobUseCase,
    RecomputeUserMatchesUseCase,
    RecommendationsQueryService,
    RecommendationDismissService,
    RecommendationStalenessService,
    SkillGapService,
    JobMatchService,
    ApplicationScreeningService,
    RetrievalEvalService,
    GenerationEvalService,
    JobPublishedListener,
    UserProfileUpdatedListener,
  ],
  // ApplicationScreeningService is consumed by ApplicationModule's apply flow.
  // SkillGapService is consumed by LearningModule to build job-driven skill gaps.
  // MatchExternalJobUseCase is consumed by MatchReportModule for the report's match rate.
  // RecommendationDismissService is consumed by SyncModule's offline batch flush.
  exports: [
    MatchingEmbeddingService,
    ApplicationScreeningService,
    SkillGapService,
    MatchExternalJobUseCase,
    RecommendationDismissService,
  ],
})
export class MatchingModule {}
