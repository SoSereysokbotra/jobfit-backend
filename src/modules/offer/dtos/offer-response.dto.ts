// src/modules/offer/dtos/offer-response.dto.ts
//
// Read models for offers. The seeker view embeds enough job info to render the
// offers dashboard; the employer view adds the candidate.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Offer, OfferStatus } from '@prisma/client';

/** Minimal job projection embedded in an offer (the dashboard builds a card from it). */
export class OfferJobDto {
  @ApiProperty() id: string;
  @ApiProperty() title: string;
  @ApiPropertyOptional({ type: String, nullable: true }) companyName: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) location: string | null;
  @ApiProperty() remoteType: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) minSalary: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) maxSalary: number | null;
}

type OfferRow = Offer & {
  application: { id: string; userId: string; job: { id: string; title: string; companyId: string; location: string | null; remoteType: string; minSalary: number | null; maxSalary: number | null; company: { name: string } | null } };
};

function jobOf(row: OfferRow): OfferJobDto {
  const j = row.application.job;
  return {
    id: j.id,
    title: j.title,
    companyName: j.company?.name ?? null,
    location: j.location,
    remoteType: j.remoteType,
    minSalary: j.minSalary,
    maxSalary: j.maxSalary,
  };
}

export class OfferResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() applicationId: string;
  @ApiProperty({ enum: OfferStatus }) status: OfferStatus;
  @ApiProperty() baseSalary: number;
  @ApiProperty() currency: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) signingBonus: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) annualBonusPct: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) equityShares: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) equityPrice: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) startDate: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) responseDeadline: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) notes: string | null;
  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional({ type: String, nullable: true }) decidedAt: Date | null;
  @ApiProperty({ type: OfferJobDto }) job: OfferJobDto;

  constructor(row: OfferRow) {
    this.id = row.id;
    this.applicationId = row.applicationId;
    this.status = row.status;
    this.baseSalary = row.baseSalary;
    this.currency = row.currency;
    this.signingBonus = row.signingBonus;
    this.annualBonusPct = row.annualBonusPct;
    this.equityShares = row.equityShares;
    this.equityPrice = row.equityPrice;
    this.startDate = row.startDate;
    this.responseDeadline = row.responseDeadline;
    this.notes = row.notes;
    this.createdAt = row.createdAt;
    this.decidedAt = row.decidedAt;
    this.job = jobOf(row);
  }
}

type EmployerOfferRow = OfferRow & {
  application: OfferRow['application'] & { user: { id: string; name: string | null; email: string } };
};

export class EmployerOfferResponseDto extends OfferResponseDto {
  @ApiProperty() candidate: { id: string; name: string; email: string };

  constructor(row: EmployerOfferRow) {
    super(row);
    this.candidate = {
      id: row.application.user.id,
      name: row.application.user.name ?? '',
      email: row.application.user.email,
    };
  }
}
