import { Injectable } from '@nestjs/common';
import { CandidateContext, JobContext, SubScores } from '../../domain/scoring/types';
import { scoreSkills } from '../../domain/scoring/skills-scorer';
import { scoreExperience } from '../../domain/scoring/experience-scorer';
import { scoreLocation } from '../../domain/scoring/location-scorer';
import { scoreSalary } from '../../domain/scoring/salary-scorer';
import {
  scoreOther,
  weightedMatch,
} from '../../domain/scoring/weighted-match.calculator';

export interface MatchResult {
  score: number;
  breakdown: SubScores;
}

/**
 * Combine the semantic similarity (skills, from embeddings) with the
 * deterministic sub-scores (experience/location/salary/other) into a single
 * weighted total. Pure — the caller supplies the pre-computed cosine similarity.
 */
@Injectable()
export class ComputeMatchScoreUseCase {
  execute(params: {
    candidate: CandidateContext;
    job: JobContext;
    cosineSim: number;
  }): MatchResult {
    const breakdown: SubScores = {
      skills: scoreSkills(params.cosineSim),
      experience: scoreExperience(params.candidate),
      location: scoreLocation(params.candidate, params.job),
      salary: scoreSalary(params.candidate, params.job),
      other: scoreOther(params.candidate, params.job),
    };
    return { score: weightedMatch(breakdown), breakdown };
  }
}
