import { Module } from '@nestjs/common';
import { SkillRepository } from './skill.repository';

@Module({
  providers: [SkillRepository],
  exports: [SkillRepository],
})
export class SkillModule {}
