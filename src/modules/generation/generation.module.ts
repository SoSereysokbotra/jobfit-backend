import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module'; // exports UserRepository (tier gating)
import { ResumeSelectionModule } from '../resume/resume-selection.module'; // ActiveResumeService
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';

// PrismaService (global) and AiClient (global AiModule) inject without extra imports.
@Module({
  imports: [UserModule, ResumeSelectionModule],
  controllers: [GenerationController],
  providers: [GenerationService],
})
export class GenerationModule {}
