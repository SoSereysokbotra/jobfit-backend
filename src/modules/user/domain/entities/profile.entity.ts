// src/modules/user/domain/entities/profile.entity.ts
//
// Profile entity (1:1 with User). Uses the Location and SalaryRange value objects for
// structured data; the repository maps those to/from the flat Prisma columns.

import { Entity } from '@common/abstracts/entity';
import { Location } from '@shared/kernel/value-objects/location.vo';
import { SalaryRange } from '@shared/kernel/value-objects/salary-range.vo';
import { JobLevel } from '@shared/kernel/enums/job-level.enum';
import { RemoteType } from '@shared/kernel/enums/remote-type.enum';
import { EmploymentType } from '@shared/kernel/enums/employment-type.enum';
import { VALIDATION } from '@common/constants/validation';

export interface ProfileProps {
  userId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  photoUrl?: string;
  bio?: string;
  headline?: string;
  location?: Location;
  desiredJobLevels?: JobLevel[];
  desiredRemoteTypes?: RemoteType[];
  desiredEmploymentTypes?: EmploymentType[];
  desiredIndustries?: string[];
  salaryRange?: SalaryRange;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkPreferences {
  jobLevels?: JobLevel[];
  remoteTypes?: RemoteType[];
  employmentTypes?: EmploymentType[];
  industries?: string[];
}

export class Profile extends Entity {
  userId: string;
  firstName: string;
  lastName: string;
  phone?: string;
  photoUrl?: string;
  bio?: string;
  headline?: string;
  location?: Location;
  desiredJobLevels: JobLevel[];
  desiredRemoteTypes: RemoteType[];
  desiredEmploymentTypes: EmploymentType[];
  desiredIndustries: string[];
  salaryRange?: SalaryRange;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;

  constructor(props: ProfileProps, id?: string) {
    super(props, id);

    if (!props.firstName || props.firstName.trim().length === 0) {
      throw new Error('firstName is required');
    }
    if (!props.lastName || props.lastName.trim().length === 0) {
      throw new Error('lastName is required');
    }
    if (props.bio && props.bio.length > VALIDATION.BIO_MAX_LENGTH) {
      throw new Error(`bio must be at most ${VALIDATION.BIO_MAX_LENGTH} characters`);
    }
    Profile.assertUrl('linkedinUrl', props.linkedinUrl);
    Profile.assertUrl('githubUrl', props.githubUrl);
    Profile.assertUrl('portfolioUrl', props.portfolioUrl);

    this.userId = props.userId;
    this.firstName = props.firstName;
    this.lastName = props.lastName;
    this.phone = props.phone;
    this.photoUrl = props.photoUrl;
    this.bio = props.bio;
    this.headline = props.headline;
    this.location = props.location;
    this.desiredJobLevels = props.desiredJobLevels ?? [];
    this.desiredRemoteTypes = props.desiredRemoteTypes ?? [];
    this.desiredEmploymentTypes = props.desiredEmploymentTypes ?? [];
    this.desiredIndustries = props.desiredIndustries ?? [];
    this.salaryRange = props.salaryRange;
    this.linkedinUrl = props.linkedinUrl;
    this.githubUrl = props.githubUrl;
    this.portfolioUrl = props.portfolioUrl;
  }

  static create(props: ProfileProps): Profile {
    return new Profile(props);
  }

  /** "First Last". */
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  /** Replace any of the desired-work-preference arrays that are provided. */
  updateWorkPreferences(prefs: WorkPreferences): void {
    if (prefs.jobLevels) this.desiredJobLevels = prefs.jobLevels;
    if (prefs.remoteTypes) this.desiredRemoteTypes = prefs.remoteTypes;
    if (prefs.employmentTypes) this.desiredEmploymentTypes = prefs.employmentTypes;
    if (prefs.industries) this.desiredIndustries = prefs.industries;
    this.updatedAt = new Date();
  }

  private static assertUrl(field: string, value?: string): void {
    if (value && !VALIDATION.URL_REGEX.test(value)) {
      throw new Error(`${field} must be a valid URL`);
    }
  }
}
