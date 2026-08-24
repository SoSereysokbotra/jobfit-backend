// src/modules/resume/presentation/controllers/resume.controller.ts
//
// Resume upload/list/get/delete/default/scoring endpoints. Returns ResumeResponseDto.
//
// AUTH NOTE: docs' SupabaseAuthGuard -> global JwtAuthGuard (self-JWT, secure-by-default);
// this controller also carries an explicit class-level @UseGuards(JwtAuthGuard). Every
// id-scoped route enforces ownership (assertOwned / the service) so a user can only touch
// their own resumes.
//
// RATE LIMIT NOTE (MENTOR_REVIEW_2026-08-18 §11). SIX routes here reach the LLM, and
// `ResumeScorerService.scoreResume` has NO CACHE — it re-runs the model every call and
// only then persists. So `/ats-score`, `/quality-score`, `/scores`, `POST /:id/score`
// and even `PATCH /:id/set-default` each spend a full scoring call, and a client polling
// any of them is an open tap. All six carry `aiResume`; the pure reads (list, get,
// parsing-status, parsed-data, delete) are untouched.
//
// The right long-term fix is for the scorer to return the persisted score when nothing
// about the résumé changed — the limiter caps the damage, it does not remove the waste.

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  JwtAuthGuard,
} from '@common/guards/jwt-auth.guard';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ResumeService, ResumeFileUpload } from '../../application/services/resume.service';
import { ResumeScorerService } from '../../application/services/resume-scorer.service';
import { UploadResumeDto } from '../../application/dtos/upload-resume.dto';
import { ResumeResponseDto } from '../../application/dtos/resume-response.dto';
import { ParsedResumeDataResponseDto } from '../../application/dtos/parsed-resume-data-response.dto';
import { ParsedResumeDataRepository } from '../../infrastructure/repositories/parsed-resume-data.repository';
import { Resume } from '../../domain/entities/resume.entity';
import { EntitlementService } from '../../../user/application/services/entitlement.service';
import { AiThrottlerGuard } from '@common/guards/ai-throttler.guard';
import { RateLimit } from '@common/decorators/rate-limit.decorator';
import { THROTTLERS } from '@config/throttler.config';

const MAX_RESUME_SIZE = 5 * 1024 * 1024; // 5 MB

@ApiTags('Resumes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('resumes')
export class ResumeController {
  constructor(
    private readonly resumeService: ResumeService,
    private readonly resumeScorer: ResumeScorerService,
    private readonly entitlements: EntitlementService,
    private readonly parsedResumeDataRepository: ParsedResumeDataRepository,
  ) {}

  @Post()
  @UseGuards(AiThrottlerGuard)
  @RateLimit(THROTTLERS.aiResume.name)
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a resume (PDF or DOCX, max 5 MB)' })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_RESUME_SIZE })],
        fileIsRequired: true,
      }),
    )
    file: ResumeFileUpload,
    @Body() dto: UploadResumeDto,
  ): Promise<ResumeResponseDto> {
    // File type (PDF/DOCX) is validated inside ResumeService.uploadResume.
    const resume = await this.resumeService.uploadResume(
      user.id,
      file,
      dto.title,
    );
    return new ResumeResponseDto(resume);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user’s resumes' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ResumeResponseDto[]> {
    const resumes = await this.resumeService.getUserResumes(user.id);
    return resumes.map((r) => new ResumeResponseDto(r));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of your resumes by id' })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ResumeResponseDto> {
    const resume = await this.assertOwned(id, user);
    return new ResumeResponseDto(resume);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one of your resumes' })
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    await this.assertOwned(id, user);
    await this.resumeService.deleteResume(id);
  }

  @Patch(':id/set-default')
  @UseGuards(AiThrottlerGuard)
  @RateLimit(THROTTLERS.aiResume.name)
  @ApiOperation({ summary: 'Set one of your resumes as the default' })
  async setDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ResumeResponseDto> {
    // setDefaultResume already enforces ownership in the service.
    await this.resumeService.setDefaultResume(user.id, id);
    const resume = await this.resumeService.getResume(id);
    return new ResumeResponseDto(resume);
  }

  @Get(':id/parsing-status')
  @ApiOperation({ summary: 'Get a resume’s parsing status' })
  async parsingStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ status: string; error?: string }> {
    const resume = await this.assertOwned(id, user);
    return { status: resume.parsingStatus, error: resume.parsingError };
  }

  @Get(':id/parsed-data')
  @ApiOperation({
    summary: 'Get the structured data extracted from a resume (AI or heuristic)',
  })
  async parsedData(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ParsedResumeDataResponseDto> {
    await this.assertOwned(id, user);
    const parsed = await this.parsedResumeDataRepository.findByResumeId(id);
    if (!parsed) {
      throw new BadRequestException('Resume has not been parsed yet');
    }
    return new ParsedResumeDataResponseDto(parsed);
  }

  @Get(':id/ats-score')
  @UseGuards(AiThrottlerGuard)
  @RateLimit(THROTTLERS.aiResume.name)
  @ApiOperation({ summary: 'Calculate (and cache) a resume’s ATS score' })
  async atsScore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ resumeId: string; atsScore: number }> {
    await this.assertOwned(id, user);
    const atsScore = await this.resumeScorer.calculateATSScore(id);
    return { resumeId: id, atsScore };
  }

  @Get(':id/quality-score')
  @UseGuards(AiThrottlerGuard)
  @RateLimit(THROTTLERS.aiResume.name)
  @ApiOperation({ summary: 'Calculate (and cache) a resume’s quality score' })
  async qualityScore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ resumeId: string; qualityScore: number }> {
    await this.assertOwned(id, user);
    const qualityScore = await this.resumeScorer.calculateQualityScore(id);
    return { resumeId: id, qualityScore };
  }

  @Get(':id/scores')
  @UseGuards(AiThrottlerGuard)
  @RateLimit(THROTTLERS.aiResume.name)
  @ApiOperation({ summary: 'Calculate both scores plus their average' })
  async scores(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{ atsScore: number; qualityScore: number; total: number }> {
    await this.assertOwned(id, user);
    const { atsScore, qualityScore } = await this.resumeScorer.scoreResume(id);
    return {
      atsScore,
      qualityScore,
      total: Math.round((atsScore + qualityScore) / 2),
    };
  }

  @Post(':id/score')
  @UseGuards(AiThrottlerGuard)
  @RateLimit(THROTTLERS.aiResume.name)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Score the resume (AI with heuristic fallback) and persist ats/quality. ' +
      'Improvement suggestions are premium-only (PREMIUM/PROFESSIONAL).',
  })
  async score(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<{
    atsScore: number;
    qualityScore: number;
    breakdown: Record<string, number>;
    scoredBy: string;
    suggestions?: string[];
  }> {
    await this.assertOwned(id, user);
    const result = await this.resumeScorer.scoreResume(id);

    const base = {
      atsScore: result.atsScore,
      qualityScore: result.qualityScore,
      breakdown: result.breakdown,
      scoredBy: result.scoredBy,
    };
    // Gate AI suggestions behind subscription tier — enforced server-side.
    //
    // DEGRADES rather than throwing, unlike the generation routes: the scores are still
    // the user's own analysis and worth returning. Only the AI suggestions are withheld.
    // Same entitlement rule either way — EntitlementService owns it, so the two cannot
    // drift into disagreeing about who is paid.
    if (await this.entitlements.hasPaidPlan(user.id)) {
      return { ...base, suggestions: result.suggestions };
    }
    return base;
  }

  /** Load a resume and assert the caller owns it (404 if missing, 403 if not owner). */
  private async assertOwned(
    id: string,
    user: AuthenticatedUser,
  ): Promise<Resume> {
    const resume = await this.resumeService.getResume(id); // throws NotFound if absent
    if (resume.userId !== user.id) {
      throw new ForbiddenException('You can only access your own resumes');
    }
    return resume;
  }
}
