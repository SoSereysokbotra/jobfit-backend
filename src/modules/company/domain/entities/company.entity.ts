// src/modules/company/domain/entities/company.entity.ts
//
// Company entity. Uses the Location value object for city/state/country; the repository
// maps that to/from the flat Prisma columns.

import { Entity } from '@common/abstracts/entity';
import { Location } from '@shared/kernel/value-objects/location.vo';

export interface CompanyProps {
  name: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  industry?: string;
  size?: string; // STARTUP | SMALL | MEDIUM | LARGE | ENTERPRISE
  foundedYear?: number;
  location?: Location;
  glassdoorId?: string;
  glassdoorRating?: number;
  glassdoorReviews?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Company extends Entity {
  name: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  industry?: string;
  size?: string;
  foundedYear?: number;
  location?: Location;
  glassdoorId?: string;
  glassdoorRating?: number;
  glassdoorReviews?: number;

  constructor(props: CompanyProps, id?: string) {
    super(props, id);

    if (!props.name || props.name.trim().length === 0) {
      throw new Error('name is required');
    }

    this.name = props.name;
    this.description = props.description;
    this.website = props.website;
    this.logoUrl = props.logoUrl;
    this.industry = props.industry;
    this.size = props.size;
    this.foundedYear = props.foundedYear;
    this.location = props.location;
    this.glassdoorId = props.glassdoorId;
    this.glassdoorRating = props.glassdoorRating;
    this.glassdoorReviews = props.glassdoorReviews;
  }

  static create(props: CompanyProps): Company {
    return new Company(props);
  }

  /** Display name (the company name). */
  get displayName(): string {
    return this.name;
  }
}
