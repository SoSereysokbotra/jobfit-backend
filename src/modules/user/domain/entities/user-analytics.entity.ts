// src/modules/user/domain/entities/user-analytics.entity.ts
//
// Per-user funnel analytics (1:1 with User). The acceptance rates are derived from the
// counters and recomputed whenever a counter changes, then persisted (the `user_analytics`
// table stores them for cheap reporting/sorting).

import { Entity } from '@common/abstracts/entity';

export interface UserAnalyticsProps {
  userId: string;
  totalApplications?: number;
  totalInterviews?: number;
  totalOffers?: number;
  applicationAcceptanceRate?: number;
  interviewAcceptanceRate?: number;
  profileViewCount?: number;
  lastProfileViewDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class UserAnalytics extends Entity {
  userId: string;
  totalApplications: number;
  totalInterviews: number;
  totalOffers: number;
  applicationAcceptanceRate: number;
  interviewAcceptanceRate: number;
  profileViewCount: number;
  lastProfileViewDate?: Date;

  constructor(props: UserAnalyticsProps, id?: string) {
    super(props, id);

    if (!props.userId) throw new Error('userId is required');

    this.userId = props.userId;
    this.totalApplications = props.totalApplications ?? 0;
    this.totalInterviews = props.totalInterviews ?? 0;
    this.totalOffers = props.totalOffers ?? 0;
    this.applicationAcceptanceRate = props.applicationAcceptanceRate ?? 0;
    this.interviewAcceptanceRate = props.interviewAcceptanceRate ?? 0;
    this.profileViewCount = props.profileViewCount ?? 0;
    this.lastProfileViewDate = props.lastProfileViewDate;
  }

  static create(props: UserAnalyticsProps): UserAnalytics {
    return new UserAnalytics(props);
  }

  /** Record a new job application and refresh derived rates. */
  recordApplication(): void {
    this.totalApplications += 1;
    this.recalculateRates();
    this.updatedAt = new Date();
  }

  /** Record a new interview and refresh derived rates. */
  recordInterview(): void {
    this.totalInterviews += 1;
    this.recalculateRates();
    this.updatedAt = new Date();
  }

  /** Record a new offer and refresh derived rates. */
  recordOffer(): void {
    this.totalOffers += 1;
    this.recalculateRates();
    this.updatedAt = new Date();
  }

  /** Record a profile view. */
  recordProfileView(): void {
    this.profileViewCount += 1;
    this.lastProfileViewDate = new Date();
    this.updatedAt = new Date();
  }

  private recalculateRates(): void {
    this.applicationAcceptanceRate = this.calculateApplicationAcceptanceRate();
    this.interviewAcceptanceRate = this.calculateInterviewAcceptanceRate();
  }

  /** interviews / applications (0–1); 0 when there are no applications. */
  private calculateApplicationAcceptanceRate(): number {
    if (this.totalApplications === 0) return 0;
    return UserAnalytics.round(this.totalInterviews / this.totalApplications);
  }

  /** offers / interviews (0–1); 0 when there are no interviews. */
  private calculateInterviewAcceptanceRate(): number {
    if (this.totalInterviews === 0) return 0;
    return UserAnalytics.round(this.totalOffers / this.totalInterviews);
  }

  private static round(n: number): number {
    return Math.round(n * 10000) / 10000;
  }
}
