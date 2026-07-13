// src/modules/application/domain/entities/contact-person.entity.ts
//
// The recruiter / hiring-manager contact for an application (1:1 with Application).

import { Entity } from '@common/abstracts/entity';

export interface ContactPersonProps {
  applicationId: string;
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  linkedinUrl?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class ContactPerson extends Entity {
  applicationId: string;
  name: string;
  email?: string;
  phone?: string;
  title?: string;
  linkedinUrl?: string;

  constructor(props: ContactPersonProps, id?: string) {
    super(props, id);

    if (!props.applicationId) throw new Error('applicationId is required');
    if (!props.name || props.name.trim().length === 0) {
      throw new Error('name is required');
    }

    this.applicationId = props.applicationId;
    this.name = props.name;
    this.email = props.email;
    this.phone = props.phone;
    this.title = props.title;
    this.linkedinUrl = props.linkedinUrl;
  }

  static create(props: ContactPersonProps): ContactPerson {
    return new ContactPerson(props);
  }
}
