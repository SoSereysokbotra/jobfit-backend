// src/modules/user/application/services/user-analytics.service.ts
//
// Read/increment a user's funnel analytics (1:1 with User). getAnalytics lazily creates a
// default row on first access; the record* methods delegate the counter/rate logic to the
// UserAnalytics entity, then persist.

import { Injectable, NotFoundException } from '@nestjs/common';
import { UserAnalyticsRepository } from '../../infrastructure/repositories/user-analytics.repository';
import { UserRepository } from '../../infrastructure/repositories/user.repository';
import { UserAnalytics } from '../../domain/entities/user-analytics.entity';
import { AnalyticsStatsResponseDto } from '../dtos/analytics-stats.dto';
import { ERROR_MESSAGES } from '@common/constants/error-messages';

@Injectable()
export class UserAnalyticsService {
  constructor(
    private readonly userAnalyticsRepository: UserAnalyticsRepository,
    private readonly userRepository: UserRepository,
  ) {}

  /** The user's analytics, creating a default entry on first access. */
  async getAnalytics(userId: string): Promise<UserAnalytics> {
    const existing = await this.userAnalyticsRepository.findByUserId(userId);
    if (existing) return existing;

    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundException(ERROR_MESSAGES.USER_NOT_FOUND);

    const analytics = UserAnalytics.create({ userId });
    await this.userAnalyticsRepository.save(analytics);
    return analytics;
  }

  /** Funnel + engagement stats for the user (Phase 11 — analytics feature). */
  async getMyStats(userId: string): Promise<AnalyticsStatsResponseDto> {
    const analytics = await this.getAnalytics(userId);
    return new AnalyticsStatsResponseDto(analytics);
  }

  async recordApplicationSubmitted(userId: string): Promise<void> {
    const analytics = await this.getAnalytics(userId);
    analytics.recordApplication();
    await this.userAnalyticsRepository.save(analytics);
  }

  async recordInterviewScheduled(userId: string): Promise<void> {
    const analytics = await this.getAnalytics(userId);
    analytics.recordInterview();
    await this.userAnalyticsRepository.save(analytics);
  }

  async recordOfferReceived(userId: string): Promise<void> {
    const analytics = await this.getAnalytics(userId);
    analytics.recordOffer();
    await this.userAnalyticsRepository.save(analytics);
  }

  async recordProfileView(userId: string): Promise<void> {
    const analytics = await this.getAnalytics(userId);
    analytics.recordProfileView();
    await this.userAnalyticsRepository.save(analytics);
  }
}
