// src/modules/matching/application/services/application-screening.service.ts
//
// The AI Recruiter's screening step: when someone applies to a JobFits-hosted job, assess
// them against that job's stated requirements and record the result.
//
// WHAT THE AI ACTUALLY DOES HERE: nothing at this point. Requirements were extracted from
// the job description earlier (and cached on the job), which is the one capability Phase C
// measured as reliable — 87.7-89.2% groundedness, and 0.937 across 44 real postings. The
// screening itself is deterministic: an embedding-based match score plus a string
// comparison of requirements against parsed résumé skills. Every number an employer sees
// can be traced to an input they can read.
//
// WHAT IT DOES NOT DO: the LLM `fitScore` from /match/reason never appears. It was measured
// against 150 hand-graded pairs at Spearman rho 0.137 (v1) and -0.065 (v2), with BAD jobs
// scoring HIGHER than GREAT ones. And screening NEVER rejects — it advances SUBMITTED to
// SCREENING and stops. Rejection stays a human decision.

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@infra/prisma/prisma.service';
import { ApplicationTransitionService } from '@modules/application/domain/services/application-transition.service';
import { ApplicationStatus } from '@shared/kernel/enums/application-status.enum';
import { TransitionActor } from '@shared/kernel/enums/transition-actor.enum';
import { JobMatchService } from './job-match.service';
import { SkillGapService } from './skill-gap.service';

export interface ScreeningOutcome {
  screened: boolean;
  matchScore: number | null;
  requirementsTotal: number;
  requirementsCovered: number;
  missingRequirements: string[];
  requirementsSource: string;
  /** Why screening produced nothing, when it did. */
  skipped?: 'NOT_FOUND' | 'ALREADY_SCREENED' | 'ERROR';
}

const EMPTY: ScreeningOutcome = {
  screened: false,
  matchScore: null,
  requirementsTotal: 0,
  requirementsCovered: 0,
  missingRequirements: [],
  requirementsSource: 'NONE',
};

@Injectable()
export class ApplicationScreeningService {
  private readonly logger = new Logger(ApplicationScreeningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobMatch: JobMatchService,
    private readonly skillGap: SkillGapService,
    private readonly transitions: ApplicationTransitionService,
  ) {}

  /**
   * Screen one application and persist the snapshot.
   *
   * NEVER THROWS. The caller is the apply flow, and a candidate must not lose their
   * application because scoring failed — an unscreened row is recoverable, a rejected
   * submission is not.
   */
  async screen(applicationId: string): Promise<ScreeningOutcome> {
    try {
      const application = await this.prisma.application.findUnique({
        where: { id: applicationId },
        select: { id: true, userId: true, jobId: true, status: true, screenedAt: true },
      });
      if (!application) return { ...EMPTY, skipped: 'NOT_FOUND' };

      // A screening is a snapshot of the moment of applying; re-running it would rewrite
      // the record the employer already acted on.
      if (application.screenedAt) return { ...EMPTY, skipped: 'ALREADY_SCREENED' };

      const [match, gap] = await Promise.all([
        this.jobMatch.matchForJob(application.userId, application.jobId),
        this.skillGap.analyse(application.userId, application.jobId),
      ]);

      const outcome: ScreeningOutcome = {
        screened: true,
        matchScore: match ? Math.round(match.score) : null,
        requirementsTotal: gap.requirements.length,
        requirementsCovered: gap.matchedCount,
        missingRequirements: gap.missing,
        requirementsSource: gap.requirementsSource,
      };

      await this.prisma.application.update({
        where: { id: application.id },
        data: {
          screenedAt: new Date(),
          screenMatchScore: outcome.matchScore,
          screenRequirementsTotal: outcome.requirementsTotal,
          screenRequirementsCovered: outcome.requirementsCovered,
          screenMissingRequirements: outcome.missingRequirements,
          screenRequirementsSource: outcome.requirementsSource,
        },
      });

      // Only ever SUBMITTED -> SCREENING; anything further is the employer's call. The
      // guard stays because it decides whether a move is WANTED — an application an
      // employer already advanced needs no move, and asking for one would be an error
      // rather than a no-op. Whether the move is ALLOWED is the transition service's
      // question, and it answers it the same way for SYSTEM as for anyone else.
      if (application.status === 'SUBMITTED') {
        await this.transitions.transition({
          applicationId: application.id,
          newStatus: ApplicationStatus.SCREENING,
          actor: TransitionActor.SYSTEM,
          eventType: 'SCREENED',
          description:
            `Automatic screening: ${outcome.requirementsCovered} of ` +
            `${outcome.requirementsTotal} stated requirements evidenced by the résumé.`,
        });
      }

      return outcome;
    } catch (err) {
      // Deliberately swallowed. See the method contract above.
      this.logger.warn(
        `Screening failed for application ${applicationId}: ${(err as Error).message}`,
      );
      return { ...EMPTY, skipped: 'ERROR' };
    }
  }
}
