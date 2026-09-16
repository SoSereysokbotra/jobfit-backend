// src/modules/user/domain/entities/experience.entity.ts
//
// A single work-experience record for a user.

import { Entity } from '@common/abstracts/entity';
import { JobLevel } from '@shared/kernel/enums/job-level.enum';
import { EmploymentType } from '@shared/kernel/enums/employment-type.enum';
import { VALIDATION } from '@common/constants/validation';

export interface ExperienceProps {
  userId: string;
  company: string;
  title: string;
  jobLevel: JobLevel;
  employmentType: EmploymentType;
  industry: string;
  description?: string;
  isCurrentJob?: boolean;
  startDate?: Date | null;
  endDate?: Date;
  technologies?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class Experience extends Entity {
  userId: string;
  company: string;
  title: string;
  jobLevel: JobLevel;
  employmentType: EmploymentType;
  industry: string;
  description?: string;
  isCurrentJob: boolean;
  startDate?: Date | null;
  endDate?: Date;
  technologies: string[];

  constructor(props: ExperienceProps, id?: string) {
    super(props, id);

    if (!props.company || props.company.trim().length === 0) {
      throw new Error('company is required');
    }
    if (props.company.length > VALIDATION.NAME_MAX_LENGTH) {
      throw new Error(`company must be at most ${VALIDATION.NAME_MAX_LENGTH} characters`);
    }
    if (!props.title || props.title.trim().length === 0) {
      throw new Error('title is required');
    }
    if (props.description && props.description.length > VALIDATION.BIO_MAX_LENGTH) {
      throw new Error(`description must be at most ${VALIDATION.BIO_MAX_LENGTH} characters`);
    }
    // Only an ORDERING check, and only when both ends exist. With dates now optional,
    // an end date without a start is incomplete data, not invalid data.
    if (props.endDate && props.startDate && props.endDate < props.startDate) {
      throw new Error('endDate cannot be before startDate');
    }

    this.userId = props.userId;
    this.company = props.company;
    this.title = props.title;
    this.jobLevel = props.jobLevel;
    this.employmentType = props.employmentType;
    this.industry = props.industry;
    this.description = props.description;
    this.isCurrentJob = props.isCurrentJob ?? false;
    this.startDate = props.startDate;
    this.endDate = props.endDate;
    this.technologies = props.technologies ?? [];
  }

  static create(props: ExperienceProps): Experience {
    return new Experience(props);
  }

  /** Whether this is the user's current role. */
  isCurrentRole(): boolean {
    return this.isCurrentJob;
  }

  /**
   * Duration in years (to 1 decimal), or NULL when no start date was recorded.
   *
   * Null rather than 0: zero is a duration ("this lasted no time"), and a role with no
   * recorded dates has not been measured at all. Callers must render the difference.
   */
  getDuration(): number | null {
    if (!this.startDate) return null;
    const end = this.endDate ?? new Date();
    const years =
      (end.getTime() - this.startDate.getTime()) /
      (1000 * 60 * 60 * 24 * 365.25);
    return Math.max(0, Math.round(years * 10) / 10);
  }
}
