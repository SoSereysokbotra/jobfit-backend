// src/modules/user/application/dtos/analytics-stats.dto.ts
//
// Funnel + engagement stats for the current user, derived from UserAnalytics.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserAnalytics } from '../../domain/entities/user-analytics.entity';

export class AnalyticsStatsResponseDto {
  @ApiProperty()
  totalApplications: number;

  @ApiProperty()
  totalInterviews: number;

  @ApiProperty()
  totalOffers: number;

  @ApiProperty({ description: 'Interviews / applications (0-1).' })
  applicationRate: number;

  @ApiProperty({ description: 'Offers / interviews (0-1).' })
  interviewRate: number;

  @ApiProperty({ description: 'Offers / applications (0-1).' })
  offerRate: number;

  @ApiProperty()
  profileViewCount: number;

  @ApiPropertyOptional()
  lastProfileViewDate?: Date;

  constructor(analytics: UserAnalytics) {
    this.totalApplications = analytics.totalApplications;
    this.totalInterviews = analytics.totalInterviews;
    this.totalOffers = analytics.totalOffers;
    // Reuse the entity's derived rates (applications→interviews, interviews→offers).
    this.applicationRate = analytics.applicationAcceptanceRate;
    this.interviewRate = analytics.interviewAcceptanceRate;
    this.offerRate =
      analytics.totalApplications > 0
        ? Math.round(
            (analytics.totalOffers / analytics.totalApplications) * 10000,
          ) / 10000
        : 0;
    this.profileViewCount = analytics.profileViewCount;
    this.lastProfileViewDate = analytics.lastProfileViewDate;
  }
}
