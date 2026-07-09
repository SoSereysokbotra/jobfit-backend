// src/modules/user/domain/entities/certification.entity.ts
//
// A single professional certification for a user.

import { Entity } from '@common/abstracts/entity';
import { VALIDATION } from '@common/constants/validation';

export interface CertificationProps {
  userId: string;
  name: string;
  issuer: string;
  credentialId?: string;
  credentialUrl?: string;
  issueDate: Date;
  expirationDate?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export class Certification extends Entity {
  userId: string;
  name: string;
  issuer: string;
  credentialId?: string;
  credentialUrl?: string;
  issueDate: Date;
  expirationDate?: Date;

  constructor(props: CertificationProps, id?: string) {
    super(props, id);

    if (!props.name || props.name.trim().length === 0) {
      throw new Error('name is required');
    }
    if (!props.issuer || props.issuer.trim().length === 0) {
      throw new Error('issuer is required');
    }
    if (props.credentialUrl && !VALIDATION.URL_REGEX.test(props.credentialUrl)) {
      throw new Error('credentialUrl must be a valid URL');
    }
    if (props.expirationDate && props.expirationDate < props.issueDate) {
      throw new Error('expirationDate cannot be before issueDate');
    }

    this.userId = props.userId;
    this.name = props.name;
    this.issuer = props.issuer;
    this.credentialId = props.credentialId;
    this.credentialUrl = props.credentialUrl;
    this.issueDate = props.issueDate;
    this.expirationDate = props.expirationDate;
  }

  static create(props: CertificationProps): Certification {
    return new Certification(props);
  }

  /** True when the certification has an expiration date in the past. */
  isExpired(): boolean {
    return (
      this.expirationDate !== undefined &&
      this.expirationDate.getTime() < Date.now()
    );
  }
}
