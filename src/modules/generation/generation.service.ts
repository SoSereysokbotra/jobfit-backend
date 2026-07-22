// src/modules/generation/generation.service.ts
//
// Phase 4 — AI generation (cover letters + interview coaching). Both degrade
// gracefully when the AI service is down: cover letters fall back to a template,
// interview prep to a static question set / generic guidance.

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { AiClient } from '@infra/ai/ai.client';
import { AiServiceError } from '@infra/ai/ai.errors';
import {
  CoverLetterRequest,
  InterviewQuestion,
} from '@infra/ai/ai.types';

export interface CoverLetterResult {
  coverLetter: string;
  generatedBy: 'ai' | 'template';
}

export interface InterviewResult {
  questions: InterviewQuestion[];
  feedback: string | null;
  generatedBy: 'ai' | 'static';
}

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClient: AiClient,
  ) {}

  // ── Cover letter ────────────────────────────────────────────────────────────

  async coverLetterForApplication(
    userId: string,
    applicationId: string,
    tone?: string,
  ): Promise<CoverLetterResult> {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: { job: { include: { company: { select: { name: true } } } } },
    });
    if (!application) throw new NotFoundException('Application not found');
    if (application.userId !== userId) {
      throw new ForbiddenException('You can only generate for your own applications');
    }

    const job = application.job;
    const input: CoverLetterRequest = {
      resumeSummary:
        (await this.resumeSummary(userId, application.resumeId)) ||
        'A motivated candidate applying for this role.',
      jobTitle: job.title,
      companyName: job.company?.name ?? 'the company',
      jobDescription: job.description,
      tone: tone ?? 'professional',
    };

    let result: CoverLetterResult;
    try {
      const ai = await this.aiClient.generateCoverLetter(input);
      result = { coverLetter: ai.coverLetter, generatedBy: 'ai' };
    } catch (err) {
      if (!(err instanceof AiServiceError)) throw err;
      this.logger.warn(
        `AI cover letter unavailable (${err.code}); using template fallback`,
      );
      result = { coverLetter: this.templateCoverLetter(input), generatedBy: 'template' };
    }

    // Persist onto the application so it's editable/reusable.
    await this.prisma.application.update({
      where: { id: applicationId },
      data: { coverLetter: result.coverLetter },
    });
    return result;
  }

  // ── Interview coaching ──────────────────────────────────────────────────────

  async interview(
    jobId: string,
    level: string,
    kind: 'questions' | 'feedback',
    answer?: string,
  ): Promise<InterviewResult> {
    const job = await this.prisma.job.findUnique({
      where: { id: jobId },
      select: { title: true, description: true },
    });
    if (!job) throw new NotFoundException('Job not found');

    try {
      const ai = await this.aiClient.generateInterview({
        jobTitle: job.title,
        jobDescription: job.description,
        level,
        kind,
        answer,
      });
      return {
        questions: ai.questions ?? [],
        feedback: ai.feedback ?? null,
        generatedBy: 'ai',
      };
    } catch (err) {
      if (!(err instanceof AiServiceError)) throw err;
      this.logger.warn(
        `AI interview prep unavailable (${err.code}); using static fallback`,
      );
      return kind === 'questions'
        ? { questions: this.staticQuestions(job.title), feedback: null, generatedBy: 'static' }
        : {
            questions: [],
            feedback:
              'AI feedback is temporarily unavailable. Structure your answer with the ' +
              'STAR method (Situation, Task, Action, Result), quantify your impact, and ' +
              'tie it back to the role.',
            generatedBy: 'static',
          };
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private async resumeSummary(
    userId: string,
    resumeId: string | null,
  ): Promise<string | null> {
    if (resumeId) {
      const parsed = await this.prisma.parsedResumeData.findUnique({
        where: { resumeId },
        select: { summary: true },
      });
      if (parsed?.summary) return parsed.summary;
    }
    const resume = await this.prisma.resume.findFirst({
      where: { userId, parsingStatus: 'SUCCESS' },
      orderBy: { updatedAt: 'desc' },
      select: { parsedData: { select: { summary: true } } },
    });
    return resume?.parsedData?.summary ?? null;
  }

  private templateCoverLetter(input: CoverLetterRequest): string {
    return [
      'Dear Hiring Manager,',
      '',
      `I am writing to express my interest in the ${input.jobTitle} position at ` +
        `${input.companyName}. ${input.resumeSummary}`,
      '',
      `Having reviewed the role, I am confident my background aligns well with what ` +
        `your team is looking for, and I am excited about the opportunity to contribute.`,
      '',
      'Thank you for your time and consideration. I look forward to the possibility of ' +
        'discussing how I can add value to your team.',
      '',
      'Sincerely,',
    ].join('\n');
  }

  private staticQuestions(jobTitle: string): InterviewQuestion[] {
    return [
      {
        question: `Tell me about a project most relevant to the ${jobTitle} role.`,
        category: 'experience',
        guidance: 'Use STAR; lead with impact and quantify results.',
      },
      {
        question: 'Describe a time you handled a difficult technical trade-off.',
        category: 'behavioral',
        guidance: 'Explain the options, your decision, and the outcome.',
      },
      {
        question: 'How do you approach learning a technology you have not used before?',
        category: 'behavioral',
        guidance: 'Show a concrete, repeatable learning process.',
      },
    ];
  }
}
