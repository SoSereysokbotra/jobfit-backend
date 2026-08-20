// src/modules/generation/generation.controller.ts
//
// Phase 4 AI generation endpoints. ALL FOUR are paid features, gated server-side to
// PREMIUM/PROFESSIONAL via EntitlementService (never trust the UI).
//
// THE EXTENSION ROUTES USED TO BE UNGATED. `generate/cover-letter` and
// `generate/interview-prep` ran the same GenerationService as the two paid routes above
// them, with no tier check — a documented "accepted caveat" that assumed a working
// paywall on the other side. There wasn't one (MENTOR_REVIEW_2026-08-18 §10), so the
// caveat was really "the paywall is optional if you know the other URL". They are gated
// now. A different CLIENT is not a different ENTITLEMENT.
//
// How anyone becomes entitled today: an ADMIN grants the tier. There is no self-serve
// purchase — see the note on EntitlementService before assuming otherwise.
//
// RATE LIMITED PER USER. Entitlement answers "may you run this at all"; it says nothing
// about "how often". A paid account in a loop was previously unlimited generation
// (MENTOR_REVIEW_2026-08-18 §11), so every route here also carries aiGenerate — the
// tightest limiter we have, because these are the longest LLM calls in the product.

import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { AuthenticatedUser } from '@common/guards/jwt-auth.guard';
import { AiThrottlerGuard } from '@common/guards/ai-throttler.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { THROTTLERS } from '@config/throttler.config';
import { EntitlementService } from '../user/application/services/entitlement.service';
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
@ApiTooManyRequestsResponse({
  description: 'Per-account AI rate limit exceeded (10 generations/hour).',
})
@UseGuards(AiThrottlerGuard)
@Controller()
export class GenerationController {
  constructor(
    private readonly generation: GenerationService,
    private readonly entitlements: EntitlementService,
  ) {}

  @Post('applications/:id/cover-letter')
  @RateLimit(THROTTLERS.aiGenerate.name)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate (and persist) a cover letter for an application. Premium-only.',
  })
  async coverLetter(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: GenerateCoverLetterDto,
  ) {
    await this.entitlements.requirePaidPlan(user.id);
    return this.generation.coverLetterForApplication(user.id, id, dto.tone);
  }

  @Post('generate/interview')
  @RateLimit(THROTTLERS.aiGenerate.name)
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
    await this.entitlements.requirePaidPlan(user.id);
    return this.generation.interview(dto.jobId, dto.level, dto.kind, dto.answer);
  }

  // ── Browser extension: job-context generation. Same AI, same entitlement. ─────

  @Post('generate/cover-letter')
  @RateLimit(THROTTLERS.aiGenerate.name)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Generate a cover letter for an external job (browser extension). Paid plan ' +
      'required; composed from the user’s résumé + the job’s title/company (no stored ' +
      'application).',
  })
  @ApiForbiddenResponse({ description: 'Requires a Premium or Professional plan.' })
  async extensionCoverLetter(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ExtCoverLetterDto,
  ): Promise<ExtCoverLetterResponseDto> {
    await this.entitlements.requirePaidPlan(user.id);
    const result = await this.generation.coverLetterForExternalJob(
      user.id,
      dto.role ?? '',
      dto.company ?? null,
    );
    return { text: result.coverLetter, model: result.generatedBy };
  }

  @Post('generate/interview-prep')
  @RateLimit(THROTTLERS.aiGenerate.name)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Interview prep for an external job (browser extension). Paid plan required; ' +
      'questions from the job title, mapped to question-type shares + a top-questions ' +
      'list.',
  })
  @ApiForbiddenResponse({ description: 'Requires a Premium or Professional plan.' })
  async extensionInterview(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ExtInterviewDto,
  ): Promise<ExtInterviewResponseDto> {
    // This route does not otherwise need the user — the questions come from the job
    // title alone. It needs them to answer "may you run this at all".
    await this.entitlements.requirePaidPlan(user.id);
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

}
