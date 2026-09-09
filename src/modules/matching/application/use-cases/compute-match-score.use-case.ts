import { Injectable } from '@nestjs/common';
import {
  CandidateContext,
  JobContext,
  MatchFlags,
  SubScores,
  TwoDimensionalScoreResult,
} from '../../domain/scoring/types';
import { scoreSkills } from '../../domain/scoring/skills-scorer';
import { scoreExperience } from '../../domain/scoring/experience-scorer';
import { scoreLocation } from '../../domain/scoring/location-scorer';
import { scoreSalary } from '../../domain/scoring/salary-scorer';
import { computeTwoDimensionalMatch } from '../../domain/scoring/weighted-match.calculator';

export interface MatchResult {
  /**
   * 0-100 ranking score — the GATED COMPOSITE, not the old linear weighted sum.
   *
   * Same field, same scale, different meaning: capability no longer buys back a
   * logistical no. See `computeTwoDimensionalMatch`.
   */
  score: number;
  /**
   * The five classic sub-scores, unchanged and still published.
   *
   * They are no longer summed into `score`, but they are the evidence BEHIND both
   * dimensions and clients already render them. Dropping them to "simplify" would remove
   * the only view a user has of why either dimension landed where it did.
   */
  breakdown: SubScores;
  /** 0-100 capability fit: skills + seniority. */
  roleFitScore: number;
  /** 0-100 logistics fit: arrangement/location, employment type, level, salary. */
  preferenceFitScore: number;
  band: TwoDimensionalScoreResult['band'];
  flags: MatchFlags;
  /** Highlights and warnings in one sentence. */
  explanation: string;
}

/**
 * Score one candidate against one job on BOTH dimensions.
 *
 * Capability (skills from the embedding cosine, seniority from the ladder) and logistics
 * (what the candidate explicitly asked for) are computed separately and combined by a
 * multiplicative gate, so a strong résumé can no longer carry a job the candidate cannot
 * take. Pure — the caller supplies the pre-computed cosine similarity.
 */
@Injectable()
export class ComputeMatchScoreUseCase {
  execute(params: {
    candidate: CandidateContext;
    job: JobContext;
    cosineSim: number;
    /** Job title, so the explanation can name the role. Optional. */
    title?: string | null;
  }): MatchResult {
    const breakdown: SubScores = {
      skills: scoreSkills(params.cosineSim),
      experience: scoreExperience(params.candidate, params.job),
      location: scoreLocation(params.candidate, params.job),
      salary: scoreSalary(params.candidate, params.job),
    };

    const twoDimensional = computeTwoDimensionalMatch({
      candidate: params.candidate,
      job: params.job,
      skills: breakdown.skills,
      experience: breakdown.experience,
      title: params.title,
    });

    return {
      score: twoDimensional.overallScore,
      breakdown,
      roleFitScore: twoDimensional.roleFitScore,
      preferenceFitScore: twoDimensional.preferenceFitScore,
      band: twoDimensional.band,
      flags: twoDimensional.flags,
      explanation: twoDimensional.explanation,
    };
  }
}
