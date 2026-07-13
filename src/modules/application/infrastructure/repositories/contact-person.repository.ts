// src/modules/application/infrastructure/repositories/contact-person.repository.ts
//
// Prisma-backed persistence for the ContactPerson row (1:1 with Application).

import { Injectable } from '@nestjs/common';
import { ContactPerson as PrismaContactPerson } from '@prisma/client';
import { PrismaService } from '@infra/prisma/prisma.service';
import { ContactPerson } from '../../domain/entities/contact-person.entity';

@Injectable()
export class ContactPersonRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(contactPerson: ContactPerson): Promise<void> {
    const fields = {
      name: contactPerson.name,
      email: contactPerson.email ?? null,
      phone: contactPerson.phone ?? null,
      title: contactPerson.title ?? null,
      linkedinUrl: contactPerson.linkedinUrl ?? null,
      updatedAt: contactPerson.updatedAt,
    };
    await this.prisma.contactPerson.upsert({
      where: { id: contactPerson.id },
      update: fields,
      create: {
        id: contactPerson.id,
        applicationId: contactPerson.applicationId,
        createdAt: contactPerson.createdAt,
        ...fields,
      },
    });
  }

  async findById(id: string): Promise<ContactPerson | null> {
    const row = await this.prisma.contactPerson.findUnique({ where: { id } });
    return row ? this.mapToDomain(row) : null;
  }

  async findByApplicationId(
    applicationId: string,
  ): Promise<ContactPerson | null> {
    const row = await this.prisma.contactPerson.findUnique({
      where: { applicationId },
    });
    return row ? this.mapToDomain(row) : null;
  }

  private mapToDomain(raw: PrismaContactPerson): ContactPerson {
    return new ContactPerson(
      {
        applicationId: raw.applicationId,
        name: raw.name,
        email: raw.email ?? undefined,
        phone: raw.phone ?? undefined,
        title: raw.title ?? undefined,
        linkedinUrl: raw.linkedinUrl ?? undefined,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      raw.id,
    );
  }
}
