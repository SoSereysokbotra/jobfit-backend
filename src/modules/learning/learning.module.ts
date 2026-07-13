import { Module } from '@nestjs/common';

// UserModule exports UserRepository + UserSkillRepository (consumed by LearningPathService).
import { UserModule } from '../user/user.module';
import { LearningPathService } from './application/services/learning-path.service';
import { LearningController } from './presentation/controllers/learning.controller';

@Module({
  imports: [UserModule],
  controllers: [LearningController],
  providers: [LearningPathService],
  exports: [LearningPathService],
})
export class LearningModule {}
