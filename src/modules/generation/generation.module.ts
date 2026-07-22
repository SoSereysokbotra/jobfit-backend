import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module'; // exports UserRepository (tier gating)
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';

// PrismaService (global) and AiClient (global AiModule) inject without extra imports.
@Module({
  imports: [UserModule],
  controllers: [GenerationController],
  providers: [GenerationService],
})
export class GenerationModule {}
