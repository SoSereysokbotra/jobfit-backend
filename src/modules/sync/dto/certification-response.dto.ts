// src/modules/sync/dto/certification-response.dto.ts
//
// Certifications have a Prisma model and a domain entity but no repository, service or
// controller yet (see the note at the foot of UserModule). They are part of the profile
// bundle the PWA caches, so sync reads them directly and projects them here.
//
// This DTO lives in the sync module deliberately: when the certification feature proper
// is built it should move to src/modules/user/application/dtos/ alongside its siblings,
// and this file should be deleted rather than left as a second source of truth.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The Prisma row shape this projects — declared locally so the sync service stays typed. */
export interface CertificationRow {
  id: string;
  userId: string;
  name: string;
  issuer: string;
  credentialId: string | null;
  credentialUrl: string | null;
  issueDate: Date;
  expirationDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class CertificationResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() name: string;
  @ApiProperty() issuer: string;
  @ApiPropertyOptional() credentialId?: string;
  @ApiPropertyOptional() credentialUrl?: string;
  @ApiProperty() issueDate: Date;
  @ApiPropertyOptional() expirationDate?: Date;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  constructor(row: CertificationRow) {
    this.id = row.id;
    this.userId = row.userId;
    this.name = row.name;
    this.issuer = row.issuer;
    this.credentialId = row.credentialId ?? undefined;
    this.credentialUrl = row.credentialUrl ?? undefined;
    this.issueDate = row.issueDate;
    this.expirationDate = row.expirationDate ?? undefined;
    this.createdAt = row.createdAt;
    this.updatedAt = row.updatedAt;
  }
}
