import { Module } from '@nestjs/common';

// UserModule exports UserRepository + UserSkillRepository (consumed by LearningPathService).
import { UserModule } from '../user/user.module';
// MatchingModule exports SkillGapService — the measured requirement matcher. Skill gaps are
// computed from the jobs a user applied to, so this page reuses it rather than writing a
// second, weaker comparison of its own.
import { MatchingModule } from '../matching/matching.module';
import { LearningPathService } from './application/services/learning-path.service';
import { LearningController } from './presentation/controllers/learning.controller';

@Module({
  imports: [UserModule, MatchingModule],
  controllers: [LearningController],
  providers: [LearningPathService],
  exports: [LearningPathService],
})
export class LearningModule {}
