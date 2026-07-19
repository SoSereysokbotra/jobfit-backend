// src/modules/saved-job/saved-job.service.ts
//
// Business logic for saved jobs. Every mutation returns the user's full, refreshed
// list of saved job ids (newest first) — the client keeps that list in a cache and
// replaces it wholesale, so returning it saves a follow-up round-trip.

import { Injectable } from '@nestjs/common';
import { SavedJobRepository } from './infrastructure/repositories/saved-job.repository';

@Injectable()
export class SavedJobService {
  constructor(private readonly savedJobRepo: SavedJobRepository) {}

  /** The user's saved job ids, most-recently-saved first. */
  async listJobIds(userId: string): Promise<string[]> {
    return this.savedJobRepo.findJobIdsByUser(userId);
  }

  /** Save a job (idempotent). Returns the refreshed id list. */
  async save(userId: string, jobId: string): Promise<string[]> {
    await this.savedJobRepo.add(userId, jobId);
    return this.savedJobRepo.findJobIdsByUser(userId);
  }

  /** Remove a job from the saved list. Returns the refreshed id list. */
  async remove(userId: string, jobId: string): Promise<string[]> {
    await this.savedJobRepo.remove(userId, jobId);
    return this.savedJobRepo.findJobIdsByUser(userId);
  }

  /** Toggle a job's saved state. Returns the refreshed id list. */
  async toggle(userId: string, jobId: string): Promise<string[]> {
    const alreadySaved = await this.savedJobRepo.existsByUserAndJob(
      userId,
      jobId,
    );
    if (alreadySaved) {
      await this.savedJobRepo.remove(userId, jobId);
    } else {
      await this.savedJobRepo.add(userId, jobId);
    }
    return this.savedJobRepo.findJobIdsByUser(userId);
  }
}
