// src/modules/offer/dtos/offer-response.dto.ts
//
// Read models for offers. The seeker view embeds enough job info to render the
// offers dashboard; the employer view adds the candidate.

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Offer, OfferMessageAuthor, OfferStatus } from '@prisma/client';
import { ACCEPTABLE_FROM } from '@modules/application/domain/entities/application.entity';

/** One message in the negotiation about an offer, oldest first. */
export class OfferMessageDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: OfferMessageAuthor }) authorRole: OfferMessageAuthor;
  @ApiProperty() body: string;
  @ApiProperty() createdAt: Date;
  @ApiProperty({ description: 'Whether the recipient has seen it.' })
  read: boolean;
}

interface MessageRow {
  id: string;
  authorRole: OfferMessageAuthor;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}

const toMessage = (m: MessageRow): OfferMessageDto => ({
  id: m.id,
  authorRole: m.authorRole,
  body: m.body,
  createdAt: m.createdAt,
  read: m.readAt !== null,
});

/** Messages written by the OTHER party that this viewer has not read yet. */
const unreadFor = (messages: MessageRow[], viewer: OfferMessageAuthor): number =>
  messages.filter((m) => m.authorRole !== viewer && m.readAt === null).length;

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
  application: { id: string; userId: string; status: string; job: { id: string; title: string; companyId: string; location: string | null; remoteType: string; minSalary: number | null; maxSalary: number | null; company: { name: string } | null } };
  messages?: MessageRow[];
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

/** Offer statuses that claim the candidate has not replied yet. */
const DECIDABLE_OFFER_STATUSES: OfferStatus[] = ['EXTENDED', 'NEGOTIATING'];

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
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    deprecated: true,
    description:
      'DEPRECATED — superseded by `messages`. This column was used as a conversation and ' +
      'could not order, timestamp or attribute anything. Always null on new offers.',
  })
  notes: string | null;

  @ApiProperty({ type: [OfferMessageDto], description: 'The negotiation, oldest first.' })
  messages: OfferMessageDto[];

  @ApiProperty({ description: 'Messages from the employer you have not read.' })
  unreadCount: number;

  @ApiProperty() createdAt: Date;
  @ApiPropertyOptional({ type: String, nullable: true }) decidedAt: Date | null;
  @ApiProperty({ type: OfferJobDto }) job: OfferJobDto;

  @ApiProperty({
    description:
      "The application's own status. An offer is only as live as the process behind it.",
  })
  applicationStatus: string;

  @ApiProperty({
    description:
      'True when the offer still reads EXTENDED/NEGOTIATING but the application underneath ' +
      'it is already closed. Such an offer cannot be accepted or declined — clients must ' +
      'not present it as an open decision.',
  })
  lapsed: boolean;

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
    this.messages = (row.messages ?? []).map(toMessage);
    this.unreadCount = unreadFor(row.messages ?? [], 'CANDIDATE');
    this.createdAt = row.createdAt;
    this.decidedAt = row.decidedAt;
    this.job = jobOf(row);
    this.applicationStatus = row.application.status;
    // Derived here rather than filtered out of the query on purpose: the candidate DID
    // receive this offer, and deleting it from the response would rewrite their history to
    // tidy up a display problem. Reporting it as lapsed keeps the record and still stops
    // the UI offering a decision that cannot be made.
    this.lapsed =
      DECIDABLE_OFFER_STATUSES.includes(row.status) &&
      !(ACCEPTABLE_FROM as readonly string[]).includes(row.application.status);
  }
}

type EmployerOfferRow = OfferRow & {
  application: OfferRow['application'] & { user: { id: string; name: string | null; email: string } };
};

export class EmployerOfferResponseDto extends OfferResponseDto {
  @ApiProperty() candidate: { id: string; name: string; email: string };

  constructor(row: EmployerOfferRow) {
    super(row);
    // The inherited count is from the candidate's side; recount for this viewer.
    this.unreadCount = unreadFor(row.messages ?? [], 'EMPLOYER');
    this.candidate = {
      id: row.application.user.id,
      name: row.application.user.name ?? '',
      email: row.application.user.email,
    };
  }
}
