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
import {
  ExtCoverLetterDto,
  ExtCoverLetterResponseDto,
  ExtInterviewDto,
  ExtInterviewResponseDto,
} from './dto/extension-generation.dto';

/** "system design" → "System Design" for the extension's question-type labels. */
function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

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

  // ── Browser extension: UNGATED, job-context generation (no premium tier) ──────

  @Post('generate/cover-letter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Generate a cover letter for an external job (browser extension). Ungated; ' +
      'composed from the user’s résumé + the job’s title/company (no stored application).',
  })
  async extensionCoverLetter(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ExtCoverLetterDto,
  ): Promise<ExtCoverLetterResponseDto> {
    const result = await this.generation.coverLetterForExternalJob(
      user.id,
      dto.role ?? '',
      dto.company ?? null,
    );
    return { text: result.coverLetter, model: result.generatedBy };
  }

  @Post('generate/interview-prep')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Interview prep for an external job (browser extension). Ungated; questions ' +
      'from the job title, mapped to question-type shares + a top-questions list.',
  })
  async extensionInterview(
    @CurrentUser() _user: AuthenticatedUser,
    @Body() dto: ExtInterviewDto,
  ): Promise<ExtInterviewResponseDto> {
    const result = await this.generation.interviewForExternalJob(dto.role ?? '');
    const total = result.questions.length || 1;
    const byCategory = new Map<string, number>();
    for (const q of result.questions) {
      byCategory.set(q.category, (byCategory.get(q.category) ?? 0) + 1);
    }
    return {
      questionTypes: [...byCategory.entries()].map(([label, n]) => ({
        label: titleCase(label),
        pct: Math.round((n / total) * 100),
      })),
      topQuestions: result.questions.map((q) => q.question),
      model: result.generatedBy,
    };
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
