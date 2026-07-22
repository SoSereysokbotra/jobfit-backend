// src/modules/generation/generation.controller.ts
//
// Phase 4 AI generation endpoints. Both are premium features — gated to
// PREMIUM/PROFESSIONAL tiers server-side (never trust the UI).

import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { SubscriptionTier } from '@shared/kernel/enums/subscription-tier.enum';
import { UserRepository } from '../user/infrastructure/repositories/user.repository';
import { GenerationService } from './generation.service';
import { GenerateCoverLetterDto } from './dto/generate-cover-letter.dto';
import { GenerateInterviewDto } from './dto/generate-interview.dto';

@ApiTags('AI Generation')
@ApiBearerAuth()
@Controller()
export class GenerationController {
  constructor(
    private readonly generation: GenerationService,
    private readonly userRepository: UserRepository,
  ) {}

  @Post('applications/:id/cover-letter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate (and persist) a cover letter for an application. Premium-only.',
  })
  async coverLetter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GenerateCoverLetterDto,
  ) {
    await this.assertPremium(user.id);
    return this.generation.coverLetterForApplication(user.id, id, dto.tone);
  }

  @Post('generate/interview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Interview prep for a job: tailored questions (kind=questions) or feedback ' +
      'on an answer (kind=feedback). Premium-only.',
  })
  async interview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateInterviewDto,
  ) {
    await this.assertPremium(user.id);
    return this.generation.interview(dto.jobId, dto.level, dto.kind, dto.answer);
  }

  /** Gate AI generation behind PREMIUM/PROFESSIONAL — enforced server-side. */
  private async assertPremium(userId: string): Promise<void> {
    const account = await this.userRepository.findById(userId);
    const entitled =
      account?.subscriptionTier === SubscriptionTier.PREMIUM ||
      account?.subscriptionTier === SubscriptionTier.PROFESSIONAL;
    if (!entitled) {
      throw new ForbiddenException(
        'Cover letters and interview coaching require a Premium or Professional plan.',
      );
    }
  }
}
