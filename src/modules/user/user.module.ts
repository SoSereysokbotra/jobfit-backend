import { Module } from '@nestjs/common';
import { UserController } from './presentation/controllers/user.controller';
import { ProfileController } from './presentation/controllers/profile.controller';
import { SkillsController } from './presentation/controllers/skills.controller';
import { ExperienceController } from './presentation/controllers/experience.controller';
import { EducationController } from './presentation/controllers/education.controller';
import { AnalyticsController } from './presentation/controllers/analytics.controller';

// Repositories (Prisma-backed). PrismaService is provided globally by PrismaModule.
import { UserRepository } from './infrastructure/repositories/user.repository';
import { ExperienceRepository } from './infrastructure/repositories/experience.repository';
import { UserSkillRepository } from './infrastructure/repositories/user-skill.repository';
import { EducationRepository } from './infrastructure/repositories/education.repository';
import { ProfileRepository } from './infrastructure/repositories/profile.repository';
import { UserAnalyticsRepository } from './infrastructure/repositories/user-analytics.repository';

// Application services. DomainEventBus is provided globally by EventBusModule.
import { UserService } from './application/services/user.service';
import { ExperienceService } from './application/services/experience.service';
import { SkillsService } from './application/services/skills.service';
import { EducationService } from './application/services/education.service';
import { ProfileService } from './application/services/profile.service';
import { UserAnalyticsService } from './application/services/user-analytics.service';

@Module({
  controllers: [
    UserController,
    ProfileController,
    SkillsController,
    ExperienceController,
    EducationController,
    AnalyticsController,
  ],
  providers: [
    // Repositories
    UserRepository,
    ExperienceRepository,
    UserSkillRepository,
    EducationRepository,
    ProfileRepository,
    UserAnalyticsRepository,
    // Services
    UserService,
    ExperienceService,
    SkillsService,
    EducationService,
    ProfileService,
    UserAnalyticsService,
  ],
  exports: [
    // Services other modules consume.
    UserService,
    ProfileService,
    SkillsService,
    ExperienceService,
    EducationService,
    UserAnalyticsService,
    // Repositories other modules read (e.g. auth/matching cross-references).
    UserRepository,
    UserSkillRepository,
    ExperienceRepository,
    EducationRepository,
  ],
})
// NOTE: the docs' provider list also names CertificationService/CertificationRepository,
// but those are not implemented yet (only the Certification entity exists), so they are
// intentionally omitted here and can be added when the certification feature is built.
export class UserModule {}
