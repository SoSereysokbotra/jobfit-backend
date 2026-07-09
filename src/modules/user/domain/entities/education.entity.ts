// src/modules/user/domain/entities/education.entity.ts
//
// A single education record for a user.

import { Entity } from '@common/abstracts/entity';
import { DegreeLevel } from '@shared/kernel/enums/degree-level.enum';
import { VALIDATION } from '@common/constants/validation';

export interface EducationProps {
  userId: string;
  institution: string;
  degreeLevel: DegreeLevel;
  fieldOfStudy: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  gpa?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Education extends Entity {
  userId: string;
  institution: string;
  degreeLevel: DegreeLevel;
  fieldOfStudy: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  gpa?: number;

  constructor(props: EducationProps, id?: string) {
    super(props, id);

    if (!props.institution || props.institution.trim().length === 0) {
      throw new Error('institution is required');
    }
    if (props.institution.length > VALIDATION.NAME_MAX_LENGTH) {
      throw new Error(
        `institution must be at most ${VALIDATION.NAME_MAX_LENGTH} characters`,
      );
    }
    if (!props.fieldOfStudy || props.fieldOfStudy.trim().length === 0) {
      throw new Error('fieldOfStudy is required');
    }
    if (props.gpa !== undefined && (props.gpa < 0 || props.gpa > 4)) {
      throw new Error('gpa must be between 0.0 and 4.0');
    }
    if (props.endDate && props.endDate < props.startDate) {
      throw new Error('endDate cannot be before startDate');
    }

    this.userId = props.userId;
    this.institution = props.institution;
    this.degreeLevel = props.degreeLevel;
    this.fieldOfStudy = props.fieldOfStudy;
    this.description = props.description;
    this.startDate = props.startDate;
    this.endDate = props.endDate;
    this.gpa = props.gpa;
  }

  static create(props: EducationProps): Education {
    return new Education(props);
  }
}
